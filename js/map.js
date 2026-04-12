// ============================================================
// map.js — Procedural map generation + tile queries
// ============================================================

import {
    TILE_SIZE, MAP_COLS, MAP_ROWS, MAP_WIDTH, MAP_HEIGHT,
    TILE, ZONE, EXTRACTION_RADIUS,
    HEALTHPACK_RADIUS, CRATE_WIDTH, CRATE_HEIGHT
} from './constants.js';
import { randInt, generateId } from './utils.js';
import { createLootItemsForZone } from './profile.js';

// Generate the map — returns { tiles[][], walls[], lootCrates[], extractionPoints[], enemySpawns[], playerSpawn }
export function generateMap(seed) {
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
    const numRooms = randInt(12, 18);

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
    const clusterCount = randInt(20, 35);
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

    // ---------- Loot crates ----------
    const lootCrates = [];
    const addCrates = (count, zone) => {
        for (let i = 0; i < count; i++) {
            const pos = randomOpenPos(zone);
            const itemCount = randInt(1, 4);
            lootCrates.push({
                id: generateId(),
                x: pos.x,
                y: pos.y,
                w: CRATE_WIDTH,
                h: CRATE_HEIGHT,
                opened: false,
                inspected: false,
                items: createLootItemsForZone(zone, itemCount)
            });
        }
    };
    addCrates(10, ZONE.SAFE);
    addCrates(11, ZONE.COMBAT);
    addCrates(8, ZONE.HIGH_VALUE);

    // ---------- Health packs ----------
    const healthPacks = [];
    for (let i = 0; i < 10; i++) {
        const pos = randomOpenPos();
        healthPacks.push({
            id: generateId(), ...pos, radius: HEALTHPACK_RADIUS, collected: false
        });
    }

    // ---------- Extraction points (on map edges, in safe zone) ----------
    const extractionPoints = [];
    const edgePositions = [
        () => randomOpenPos(ZONE.SAFE, 2),
        () => ({ x: randInt(3, 8) * TILE_SIZE, y: randInt(10, MAP_ROWS - 10) * TILE_SIZE }),
        () => ({ x: (MAP_COLS - randInt(3, 8)) * TILE_SIZE, y: randInt(10, MAP_ROWS - 10) * TILE_SIZE }),
        () => ({ x: randInt(10, MAP_COLS - 10) * TILE_SIZE, y: randInt(3, 8) * TILE_SIZE }),
        () => ({ x: randInt(10, MAP_COLS - 10) * TILE_SIZE, y: (MAP_ROWS - randInt(3, 8)) * TILE_SIZE }),
    ];
    // Place 3 extraction points near edges
    for (let i = 1; i <= 4; i++) {
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
    for (let i = 0; i < 15; i++) {
        const pos = randomOpenPos(ZONE.COMBAT);
        enemySpawns.push({ ...pos, type: 'drone' });
    }
    // A few drones in safe
    for (let i = 0; i < 5; i++) {
        const pos = randomOpenPos(ZONE.SAFE);
        enemySpawns.push({ ...pos, type: 'drone' });
    }
    // Sentinels in high value
    for (let i = 0; i < 6; i++) {
        const pos = randomOpenPos(ZONE.HIGH_VALUE);
        enemySpawns.push({ ...pos, type: 'sentinel' });
    }
    // A couple sentinels in combat
    for (let i = 0; i < 3; i++) {
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

    return {
        tiles,
        zones,
        walls: wallsFinal,
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
