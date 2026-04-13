// ============================================================
// input.js — Keyboard & mouse input manager (command-pattern)
// ============================================================

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys = {};
        this.mouse = { x: 0, y: 0, down: false, clicked: false };
        this.rightClicked = false;

        // Command buffer (multiplayer-ready: serialize these)
        this.moveDir = { x: 0, y: 0 };
        this.aimWorld = { x: 0, y: 0 };
        this.shooting = false;
        this.dashRequested = false;
        this.interactRequested = false;
        this.modeToggleRequested = false;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp = this._onMouseUp.bind(this);
        this._onContextMenu = this._onContextMenu.bind(this);

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        canvas.addEventListener('mousemove', this._onMouseMove);
        canvas.addEventListener('mousedown', this._onMouseDown);
        canvas.addEventListener('mouseup', this._onMouseUp);
        canvas.addEventListener('contextmenu', this._onContextMenu);
    }

    _onKeyDown(e) {
        this.keys[e.code] = true;
        if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            this.dashRequested = true;
        }
        if (e.code === 'KeyF') {
            this.interactRequested = true;
        }
        if (e.code === 'KeyR') {
            this.modeToggleRequested = true;
        }
    }

    _onKeyUp(e) {
        this.keys[e.code] = false;
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
    }

    _onMouseDown(e) {
        if (e.button === 0) {
            this.mouse.down = true;
            this.mouse.clicked = true;
        }
        if (e.button === 2) {
            this.rightClicked = true;
        }
    }

    _onMouseUp(e) {
        if (e.button === 0) {
            this.mouse.down = false;
        }
    }

    _onContextMenu(e) {
        e.preventDefault();
    }

    // Call once per frame to build command state
    update(camera) {
        // Movement direction
        let mx = 0, my = 0;
        if (this.keys['KeyW'] || this.keys['ArrowUp']) my -= 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) my += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) mx -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) mx += 1;
        // Normalize diagonal
        if (mx !== 0 && my !== 0) {
            const inv = 1 / Math.SQRT2;
            mx *= inv;
            my *= inv;
        }
        this.moveDir.x = mx;
        this.moveDir.y = my;

        // Aim position in world coords
        if (camera) {
            this.aimWorld.x = this.mouse.x + camera.x;
            this.aimWorld.y = this.mouse.y + camera.y;
        }

        // Shooting
        this.shooting = this.mouse.down;
    }

    // Consume one-shot inputs after processing
    consume() {
        this.mouse.clicked = false;
        this.dashRequested = false;
        this.interactRequested = false;
        this.modeToggleRequested = false;
        this.rightClicked = false;
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        this.canvas.removeEventListener('mouseup', this._onMouseUp);
        this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    }
}
