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
            { rarity: 'white', weight: 0.68 },
            { rarity: 'green', weight: 0.24 },
            { rarity: 'blue', weight: 0.08 }
        ],
        [ZONE.COMBAT]: [
            { rarity: 'green', weight: 0.34 },
            { rarity: 'blue', weight: 0.38 },
            { rarity: 'purple', weight: 0.28 }
        ],
        [ZONE.HIGH_VALUE]: [
            { rarity: 'purple', weight: 0.94 },
            { rarity: 'gold', weight: 0.06 }
        ]
    },
    advanced: {
        [ZONE.SAFE]: [
            { rarity: 'green', weight: 0.58 },
            { rarity: 'blue', weight: 0.3 },
            { rarity: 'purple', weight: 0.12 }
        ],
        [ZONE.COMBAT]: [
            { rarity: 'blue', weight: 0.34 },
            { rarity: 'purple', weight: 0.38 },
            { rarity: 'gold', weight: 0.28 }
        ],
        [ZONE.HIGH_VALUE]: [
            { rarity: 'gold', weight: 0.94 },
            { rarity: 'red', weight: 0.06 }
        ]
    },
    hell: {
        [ZONE.SAFE]: [
            { rarity: 'blue', weight: 0.54 },
            { rarity: 'purple', weight: 0.34 },
            { rarity: 'gold', weight: 0.12 }
        ],
        [ZONE.COMBAT]: [
            { rarity: 'purple', weight: 0.34 },
            { rarity: 'gold', weight: 0.4 },
            { rarity: 'red', weight: 0.26 }
        ],
        [ZONE.HIGH_VALUE]: [
            { rarity: 'red', weight: 1 }
        ]
    },
    chaos: {
        [ZONE.SAFE]: [],
        [ZONE.COMBAT]: [],
        [ZONE.HIGH_VALUE]: []
    }
};

const DIFFICULTY_ENEMY_COUNTS = {
    easy: { combatDrones: 15, safeDrones: 5, highSentinels: 6, combatSentinels: 3 },
    advanced: { combatDrones: 15, safeDrones: 5, highSentinels: 6, combatSentinels: 3 },
    hell: { combatDrones: 60, safeDrones: 20, highSentinels: 28, combatSentinels: 14 },
    chaos: { combatDrones: 320, safeDrones: 100, highSentinels: 140, combatSentinels: 90 },
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
        const pool = cratePools[zone] || cratePools[ZONE.SAFE];
        for (let i = 0; i < count; i++) {
            const pos = randomOpenPos(zone);
            const crateRarity = pickWeightedRarity(pool);
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
        addCrates(1, ZONE.COMBAT);
    } else {
        addCrates(Math.round(10 * areaScale), ZONE.SAFE);
        addCrates(Math.round(11 * areaScale), ZONE.COMBAT);
        addCrates(Math.round(8 * areaScale), ZONE.HIGH_VALUE);
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
        playerSpawn
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
