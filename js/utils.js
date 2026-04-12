// ============================================================
// utils.js — Math helpers, collision, and shared utilities
// ============================================================

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function distSq(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
}

export function normalize(x, y) {
    const len = Math.sqrt(x * x + y * y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
}

export function angleBetween(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

export function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Circle vs Circle collision
export function circleCollision(x1, y1, r1, x2, y2, r2) {
    const d = distSq(x1, y1, x2, y2);
    const rSum = r1 + r2;
    return d <= rSum * rSum;
}

// Circle vs AABB (axis-aligned bounding box) collision
export function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= (cr * cr);
}

// Resolve circle out of AABB — pushes circle outside rect
export function resolveCircleRect(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    const dSq = dx * dx + dy * dy;
    if (dSq === 0) {
        // Center is inside rect — push out the shortest axis
        const overlapLeft = cx - rx + cr;
        const overlapRight = (rx + rw) - cx + cr;
        const overlapTop = cy - ry + cr;
        const overlapBottom = (ry + rh) - cy + cr;
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if (minOverlap === overlapLeft) return { x: rx - cr, y: cy };
        if (minOverlap === overlapRight) return { x: rx + rw + cr, y: cy };
        if (minOverlap === overlapTop) return { x: cx, y: ry - cr };
        return { x: cx, y: ry + rh + cr };
    }
    if (dSq >= cr * cr) return { x: cx, y: cy }; // no collision
    const d = Math.sqrt(dSq);
    const overlap = cr - d;
    const nx = dx / d;
    const ny = dy / d;
    return { x: cx + nx * overlap, y: cy + ny * overlap };
}

// Simple line-of-sight check (raycast vs array of rects)
export function hasLineOfSight(x1, y1, x2, y2, walls, steps = 20) {
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + (x2 - x1) * t;
        const py = y1 + (y2 - y1) * t;
        for (const w of walls) {
            if (px >= w.x && px <= w.x + w.w && py >= w.y && py <= w.y + w.h) {
                return false;
            }
        }
    }
    return true;
}

// Generate a unique ID
let _idCounter = 0;
export function generateId() {
    return ++_idCounter;
}

export function resetIdCounter() {
    _idCounter = 0;
}
