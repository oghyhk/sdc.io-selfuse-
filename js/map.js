// ============================================================
// map.js — Procedural map generation + tile queries
// ============================================================

import {
    TILE_SIZE, MAP_COLS, MAP_ROWS, MAP_WIDTH, MAP_HEIGHT,
    TILE, ZONE, EXTRACTION_RADIUS,
    HEALTHPACK_RADIUS, CRATE_WIDTH, CRATE_HEIGHT,
    setMapSize
} from './constants.js';
import { randInt, generateId } from './utils.js';
import { createLootItemsForCrateRarity, getCrateTierMeta } from './profile.js';

const DIFFICULTY_CRATE_POOLS = {
    easy: {
        [ZONE.SAFE]: [
            { rarity: 'white', weight: 0.64 },
            { rarity: 'green', weight: 0.24 },
            { rarity: 'blue', weight: 0.08 },
            { rarity: 'purple', weight: 0.04 }
        ],
        [ZONE.COMBAT]: [
            { rarity: 'green', weight: 0.34 },
            { rarity: 'blue', weight: 0.38 },
            { rarity: 'purple', weight: 0.27 },
            { rarity: 'gold', weight: 0.01 }
        ],
        [ZONE.HIGH_VALUE]: [
            { rarity: 'purple', weight: 0.95 },
            { rarity: 'gold', weight: 0.05 }
        ]
    },
    advanced: {
        [ZONE.SAFE]: [
            { rarity: 'green', weight: 0.58 },
            { rarity: 'blue', weight: 0.30 },
            { rarity: 'purple', weight: 0.12 }
        ],
        [ZONE.COMBAT]: [
            { rarity: 'blue', weight: 0.34 },
            { rarity: 'purple', weight: 0.58 },
            { rarity: 'gold', weight: 0.08 }
        ],
        [ZONE.HIGH_VALUE]: [
            { rarity: 'purple', weight: 0.50 },
            { rarity: 'gold', weight: 0.44 },
            { rarity: 'red', weight: 0.06 }
        ]
    },
    hell: {
        [ZONE.SAFE]: [
            { rarity: 'blue', weight: 0.64 },
            { rarity: 'purple', weight: 0.34 },
            { rarity: 'gold', weight: 0.02 }
        ],
        [ZONE.COMBAT]: [
            { rarity: 'purple', weight: 0.54 },
            { rarity: 'gold', weight: 0.40 },
            { rarity: 'red', weight: 0.06 }
        ],
        [ZONE.HIGH_VALUE]: [
            { rarity: 'gold', weight: 0.60 },
            { rarity: 'red', weight: 0.40 }
        ]
    },
    chaos: {
        [ZONE.SAFE]: [
            { rarity: 'blue', weight: 0.30 },
            { rarity: 'purple', weight: 0.50 },
            { rarity: 'gold', weight: 0.18 },
            { rarity: 'red', weight: 0.02 }
        ],
        [ZONE.COMBAT]: [
            { rarity: 'purple', weight: 0.20 },
            { rarity: 'gold', weight: 0.58 },
            { rarity: 'red', weight: 0.22 }
        ],
        [ZONE.HIGH_VALUE]: [
            { rarity: 'red', weight: 1 }
        ]
    }
};

const DIFFICULTY_ENEMY_COUNTS = {
    easy: { combatDrones: 15, safeDrones: 5, highSentinels: 6, combatSentinels: 3 },
    advanced: { combatDrones: 15, safeDrones: 5, highSentinels: 6, combatSentinels: 3 },
    hell: { combatDrones: 60, safeDrones: 20, highSentinels: 28, combatSentinels: 14 },
    chaos: { combatDrones: 160, safeDrones: 50, highSentinels: 70, combatSentinels: 45 },
};

function pickWeightedRarity(pool) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of pool) {
        roll -= entry.weight;
        if (roll <= 0) return entry.rarity;
    }
    return pool[pool.length - 1]?.rarity || 'white';
}

// Map dimension presets per difficulty (base 80×60)
const MAP_SIZE_PRESETS = {
    easy:     { cols: 80,  rows: 60  },  // 1×
    advanced: { cols: 80,  rows: 60  },  // 1×
    hell:     { cols: 160, rows: 120 },  // 4× area
    chaos:    { cols: 320, rows: 240 },  // 16× area
};

// How many extraction points per difficulty
const EXTRACTION_COUNTS = {
    easy: 4,
    advanced: 4,
    hell: 2,
    chaos: 1,
};

// Generate the map — returns { tiles[][], walls[], lootCrates[], extractionPoints[], enemySpawns[], playerSpawn }
function _entrancePos(dir, ringDist, centerR, centerC) {
    const row = dir === 'N' ? centerR - ringDist : dir === 'S' ? centerR + ringDist : centerR;
    const col = dir === 'W' ? centerC - ringDist : dir === 'E' ? centerC + ringDist : centerC;
    return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2, dir };
}

export function generateMap(options = {}) {
    const difficulty = typeof options === 'string' ? options : options?.difficulty || 'advanced';
    const cratePools = DIFFICULTY_CRATE_POOLS[difficulty] || DIFFICULTY_CRATE_POOLS.advanced;
    const enemyCounts = DIFFICULTY_ENEMY_COUNTS[difficulty] || DIFFICULTY_ENEMY_COUNTS.advanced;

    // ── Set map dimensions for this difficulty ──
    const preset = MAP_SIZE_PRESETS[difficulty] || MAP_SIZE_PRESETS.advanced;
    setMapSize(preset.cols, preset.rows);

    // Area scale factor relative to base (80×60 = 4800 tiles)
    const areaScale = (MAP_COLS * MAP_ROWS) / (80 * 60);

    // Seeded RNG not critical for MVP — using Math.random
    const tiles = [];
    for (let r = 0; r < MAP_ROWS; r++) {
        tiles[r] = [];
        for (let c = 0; c < MAP_COLS; c++) {
            tiles[r][c] = TILE.FLOOR;
        }
    }

    // Border walls
    for (let r = 0; r < MAP_ROWS; r++) {
        tiles[r][0] = TILE.WALL;
        tiles[r][MAP_COLS - 1] = TILE.WALL;
    }
    for (let c = 0; c < MAP_COLS; c++) {
        tiles[0][c] = TILE.WALL;
        tiles[MAP_ROWS - 1][c] = TILE.WALL;
    }

    // ---------- Rooms & structures ----------
    const rooms = [];
    const numRooms = randInt(Math.round(12 * areaScale), Math.round(18 * areaScale));

    for (let i = 0; i < numRooms; i++) {
        const rw = randInt(4, 10);
        const rh = randInt(4, 8);
        const rx = randInt(2, MAP_COLS - rw - 2);
        const ry = randInt(2, MAP_ROWS - rh - 2);

        // Check overlap with existing rooms (with margin)
        let overlap = false;
        for (const room of rooms) {
            if (rx < room.x + room.w + 2 && rx + rw + 2 > room.x &&
                ry < room.y + room.h + 2 && ry + rh + 2 > room.y) {
                overlap = true;
                break;
            }
        }
        if (overlap) continue;

        rooms.push({ x: rx, y: ry, w: rw, h: rh });

        // Draw room walls
        for (let r = ry; r < ry + rh; r++) {
            for (let c = rx; c < rx + rw; c++) {
                if (r === ry || r === ry + rh - 1 || c === rx || c === rx + rw - 1) {
                    tiles[r][c] = TILE.WALL;
                } else {
                    tiles[r][c] = TILE.FLOOR_DARK;
                }
            }
        }

        // Door openings (1-2 per room)
        const doorCount = randInt(1, 2);
        for (let d = 0; d < doorCount; d++) {
            const side = randInt(0, 3);
            let dr, dc;
            if (side === 0) { dr = ry; dc = randInt(rx + 1, rx + rw - 2); }           // top
            else if (side === 1) { dr = ry + rh - 1; dc = randInt(rx + 1, rx + rw - 2); } // bottom
            else if (side === 2) { dr = randInt(ry + 1, ry + rh - 2); dc = rx; }         // left
            else { dr = randInt(ry + 1, ry + rh - 2); dc = rx + rw - 1; }               // right
            if (dr > 0 && dr < MAP_ROWS - 1 && dc > 0 && dc < MAP_COLS - 1) {
                tiles[dr][dc] = TILE.FLOOR;
            }
        }
    }

    // ---------- Scatter some random wall clusters ----------
    const clusterCount = randInt(Math.round(20 * areaScale), Math.round(35 * areaScale));
    for (let i = 0; i < clusterCount; i++) {
        const cx = randInt(3, MAP_COLS - 4);
        const cy = randInt(3, MAP_ROWS - 4);
        const size = randInt(1, 3);
        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const r = cy + dy;
                const c = cx + dx;
                if (r > 0 && r < MAP_ROWS - 1 && c > 0 && c < MAP_COLS - 1) {
                    tiles[r][c] = TILE.WALL;
                }
            }
        }
    }

    // ---------- Connectivity fix: ensure no closed-off areas ----------
    ensureConnectivity(tiles, MAP_ROWS, MAP_COLS);

    // ---------- Build walls array (rects for collision) ----------
    const walls = [];
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            if (tiles[r][c] === TILE.WALL) {
                walls.push({
                    x: c * TILE_SIZE,
                    y: r * TILE_SIZE,
                    w: TILE_SIZE,
                    h: TILE_SIZE,
                    row: r,
                    col: c
                });
            }
        }
    }

    // ---------- Zone assignment ----------
    const zones = [];
    // Center area = HIGH_VALUE, middle ring = COMBAT, outer = SAFE
    for (let r = 0; r < MAP_ROWS; r++) {
        zones[r] = [];
        for (let c = 0; c < MAP_COLS; c++) {
            const dcx = Math.abs(c - MAP_COLS / 2) / (MAP_COLS / 2);
            const dcy = Math.abs(r - MAP_ROWS / 2) / (MAP_ROWS / 2);
            const d = Math.max(dcx, dcy);
            if (d < 0.25) zones[r][c] = ZONE.HIGH_VALUE;
            else if (d < 0.6) zones[r][c] = ZONE.COMBAT;
            else zones[r][c] = ZONE.SAFE;
        }
    }

    // ---------- Zone wall rings with fixed entrances ----------
    buildZoneWalls(tiles, zones, MAP_ROWS, MAP_COLS, difficulty);

    // ---------- Compute entrance positions for minimap ----------
    const entrances = [];
    const halfDim = Math.min(MAP_COLS / 2, MAP_ROWS / 2);
    const hvOuter = Math.round(0.25 * halfDim);
    const combatOuter = Math.round(0.6 * halfDim);
    const centerR = Math.floor(MAP_ROWS / 2);
    const centerC = Math.floor(MAP_COLS / 2);
    // Combat ring entrances: N, S, E, W
    for (const dir of ['N', 'S', 'E', 'W']) {
        entrances.push(_entrancePos(dir, combatOuter, centerR, centerC));
    }
    // HV ring entrances
    const hvEntrances = difficulty === 'chaos' ? ['N'] : ['N', 'E', 'W'];
    for (const dir of hvEntrances) {
        entrances.push(_entrancePos(dir, hvOuter, centerR, centerC));
    }

    // ---------- Find open floor positions ----------
    function isOpenFloor(r, c) {
        return r > 0 && r < MAP_ROWS - 1 && c > 0 && c < MAP_COLS - 1 &&
            tiles[r][c] !== TILE.WALL;
    }

    function randomOpenPos(zone, margin = 3) {
        for (let attempts = 0; attempts < 200; attempts++) {
            const c = randInt(margin, MAP_COLS - margin - 1);
            const r = randInt(margin, MAP_ROWS - margin - 1);
            if (isOpenFloor(r, c) && (zone === undefined || zones[r][c] === zone)) {
                return { x: c * TILE_SIZE + TILE_SIZE / 2, y: r * TILE_SIZE + TILE_SIZE / 2 };
            }
        }
        // Fallback
        return { x: MAP_WIDTH / 4, y: MAP_HEIGHT / 4 };
    }

    // ---------- Loot crates with tiers ----------
    const lootCrates = [];
    const addCrates = (count, zone) => {
        for (let i = 0; i < count; i++) {
            let pos, crateRarity;
            if (zone === 'safe' || zone === 'guaranteed_safe') {
                // Safe crate: guaranteed, placed in high-value zone
                pos = randomOpenPos(ZONE.HIGH_VALUE, 3);
                crateRarity = 'safe';
            } else {
                const pool = cratePools[zone] || cratePools[ZONE.SAFE];
                pos = randomOpenPos(zone);
                crateRarity = pickWeightedRarity(pool);
            }
            const tierMeta = getCrateTierMeta(crateRarity);
            lootCrates.push({
                id: generateId(),
                x: pos.x,
                y: pos.y,
                w: CRATE_WIDTH,
                h: CRATE_HEIGHT,
                opened: false,
                inspected: false,
                tier: crateRarity,
                tierLabel: tierMeta.label,
                tierColor: tierMeta.color,
                items: createLootItemsForCrateRarity(crateRarity)
            });
        }
    };
    if (difficulty === 'chaos') {
        addCrates(300, ZONE.SAFE);
        addCrates(1, 'safe'); // +1 safe in safe zone
        addCrates(80, ZONE.COMBAT);
        addCrates(1, 'safe'); // +1 safe in combat zone
        addCrates(22, ZONE.HIGH_VALUE);
        // +3 safe in high-value zone
        for (let i = 0; i < 3; i++) addCrates(1, 'safe');
    } else if (difficulty === 'hell') {
        addCrates(80, ZONE.SAFE);
        addCrates(40, ZONE.COMBAT);
        addCrates(18, ZONE.HIGH_VALUE);
        addCrates(1, 'safe'); // +1 safe in high-value zone
    } else if (difficulty === 'advanced') {
        addCrates(40, ZONE.SAFE);
        addCrates(18, ZONE.COMBAT);
        addCrates(12, ZONE.HIGH_VALUE);
    } else {
        // easy
        addCrates(10, ZONE.SAFE);
        addCrates(11, ZONE.COMBAT);
        addCrates(8, ZONE.HIGH_VALUE);
    }

    // ---------- Health packs ----------
    const healthPacks = [];
    const healthPackCount = Math.round(10 * areaScale);
    for (let i = 0; i < healthPackCount; i++) {
        const pos = randomOpenPos();
        healthPacks.push({
            id: generateId(), ...pos, radius: HEALTHPACK_RADIUS, collected: false
        });
    }

    // ---------- Extraction points (on map edges, in safe zone) ----------
    const extractionPoints = [];
    const extractCount = EXTRACTION_COUNTS[difficulty] || 4;

    // Chaos: single extraction in high-value area (center of map)
    if (difficulty === 'chaos') {
        const pos = randomOpenPos(ZONE.HIGH_VALUE, 3);
        const col = Math.floor(pos.x / TILE_SIZE);
        const row = Math.floor(pos.y / TILE_SIZE);
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const rr = clampRow(row + dr);
                const cc = clampCol(col + dc);
                if (tiles[rr][cc] === TILE.WALL && rr > 0 && rr < MAP_ROWS - 1 && cc > 0 && cc < MAP_COLS - 1) {
                    tiles[rr][cc] = TILE.FLOOR;
                }
            }
        }
        extractionPoints.push({
            id: generateId(), x: pos.x, y: pos.y, radius: EXTRACTION_RADIUS
        });
    } else {
    const edgePositions = [
        () => randomOpenPos(ZONE.SAFE, 2),
        () => ({ x: randInt(3, 8) * TILE_SIZE, y: randInt(10, MAP_ROWS - 10) * TILE_SIZE }),
        () => ({ x: (MAP_COLS - randInt(3, 8)) * TILE_SIZE, y: randInt(10, MAP_ROWS - 10) * TILE_SIZE }),
        () => ({ x: randInt(10, MAP_COLS - 10) * TILE_SIZE, y: randInt(3, 8) * TILE_SIZE }),
        () => ({ x: randInt(10, MAP_COLS - 10) * TILE_SIZE, y: (MAP_ROWS - randInt(3, 8)) * TILE_SIZE }),
    ];
    // Place extraction points near edges (skip index 0 which is a random safe-zone point)
    for (let i = 1; i <= Math.min(extractCount, edgePositions.length - 1); i++) {
        const pos = edgePositions[i]();
        // Make sure it's on open floor
        const col = Math.floor(pos.x / TILE_SIZE);
        const row = Math.floor(pos.y / TILE_SIZE);
        // Clear walls around extraction
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const rr = clampRow(row + dr);
                const cc = clampCol(col + dc);
                if (tiles[rr][cc] === TILE.WALL && rr > 0 && rr < MAP_ROWS - 1 && cc > 0 && cc < MAP_COLS - 1) {
                    tiles[rr][cc] = TILE.FLOOR;
                }
            }
        }
        extractionPoints.push({
            id: generateId(), x: pos.x, y: pos.y, radius: EXTRACTION_RADIUS
        });
    }
    } // end else (non-chaos)

    // ---------- Enemy spawns ----------
    const enemySpawns = [];
    // Drones in combat zone
    for (let i = 0; i < enemyCounts.combatDrones; i++) {
        const pos = randomOpenPos(ZONE.COMBAT);
        enemySpawns.push({ ...pos, type: 'drone' });
    }
    // A few drones in safe
    for (let i = 0; i < enemyCounts.safeDrones; i++) {
        const pos = randomOpenPos(ZONE.SAFE);
        enemySpawns.push({ ...pos, type: 'drone' });
    }
    // Sentinels in high value
    for (let i = 0; i < enemyCounts.highSentinels; i++) {
        const pos = randomOpenPos(ZONE.HIGH_VALUE);
        enemySpawns.push({ ...pos, type: 'sentinel' });
    }
    // A couple sentinels in combat
    for (let i = 0; i < enemyCounts.combatSentinels; i++) {
        const pos = randomOpenPos(ZONE.COMBAT);
        enemySpawns.push({ ...pos, type: 'sentinel' });
    }

    // ---------- Player spawn (safe zone, near edge) ----------
    const playerSpawn = randomOpenPos(ZONE.SAFE, 4);

    // Rebuild walls array after extraction clearing
    const wallsFinal = [];
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            if (tiles[r][c] === TILE.WALL) {
                wallsFinal.push({
                    x: c * TILE_SIZE,
                    y: r * TILE_SIZE,
                    w: TILE_SIZE,
                    h: TILE_SIZE,
                    row: r,
                    col: c
                });
            }
        }
    }

    // Build navigation grid for A* pathfinding
    const navGrid = buildNavGrid(tiles, MAP_ROWS, MAP_COLS);

    return {
        tiles,
        zones,
        walls: wallsFinal,
        navGrid,
        navRows: MAP_ROWS,
        navCols: MAP_COLS,
        lootCrates,
        healthPacks,
        extractionPoints,
        enemySpawns,
        playerSpawn,
        entrances
    };
}

function clampRow(r) { return Math.max(0, Math.min(MAP_ROWS - 1, r)); }
function clampCol(c) { return Math.max(0, Math.min(MAP_COLS - 1, c)); }

// Get nearby walls for collision (spatial query)
export function getNearbyWalls(x, y, radius, walls) {
    const margin = radius + TILE_SIZE;
    return walls.filter(w =>
        Math.abs(w.x + w.w / 2 - x) < margin + w.w / 2 &&
        Math.abs(w.y + w.h / 2 - y) < margin + w.h / 2
    );
}

// Spatial hash for walls (precomputed)
export class WallGrid {
    constructor(walls, cellSize = TILE_SIZE * 4) {
        this.cellSize = cellSize;
        this.grid = new Map();
        for (const w of walls) {
            const minCX = Math.floor(w.x / cellSize);
            const maxCX = Math.floor((w.x + w.w) / cellSize);
            const minCY = Math.floor(w.y / cellSize);
            const maxCY = Math.floor((w.y + w.h) / cellSize);
            for (let cy = minCY; cy <= maxCY; cy++) {
                for (let cx = minCX; cx <= maxCX; cx++) {
                    const key = `${cx},${cy}`;
                    if (!this.grid.has(key)) this.grid.set(key, []);
                    this.grid.get(key).push(w);
                }
            }
        }
    }

    getNearby(x, y, radius) {
        const cs = this.cellSize;
        const minCX = Math.floor((x - radius) / cs);
        const maxCX = Math.floor((x + radius) / cs);
        const minCY = Math.floor((y - radius) / cs);
        const maxCY = Math.floor((y + radius) / cs);
        const result = new Set();
        for (let cy = minCY; cy <= maxCY; cy++) {
            for (let cx = minCX; cx <= maxCX; cx++) {
                const key = `${cx},${cy}`;
                const cell = this.grid.get(key);
                if (cell) cell.forEach(w => result.add(w));
            }
        }
        return Array.from(result);
    }
}

// ── Connectivity: flood-fill & corridor carving ──────────────────

/**
 * Flood-fill from (startR, startC). Returns a Set of "r,c" keys for all
 * reachable floor tiles.
 */
function floodFill(tiles, rows, cols, startR, startC) {
    const visited = new Set();
    const stack = [[startR, startC]];
    while (stack.length) {
        const [r, c] = stack.pop();
        const key = `${r},${c}`;
        if (visited.has(key)) continue;
        if (r <= 0 || r >= rows - 1 || c <= 0 || c >= cols - 1) continue;
        if (tiles[r][c] === TILE.WALL) continue;
        visited.add(key);
        stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
    }
    return visited;
}

/**
 * Find all connected components of non-wall tiles.
 * Returns an array of Sets, each containing "r,c" keys.
 */
function findConnectedComponents(tiles, rows, cols) {
    const globalVisited = new Set();
    const components = [];
    for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
            if (tiles[r][c] === TILE.WALL) continue;
            const key = `${r},${c}`;
            if (globalVisited.has(key)) continue;
            const comp = floodFill(tiles, rows, cols, r, c);
            comp.forEach(k => globalVisited.add(k));
            components.push(comp);
        }
    }
    return components;
}

/**
 * Carve a straight-line corridor between two tile positions, clearing walls.
 * Uses L-shaped path (horizontal then vertical).
 */
function carveCorridor(tiles, rows, cols, r1, c1, r2, c2) {
    // Horizontal segment
    const cMin = Math.min(c1, c2);
    const cMax = Math.max(c1, c2);
    for (let c = cMin; c <= cMax; c++) {
        if (r1 > 0 && r1 < rows - 1 && c > 0 && c < cols - 1) {
            if (tiles[r1][c] === TILE.WALL) tiles[r1][c] = TILE.FLOOR;
        }
    }
    // Vertical segment
    const rMin = Math.min(r1, r2);
    const rMax = Math.max(r1, r2);
    for (let r = rMin; r <= rMax; r++) {
        if (r > 0 && r < rows - 1 && c2 > 0 && c2 < cols - 1) {
            if (tiles[r][c2] === TILE.WALL) tiles[r][c2] = TILE.FLOOR;
        }
    }
}

/**
 * Ensure all walkable areas are connected. Finds connected components,
 * picks the largest as the main region, and carves corridors from each
 * smaller region to the main one.
 */
function ensureConnectivity(tiles, rows, cols) {
    const components = findConnectedComponents(tiles, rows, cols);
    if (components.length <= 1) return; // already connected

    // Find largest component
    let mainIdx = 0;
    for (let i = 1; i < components.length; i++) {
        if (components[i].size > components[mainIdx].size) mainIdx = i;
    }
    const mainComp = components[mainIdx];

    // For each other component, carve a corridor to the main one
    for (let i = 0; i < components.length; i++) {
        if (i === mainIdx) continue;
        const island = components[i];

        // Pick a representative tile from the island
        const islandTile = island.values().next().value;
        const [ir, ic] = islandTile.split(',').map(Number);

        // Find the closest tile in the main component
        let bestKey = null;
        let bestDist = Infinity;
        for (const key of mainComp) {
            const [mr, mc] = key.split(',').map(Number);
            const d = Math.abs(mr - ir) + Math.abs(mc - ic); // Manhattan distance
            if (d < bestDist) {
                bestDist = d;
                bestKey = key;
            }
        }

        if (bestKey) {
            const [mr, mc] = bestKey.split(',').map(Number);
            carveCorridor(tiles, rows, cols, ir, ic, mr, mc);
            // After carving, add island tiles to main so subsequent corridors
            // can connect through it
            for (const key of island) mainComp.add(key);
        }
    }
}

/**
 * Build a compact navigation grid from the tile map for A* pathfinding.
 * Returns a Uint8Array where 0 = walkable, 1 = blocked.
 * Access: navGrid[row * cols + col]
 */
export function buildNavGrid(tiles, rows, cols) {
    const grid = new Uint8Array(rows * cols);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            grid[r * cols + c] = tiles[r][c] === TILE.WALL ? 1 : 0;
        }
    }
    return grid;
}

// ── Zone wall rings ──────────────────────────────────────────────────────────
// Surrounds each zone ring with walls, leaving a fixed number of entrances.
//  - COMBAT ring: 4 entrances (North/South/East/West)
//  - HIGH_VALUE (normal): 3 entrances
//  - HIGH_VALUE (chaos): 1 entrance (North only)
//  - All extraction points remain in SAFE zones.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the radius boundaries of each zone ring in tile units.
 * Returns { combatInner, combatOuter, hvInner, hvOuter }.
 * The COMBAT ring spans [combatInner, combatOuter].
 * The HIGH_VALUE ring spans [hvInner, combatInner).
 * The SAFE zone is everything outside combatOuter.
 */
export function getZoneRadii(rows, cols) {
    // d = max(|dcx|, |dcy|) where dcx = (c - cols/2)/(cols/2), dcy = (r - rows/2)/(rows/2)
    //   0 ≤ d < 0.25  → HIGH_VALUE
    //   0.25 ≤ d < 0.6 → COMBAT
    //   d ≥ 0.6        → SAFE
    // Solve for tile units: d < threshold  →  max(|dcx|,|dcy|) < thr
    //   |dcx| < thr  →  |c - cols/2| < thr * cols/2
    //   |dcy| < thr  →  |r - rows/2| < thr * rows/2
    // So in tile units:
    //   hvInner  = cols/2 - 0.25 * cols/2  = cols * 0.375
    //   combatOuter = cols/2 + 0.6 * cols/2  = cols * 0.8   (same for rows)
    // Actually we want a single radius per ring, so let's use the tighter bound
    // from the column dimension (MAP_WIDTH >= MAP_HEIGHT in base presets).
    // To keep the rings concentric and symmetric, use the same formula for
    // both axes and take max() — which is how the zone d is computed.
    const halfCols = cols / 2;
    const halfRows = rows / 2;

    // Ring boundaries in tile units
    // HV: d < 0.25  → tile dist < 0.25 * halfDim
    // COMBAT: 0.25 ≤ d < 0.6  → tile dist ∈ [0.25*halfDim, 0.6*halfDim)
    // SAFE: d ≥ 0.6

    // Use the same halfDim for both axes (match zone assignment's max(dcx,dcy))
    const halfDim = Math.min(halfCols, halfRows); // the tighter radius

    const hvOuter  = Math.floor(0.25 * halfDim);       // HV ring outer edge
    const combatInner = hvOuter;                         // COMBAT inner = HV outer
    const combatOuter = Math.floor(0.6  * halfDim);     // COMBAT outer edge

    return { hvInner: 0, hvOuter, combatInner, combatOuter };
}

/**
 * Place a single corridor entrance through a wall ring.
 * Wall positions are computed from the center using Chebyshev distance.
 * For rectangular maps, the south wall is at halfRows + ringDist (not rows-1-ringDist)
 * and the east wall is at halfCols + ringDist (not cols-1-ringDist), because the
 * zone boundary is a Chebyshev circle centered on the map, not symmetric around edges.
 *
 * @param {number[][]} tiles         - tile grid (modified in place)
 * @param {number} rows              - number of rows
 * @param {number} cols              - number of columns
 * @param {number} ringDist          - tile distance from center to the ring wall
 * @param {string} direction         - 'N' | 'S' | 'E' | 'W'
 * @param {number} entranceWidth      - how many tiles wide the opening is (1 or 2)
 */
function carveEntrance(tiles, rows, cols, ringDist, direction, entranceWidth) {
    const halfRows = Math.floor(rows / 2);
    const halfCols = Math.floor(cols / 2);
    const half = Math.floor(entranceWidth / 2);

    // All four wall positions (Chebyshev circle centered on map center)
    const wallRowN = halfRows - ringDist;  // north wall row
    const wallRowS = halfRows + ringDist;  // south wall row
    const wallColW = halfCols - ringDist;  // west wall col
    const wallColE = halfCols + ringDist;  // east wall col

    if (direction === 'N') {
        const colStart = halfCols - half;
        for (let dc = 0; dc < entranceWidth; dc++) {
            const c = colStart + dc;
            const r = wallRowN;
            if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) {
                tiles[r][c] = TILE.FLOOR;
            }
        }
    } else if (direction === 'S') {
        const colStart = halfCols - half;
        for (let dc = 0; dc < entranceWidth; dc++) {
            const c = colStart + dc;
            const r = wallRowS;
            if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) {
                tiles[r][c] = TILE.FLOOR;
            }
        }
    } else if (direction === 'W') {
        const rowStart = halfRows - half;
        for (let dr = 0; dr < entranceWidth; dr++) {
            const r = rowStart + dr;
            const c = wallColW;
            if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) {
                tiles[r][c] = TILE.FLOOR;
            }
        }
    } else if (direction === 'E') {
        const rowStart = halfRows - half;
        for (let dr = 0; dr < entranceWidth; dr++) {
            const r = rowStart + dr;
            const c = wallColE;
            if (r > 0 && r < rows - 1 && c > 0 && c < cols - 1) {
                tiles[r][c] = TILE.FLOOR;
            }
        }
    }
}

/**
 * Build a solid wall ring around a rectangular boundary.
 * Walls are placed on the perimeter at distance `dist` from center on all 4 sides,
 * with corridor entrances carved at cardinal directions.
 *
 * @param {number[][]} tiles   - tile grid (modified in place)
 * @param {number[][]} zones    - zone grid (read-only)
 * @param {number} rows         - map rows
 * @param {number} cols         - map cols
 * @param {number} innerDist    - inner edge of the ring (in tiles from center)
 * @param {number} outerDist    - outer edge of the ring (in tiles from center)
 * @param {string[]} entrances   - list of directions to carve ('N','S','E','W')
 * @param {number} entranceWidth - width of each entrance in tiles
 */
function buildWallRing(tiles, zones, rows, cols, innerDist, outerDist, entrances, entranceWidth) {
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);

    // Place a 1-tile-wide wall ring at every boundary tile of the ring band
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Compute Chebyshev distance from center (matches zone d calculation)
            const dcx = Math.abs(c - centerCol) / (cols / 2);
            const dcy = Math.abs(r - centerRow) / (rows / 2);
            const d = Math.max(dcx, dcy);

            // Convert tile dist to the same 0-1 scale as zone boundaries
            const halfDim = Math.min(cols / 2, rows / 2);
            const tileDist = Math.max(dcx, dcy); // already normalised 0-1

            // Check if this tile lies on the ring boundary (outer or inner edge)
            const outerThreshold = outerDist / halfDim;
            const innerThreshold = innerDist / halfDim;

            const isOnOuterEdge = Math.abs(tileDist - outerThreshold) < (1 / halfDim / 2);
            const isOnInnerEdge = innerDist > 0 && Math.abs(tileDist - innerThreshold) < (1 / halfDim / 2);

            if (isOnOuterEdge || isOnInnerEdge) {
                // Only wall non-wall floor tiles (don't overwrite border or room walls)
                if (tiles[r][c] !== TILE.WALL) {
                    tiles[r][c] = TILE.WALL;
                }
            }
        }
    }

    // Carve entrance corridors through the ring
    for (const dir of entrances) {
        // Place the entrance opening at the midpoint of each side
        const wallDist = Math.round(outerDist);
        carveEntrance(tiles, rows, cols, wallDist, dir, entranceWidth);
        // Also open the inner edge if this is a double ring (innerDist > 0)
        if (innerDist > 0) {
            carveEntrance(tiles, rows, cols, Math.round(innerDist), dir, entranceWidth);
        }
    }
}

/**
 * Main entry point — called from generateMap() after zone assignment
 * and before open-floor position finding.
 *
 * Layout per difficulty:
 *   easy / advanced / hell:
 *     - COMBAT ring surrounded by walls → 4 entrances (N, S, E, W)
 *     - HIGH_VALUE surrounded by walls → 3 entrances (N, E, W — no South)
 *   chaos:
 *     - COMBAT ring surrounded by walls → 4 entrances
 *     - HIGH_VALUE surrounded by walls → 1 entrance (N only)
 *
 * Extraction points are placed later (always in SAFE zone) and
 * the wall-carving there clears a small area, so no conflict.
 */
function buildZoneWalls(tiles, zones, rows, cols, difficulty) {
    const centerCol = Math.floor(cols / 2);
    const centerRow = Math.floor(rows / 2);

    // Determine ring radii in tile units
    // Use the tighter half-dimension so rings are perfectly square visually
    const halfDim = Math.min(cols / 2, rows / 2);

    // Ring boundaries at zone thresholds (0.25 and 0.6 of halfDim)
    const hvOuter     = Math.round(0.25 * halfDim); // inner boundary of COMBAT
    const combatOuter = Math.round(0.6  * halfDim); // outer boundary of COMBAT = edge of SAFE

    // ── COMBAT zone wall ring ──────────────────────────────────────────────
    // The combat ring is the band: [hvOuter, combatOuter] tiles from center.
    // Build walls at hvOuter and combatOuter, leaving 4 entrances.
    buildWallRing(tiles, zones, rows, cols, hvOuter, combatOuter, ['N', 'S', 'E', 'W'], 2);

    // ── HIGH_VALUE zone wall ring ────────────────────────────────────────
    // HV is d < 0.25, so its outer boundary is hvOuter tiles from center.
    // Build walls at hvOuter, with entrances per difficulty.
    const hvEntrances = difficulty === 'chaos' ? ['N'] : ['N', 'E', 'W'];
    buildWallRing(tiles, zones, rows, cols, 0, hvOuter, hvEntrances, 2);
}
