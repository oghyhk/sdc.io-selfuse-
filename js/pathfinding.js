// ============================================================
// pathfinding.js — A* pathfinding on the tile grid + path cache
// ============================================================

import { TILE_SIZE, MAP_COLS, MAP_ROWS } from './constants.js';

// ── Binary Min-Heap for A* open set ─────────────────────────

class MinHeap {
    constructor() { this.data = []; }

    push(node) {
        this.data.push(node);
        this._bubbleUp(this.data.length - 1);
    }

    pop() {
        const top = this.data[0];
        const last = this.data.pop();
        if (this.data.length > 0) {
            this.data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    get size() { return this.data.length; }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.data[i].f < this.data[parent].f) {
                [this.data[i], this.data[parent]] = [this.data[parent], this.data[i]];
                i = parent;
            } else break;
        }
    }

    _sinkDown(i) {
        const n = this.data.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this.data[left].f < this.data[smallest].f) smallest = left;
            if (right < n && this.data[right].f < this.data[smallest].f) smallest = right;
            if (smallest !== i) {
                [this.data[i], this.data[smallest]] = [this.data[smallest], this.data[i]];
                i = smallest;
            } else break;
        }
    }
}

// ── 4-directional + diagonal neighbors ──────────────────────

const DIRS = [
    { dr: -1, dc:  0, cost: 1 },     // up
    { dr:  1, dc:  0, cost: 1 },     // down
    { dr:  0, dc: -1, cost: 1 },     // left
    { dr:  0, dc:  1, cost: 1 },     // right
    { dr: -1, dc: -1, cost: 1.414 }, // up-left
    { dr: -1, dc:  1, cost: 1.414 }, // up-right
    { dr:  1, dc: -1, cost: 1.414 }, // down-left
    { dr:  1, dc:  1, cost: 1.414 }, // down-right
];

// ── A* pathfinding ──────────────────────────────────────────

/**
 * A* on the navigation grid.
 * @param {Uint8Array} navGrid  - flat grid (0 = walkable, 1 = wall), row * cols + col
 * @param {number} rows         - grid rows
 * @param {number} cols         - grid cols
 * @param {number} sr           - start row
 * @param {number} sc           - start col
 * @param {number} er           - end row
 * @param {number} ec           - end col
 * @param {number} maxNodes     - safety cap to prevent freezing on huge maps
 * @returns {Array<{r: number, c: number}>|null} - array of tiles from start to end, or null
 */
export function astar(navGrid, rows, cols, sr, sc, er, ec, maxNodes = 8000) {
    // Bounds / wall check
    if (sr < 0 || sr >= rows || sc < 0 || sc >= cols) return null;
    if (er < 0 || er >= rows || ec < 0 || ec >= cols) return null;
    if (navGrid[sr * cols + sc] === 1) return null; // start in wall
    if (navGrid[er * cols + ec] === 1) {
        // End in wall — find nearest walkable tile to the goal
        const alt = nearestWalkable(navGrid, rows, cols, er, ec);
        if (!alt) return null;
        er = alt.r;
        ec = alt.c;
    }
    if (sr === er && sc === ec) return [{ r: sr, c: sc }];

    const heuristic = (r, c) => {
        // Octile distance
        const dr = Math.abs(r - er);
        const dc = Math.abs(c - ec);
        return Math.max(dr, dc) + 0.414 * Math.min(dr, dc);
    };

    const gMap = new Float32Array(rows * cols).fill(Infinity);
    const cameFrom = new Int32Array(rows * cols).fill(-1);
    const closed = new Uint8Array(rows * cols);

    const startIdx = sr * cols + sc;
    gMap[startIdx] = 0;

    const open = new MinHeap();
    open.push({ r: sr, c: sc, f: heuristic(sr, sc) });

    let visited = 0;

    while (open.size > 0) {
        const current = open.pop();
        const { r, c } = current;
        const idx = r * cols + c;

        if (closed[idx]) continue;
        closed[idx] = 1;
        visited++;

        if (r === er && c === ec) {
            // Reconstruct path
            return reconstructPath(cameFrom, cols, sr, sc, er, ec);
        }

        if (visited >= maxNodes) {
            // Return best partial path toward goal
            return reconstructPath(cameFrom, cols, sr, sc, r, c);
        }

        const gCurrent = gMap[idx];

        for (const dir of DIRS) {
            const nr = r + dir.dr;
            const nc = c + dir.dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            const nIdx = nr * cols + nc;
            if (navGrid[nIdx] === 1 || closed[nIdx]) continue;

            // For diagonal moves, check that both cardinal neighbors are walkable
            // to prevent cutting through wall corners
            if (dir.dr !== 0 && dir.dc !== 0) {
                if (navGrid[r * cols + nc] === 1 || navGrid[nr * cols + c] === 1) continue;
            }

            const gNew = gCurrent + dir.cost;
            if (gNew < gMap[nIdx]) {
                gMap[nIdx] = gNew;
                cameFrom[nIdx] = idx;
                open.push({ r: nr, c: nc, f: gNew + heuristic(nr, nc) });
            }
        }
    }

    return null; // no path found
}

function reconstructPath(cameFrom, cols, sr, sc, er, ec) {
    const path = [];
    let idx = er * cols + ec;
    const startIdx = sr * cols + sc;
    while (idx !== startIdx && idx !== -1) {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        path.push({ r, c });
        idx = cameFrom[idx];
    }
    path.push({ r: sr, c: sc });
    path.reverse();
    return path;
}

/**
 * Find the nearest walkable tile to (r, c) using BFS.
 */
function nearestWalkable(navGrid, rows, cols, r, c) {
    const queue = [[r, c]];
    const visited = new Set();
    visited.add(`${r},${c}`);
    while (queue.length > 0) {
        const [cr, cc] = queue.shift();
        if (navGrid[cr * cols + cc] === 0) return { r: cr, c: cc };
        for (const dir of DIRS) {
            const nr = cr + dir.dr;
            const nc = cc + dir.dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            const key = `${nr},${nc}`;
            if (visited.has(key)) continue;
            visited.add(key);
            queue.push([nr, nc]);
        }
    }
    return null;
}

// ── Path smoothing ──────────────────────────────────────────

/**
 * Simplify the A* path by removing redundant waypoints using line-of-sight
 * checks on the nav grid. Keeps the path walkable but with fewer turns.
 */
export function smoothPath(path, navGrid, rows, cols) {
    if (!path || path.length <= 2) return path;
    const result = [path[0]];
    let anchor = 0;

    for (let i = 2; i < path.length; i++) {
        if (!gridLineOfSight(navGrid, rows, cols, path[anchor].r, path[anchor].c, path[i].r, path[i].c)) {
            result.push(path[i - 1]);
            anchor = i - 1;
        }
    }
    result.push(path[path.length - 1]);
    return result;
}

/**
 * Grid-based Bresenham line-of-sight: returns true if no wall tiles
 * are crossed between (r1,c1) and (r2,c2).
 */
function gridLineOfSight(navGrid, rows, cols, r1, c1, r2, c2) {
    let dr = Math.abs(r2 - r1);
    let dc = Math.abs(c2 - c1);
    let sr = r1 < r2 ? 1 : -1;
    let sc = c1 < c2 ? 1 : -1;
    let err = dr - dc;
    let r = r1, c = c1;

    while (true) {
        if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
        if (navGrid[r * cols + c] === 1) return false;
        if (r === r2 && c === c2) return true;
        const e2 = 2 * err;
        if (e2 > -dc) { err -= dc; r += sr; }
        if (e2 < dr) { err += dr; c += sc; }
    }
}

// ── High-level helpers for AI ───────────────────────────────

/**
 * Convert pixel coords to tile coords.
 */
export function pixelToTile(px, py) {
    return {
        r: Math.floor(py / TILE_SIZE),
        c: Math.floor(px / TILE_SIZE),
    };
}

/**
 * Convert tile coords to pixel center.
 */
export function tileToPixel(r, c) {
    return {
        x: c * TILE_SIZE + TILE_SIZE / 2,
        y: r * TILE_SIZE + TILE_SIZE / 2,
    };
}

/**
 * Compute a smoothed A* path from pixel start to pixel end.
 * Returns an array of pixel waypoints [{x, y}, ...] or null.
 */
export function findPath(navGrid, rows, cols, startX, startY, endX, endY) {
    const start = pixelToTile(startX, startY);
    const end = pixelToTile(endX, endY);

    const tilePath = astar(navGrid, rows, cols, start.r, start.c, end.r, end.c);
    if (!tilePath || tilePath.length === 0) return null;

    const smoothed = smoothPath(tilePath, navGrid, rows, cols);

    // Convert to pixel waypoints
    const waypoints = smoothed.map(t => tileToPixel(t.r, t.c));

    // Replace first/last with exact pixel positions for precision
    waypoints[0] = { x: startX, y: startY };
    if (waypoints.length > 1) {
        waypoints[waypoints.length - 1] = { x: endX, y: endY };
    }

    return waypoints;
}
