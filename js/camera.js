// ============================================================
// camera.js — Smooth-follow camera
// ============================================================

import { CAMERA_LERP, MAP_WIDTH, MAP_HEIGHT } from './constants.js';
import { lerp, clamp } from './utils.js';

export class Camera {
    constructor(canvasWidth, canvasHeight) {
        this.x = 0; // top-left in world coords
        this.y = 0;
        this.width = canvasWidth;
        this.height = canvasHeight;
    }

    follow(targetX, targetY, dt) {
        const desiredX = targetX - this.width / 2;
        const desiredY = targetY - this.height / 2;
        // Smooth lerp (framerate-independent)
        const t = 1 - Math.pow(1 - CAMERA_LERP, dt * 60);
        this.x = lerp(this.x, desiredX, t);
        this.y = lerp(this.y, desiredY, t);
        // Clamp to map bounds
        this.x = clamp(this.x, 0, MAP_WIDTH - this.width);
        this.y = clamp(this.y, 0, MAP_HEIGHT - this.height);
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
    }

    // Check if a world-space rect is visible
    isVisible(x, y, w, h) {
        return x + w > this.x && x < this.x + this.width &&
               y + h > this.y && y < this.y + this.height;
    }

    // Convert world to screen
    worldToScreen(wx, wy) {
        return { x: wx - this.x, y: wy - this.y };
    }
}
