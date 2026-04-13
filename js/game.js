// ============================================================
// game.js — Main game loop, state machine, and integration
// ============================================================

import { generateMap, WallGrid } from './map.js';
import { InputManager } from './input.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { AudioManager } from './audio.js';
import {
    EXTRACTION_RADIUS, EXTRACTION_TIME, LOOT_PICKUP_RANGE, CRATE_INTERACT_RANGE,
    HEALTHPACK_HEAL, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, COLORS, CRATE_WIDTH, CRATE_HEIGHT
} from './constants.js';
import {
    dist, circleCollision, circleRectCollision, clamp, resetIdCounter
} from './utils.js';
import { getItemDefinition, getRarityMeta } from './profile.js';

// Game states
export const GAME_STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    DEAD: 'dead',
    EXTRACTED: 'extracted',
};

export class Game {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.state = GAME_STATE.MENU;
        this.onStateChange = options.onStateChange || null;
        this.onExtraction = options.onExtraction || null;

        this._resize();
        window.addEventListener('resize', () => this._resize());

        this.input = new InputManager(canvas);
        this.camera = new Camera(canvas.width, canvas.height);
        this.renderer = new Renderer(this.ctx, this.camera);
        this.audio = new AudioManager();

        // Game data (initialized on start)
        this.mapData = null;
        this.wallGrid = null;
        this.player = null;
        this.enemies = [];
        this.bullets = [];
        this.gameTime = 0;
        this.extracting = false;
        this.extractTimer = 0;
        this.extractZone = null;
        this.openCrateId = null;
        this.nearbyCrateId = null;
        this.crateMessage = '';
        this.activeProfile = null;
        this.lastExtractSummary = null;
        this._deathHandled = false;

        // Particles (simple)
        this.particles = [];

        // Stats for end screen
        this.stats = { kills: 0, lootCollected: 0, timeSurvived: 0 };

        // Canvas click listener for returning from post-run screens
        this._canvasClickHandler = () => {
            if (this.state === GAME_STATE.DEAD || this.state === GAME_STATE.EXTRACTED) {
                this.goToMenu();
            }
        };
        canvas.addEventListener('click', this._canvasClickHandler);

        // Last frame time
        this._lastTime = 0;
        this._running = true;

        // Start loop
        requestAnimationFrame((t) => this._loop(t));
    }

    _setState(nextState) {
        this.state = nextState;
        if (this.onStateChange) {
            this.onStateChange(nextState);
        }
    }

    _resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.camera) {
            this.camera.resize(this.canvas.width, this.canvas.height);
        }
    }

    startGame(profile) {
        this.audio.init();
        this.activeProfile = profile || null;
        this._startGame();
    }

    goToMenu() {
        this._setState(GAME_STATE.MENU);
    }

    _startGame() {
        resetIdCounter();
        this._setState(GAME_STATE.PLAYING);
        this.gameTime = 0;
        this.bullets = [];
        this.particles = [];
        this.extracting = false;
        this.extractTimer = 0;
        this.lastExtractSummary = null;
        this._deathHandled = false;
        this.openCrateId = null;
        this.nearbyCrateId = null;
        this.crateMessage = '';
        this.stats = { kills: 0, lootCollected: 0, timeSurvived: 0 };

        // Generate map
        this.mapData = generateMap();
        this.wallGrid = new WallGrid(this.mapData.walls);

        // Create player
        this.player = new Player(
            this.mapData.playerSpawn.x,
            this.mapData.playerSpawn.y,
            this.activeProfile?.loadout || {}
        );

        // Create enemies
        this.enemies = [];
        for (const spawn of this.mapData.enemySpawns) {
            this.enemies.push(new Enemy(spawn.x, spawn.y, spawn.type));
        }

        // Camera snap to player
        this.camera.x = this.player.x - this.camera.width / 2;
        this.camera.y = this.player.y - this.camera.height / 2;
    }

    _loop(timestamp) {
        if (!this._running) return;

        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.05); // cap at 50ms
        this._lastTime = timestamp;

        this.input.update(this.camera);

        if (this.state === GAME_STATE.PLAYING) {
            this._update(dt);
        }

        this._render();
        this.input.consume();

        requestAnimationFrame((t) => this._loop(t));
    }

    // ==================== UPDATE ====================
    _update(dt) {
        this.gameTime += dt;
        this.stats.timeSurvived = this.gameTime;

        // Track bullet count before player update (to detect new shots)
        const bulletsBefore = this.bullets.length;
        const wasDashing = this.player.dashing;

        // Player
        this.player.update(dt, this.input, this.wallGrid, this.bullets);

        // Detect player shot
        if (this.bullets.length > bulletsBefore) {
            const newBullet = this.bullets[this.bullets.length - 1];
            if (newBullet.owner === 'player') this.audio.playShoot();
        }

        // Detect player dash
        if (!wasDashing && this.player.dashing) {
            this.audio.playDash();
        }

        // Check player death
        if (!this.player.alive) {
            if (!this._deathHandled) {
                this._deathHandled = true;
                this.audio.playDeath();
            }
            this._setState(GAME_STATE.DEAD);
            return;
        }

        // Enemies
        const bulletsBeforeEnemies = this.bullets.length;
        for (const enemy of this.enemies) {
            enemy.update(dt, this.player, this.wallGrid, this.mapData.walls, this.bullets);
        }
        // Detect enemy shots
        if (this.bullets.length > bulletsBeforeEnemies) {
            this.audio.playEnemyShoot();
        }

        // Bullets
        this._updateBullets(dt);

        // Health pack pickup
        this._checkHealthPickup();

        // Loot crates
        this._updateCrateState(dt);
        this._handleCrateInteraction();

        // Extraction
        this._checkExtraction(dt);

        // Particles
        this._updateParticles(dt);

        // Camera
        this.camera.follow(this.player.x, this.player.y, dt);
    }

    _updateBullets(dt) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;

            // Remove if expired or out of bounds
            if (b.life <= 0 || b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Wall collision
            const nearWalls = this.wallGrid.getNearby(b.x, b.y, b.radius);
            let hitWall = false;
            for (const w of nearWalls) {
                if (circleRectCollision(b.x, b.y, b.radius, w.x, w.y, w.w, w.h)) {
                    hitWall = true;
                    // Spawn impact particle
                    this._spawnParticles(b.x, b.y, b.owner === 'player' ? COLORS.BULLET_PLAYER : COLORS.BULLET_ENEMY, 3);
                    break;
                }
            }
            if (hitWall) {
                this.bullets.splice(i, 1);
                continue;
            }

            // Hit detection
            if (b.owner === 'player') {
                // Hit enemies
                for (const e of this.enemies) {
                    if (!e.alive) continue;
                    if (circleCollision(b.x, b.y, b.radius, e.x, e.y, e.radius)) {
                        e.takeDamage(b.damage);
                        this._spawnParticles(b.x, b.y, COLORS.ENEMY_DRONE, 5);
                        this.audio.playHit();
                        if (!e.alive) {
                            this.stats.kills++;
                            this._spawnParticles(e.x, e.y, e.type === 'drone' ? COLORS.ENEMY_DRONE : COLORS.ENEMY_SENTINEL, 12);
                        }
                        this.bullets.splice(i, 1);
                        break;
                    }
                }
            } else if (b.owner === 'enemy') {
                // Hit player
                if (this.player.alive && circleCollision(b.x, b.y, b.radius, this.player.x, this.player.y, this.player.radius)) {
                    this.player.takeDamage(b.damage);
                    this._spawnParticles(b.x, b.y, COLORS.PLAYER, 5);
                    this.bullets.splice(i, 1);
                }
            }
        }
    }

    _checkHealthPickup() {
        for (const hp of this.mapData.healthPacks) {
            if (hp.collected) continue;
            if (this.player.hp >= this.player.maxHp) continue;
            const d = dist(this.player.x, this.player.y, hp.x, hp.y);
            if (d < LOOT_PICKUP_RANGE + this.player.radius) {
                hp.collected = true;
                this.player.heal(HEALTHPACK_HEAL);
                this._spawnParticles(hp.x, hp.y, COLORS.HEALTHPACK, 6);
                this.audio.playPickup();
            }
        }
    }

    _updateCrateState(dt) {
        let nearest = null;
        let nearestDistance = Infinity;

        for (const crate of this.mapData.lootCrates) {
            const d = dist(this.player.x, this.player.y, crate.x, crate.y);
            if (d < CRATE_INTERACT_RANGE && d < nearestDistance) {
                nearest = crate;
                nearestDistance = d;
            }
        }

        this.nearbyCrateId = nearest ? nearest.id : null;

        const openCrate = this._getOpenCrate();
        if (openCrate && dist(this.player.x, this.player.y, openCrate.x, openCrate.y) > CRATE_INTERACT_RANGE * 1.35) {
            openCrate.opened = false;
            this.openCrateId = null;
        }

        if (this.crateMessage) {
            this.crateMessageTimer = (this.crateMessageTimer || 0) - dt;
            if (this.crateMessageTimer <= 0) {
                this.crateMessage = '';
                this.crateMessageTimer = 0;
            }
        }
    }

    _handleCrateInteraction() {
        if (!this.input.interactRequested || !this.nearbyCrateId) return;

        const crate = this.mapData.lootCrates.find((entry) => entry.id === this.nearbyCrateId);
        if (!crate) return;

        const wasOpen = crate.opened;
        for (const entry of this.mapData.lootCrates) {
            entry.opened = false;
        }

        crate.inspected = true;
        crate.opened = !wasOpen;
        this.openCrateId = crate.opened ? crate.id : null;
    }

    _getOpenCrate() {
        return this.mapData?.lootCrates?.find((crate) => crate.id === this.openCrateId) || null;
    }

    getOpenCrateView() {
        if (this.state !== GAME_STATE.PLAYING) {
            return { visible: false };
        }

        const crate = this._getOpenCrate();
        return {
            visible: Boolean(crate),
            nearbyCrateId: this.nearbyCrateId,
            prompt: this.nearbyCrateId ? 'Press F to open / close crate' : '',
            message: this.crateMessage,
            crate: crate ? {
                id: crate.id,
                inspected: crate.inspected,
                itemCount: crate.items.length,
                items: crate.items.map((item) => ({
                    ...item,
                    rarityLabel: getRarityMeta(item.rarity).label,
                    rarityColor: getRarityMeta(item.rarity).color,
                    definition: getItemDefinition(item.definitionId)
                }))
            } : null
        };
    }

    takeItemFromOpenCrate(itemId) {
        const crate = this._getOpenCrate();
        if (!crate) return { ok: false, message: 'No crate open.' };

        const index = crate.items.findIndex((item) => item.id === itemId);
        if (index === -1) return { ok: false, message: 'Item unavailable.' };

        const item = crate.items[index];
        const added = this.player.addItem(item);
        if (!added) {
            this.crateMessage = 'Backpack full.';
            this.crateMessageTimer = 1.2;
            return { ok: false, message: 'Backpack full.' };
        }

        crate.items.splice(index, 1);
        this.stats.lootCollected = this.player.loot;
        this._spawnParticles(crate.x, crate.y - 6, getRarityMeta(item.rarity).color, 6);
        this.audio.playPickup();
        this.crateMessage = `${item.name} secured`;
        this.crateMessageTimer = 1.2;
        return { ok: true, item };
    }

    _checkExtraction(dt) {
        let inZone = false;
        for (const ez of this.mapData.extractionPoints) {
            const d = dist(this.player.x, this.player.y, ez.x, ez.y);
            if (d < EXTRACTION_RADIUS + this.player.radius) {
                inZone = true;
                this.extractZone = ez;
                break;
            }
        }

        if (inZone) {
            if (!this.extracting) {
                this.extracting = true;
                this.extractTimer = 0;
            }
            this.extractTimer += dt;
            if (this.extractTimer >= EXTRACTION_TIME) {
                this.lastExtractSummary = this._buildExtractionSummary();
                if (this.onExtraction) {
                    this.onExtraction(this.lastExtractSummary);
                }
                this._setState(GAME_STATE.EXTRACTED);
                this.audio.playExtract();
            }
        } else {
            this.extracting = false;
            this.extractTimer = 0;
        }
    }

    // ==================== PARTICLES ====================
    _spawnParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 50 + Math.random() * 150;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.3 + Math.random() * 0.3,
                maxLife: 0.3 + Math.random() * 0.3,
                radius: 1 + Math.random() * 3,
                color
            });
        }
    }

    _updateParticles(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    _renderParticles() {
        const { ctx } = this;
        const cam = this.camera;
        for (const p of this.particles) {
            const sx = p.x - cam.x;
            const sy = p.y - cam.y;
            const alpha = p.life / p.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(sx, sy, p.radius * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ==================== RENDER ====================
    _render() {
        const { ctx, renderer: r } = this;

        if (this.state === GAME_STATE.MENU) {
            this._renderMenu();
            return;
        }

        if (this.state === GAME_STATE.DEAD) {
            this._renderGameWorld();
            this._renderDeathScreen();
            return;
        }

        if (this.state === GAME_STATE.EXTRACTED) {
            this._renderGameWorld();
            this._renderExtractScreen();
            return;
        }

        // Playing
        this._renderGameWorld();
    }

    _renderGameWorld() {
        const { renderer: r } = this;
        r.clear();
        r.drawMap(this.mapData.tiles, this.mapData.zones);
        r.drawExtractionZones(this.mapData.extractionPoints, this.extracting, this.extractTimer);
        r.drawCrates(this.mapData.lootCrates, this.nearbyCrateId, this.openCrateId);
        r.drawHealthPacks(this.mapData.healthPacks);
        r.drawEnemies(this.enemies);
        r.drawBullets(this.bullets);
        r.drawPlayer(this.player);
        this._renderParticles();
        r.drawDamageFlash(this.player);
        r.drawCrosshair(this.input.mouse.x, this.input.mouse.y);
        r.drawHUD(this.player, this.gameTime, this.extracting, this.extractTimer, this.nearbyCrateId ? 'F · Open Crate' : '', this.crateMessage);
        r.drawMinimap(this.mapData.tiles, this.player, this.enemies, this.mapData.lootCrates, this.mapData.extractionPoints);
    }

    _renderMenu() {
        const { ctx, canvas } = this;
        const w = canvas.width;
        const h = canvas.height;

        // Background
        ctx.fillStyle = COLORS.BG;
        ctx.fillRect(0, 0, w, h);

        // Animated grid bg
        const time = Date.now() / 1000;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 40) {
            const offset = Math.sin(time + x / 100) * 5;
            ctx.beginPath();
            ctx.moveTo(x, offset);
            ctx.lineTo(x, h + offset);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 40) {
            const offset = Math.cos(time + y / 100) * 5;
            ctx.beginPath();
            ctx.moveTo(offset, y);
            ctx.lineTo(w + offset, y);
            ctx.stroke();
        }

        ctx.fillStyle = COLORS.PLAYER;
        ctx.font = 'bold 60px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = COLORS.PLAYER;
        ctx.shadowBlur = 28;
        ctx.fillText('SDC.IO', w / 2, h / 2 - 150);
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '16px monospace';
        ctx.fillText('Plan your raid, review your stash, then deploy.', w / 2, h / 2 - 105);

        // Version
        ctx.fillStyle = '#444';
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('v0.2.0 — Operator Menu + Inventory', w - 15, h - 15);
    }

    _renderDeathScreen() {
        const { ctx, canvas } = this;
        const w = canvas.width;
        const h = canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, w, h);

        // Red flash
        ctx.fillStyle = 'rgba(255,0,0,0.15)';
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = COLORS.HP_BAR_LOW;
        ctx.font = 'bold 48px monospace';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 20;
        ctx.fillText('MISSION FAILED', w / 2, h / 2 - 60);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ccc';
        ctx.font = '16px monospace';
        ctx.fillText(`Enemies Killed: ${this.stats.kills}`, w / 2, h / 2);
        ctx.fillText(`Items Collected: ${this.player?.inventoryItems?.length || 0}`, w / 2, h / 2 + 30);
        ctx.fillText(`Time Survived: ${this._formatTime(this.stats.timeSurvived)}`, w / 2, h / 2 + 60);

        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.fillText('All loot has been lost.', w / 2, h / 2 + 110);

        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = COLORS.EXTRACTION;
        ctx.font = 'bold 16px monospace';
        ctx.fillText('[ CLICK TO RETURN TO MENU ]', w / 2, h / 2 + 160);
        ctx.globalAlpha = 1;
    }

    _renderExtractScreen() {
        const { ctx, canvas } = this;
        const w = canvas.width;
        const h = canvas.height;

        // Dark overlay
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, w, h);

        // Blue flash
        ctx.fillStyle = 'rgba(68,138,255,0.1)';
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = COLORS.EXTRACTION;
        ctx.font = 'bold 48px monospace';
        ctx.shadowColor = COLORS.EXTRACTION;
        ctx.shadowBlur = 20;
        ctx.fillText('EXTRACTION SUCCESSFUL', w / 2, h / 2 - 60);
        ctx.shadowBlur = 0;

        const summary = this.lastExtractSummary || this._buildExtractionSummary();

        ctx.fillStyle = COLORS.LOOT_COMMON;
        ctx.font = 'bold 24px monospace';
        ctx.fillText(`ITEMS SECURED: ${summary.items.length}`, w / 2, h / 2);

        ctx.fillStyle = '#ccc';
        ctx.font = '16px monospace';
        ctx.fillText(`Enemies Killed: ${this.stats.kills}`, w / 2, h / 2 + 45);
        ctx.fillText(`Time: ${this._formatTime(this.stats.timeSurvived)}`, w / 2, h / 2 + 75);

        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(`EST. MARKET VALUE: ${summary.estimatedValue}c`, w / 2, h / 2 + 120);

        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = COLORS.EXTRACTION;
        ctx.font = 'bold 16px monospace';
        ctx.fillText('[ CLICK TO RETURN TO MENU ]', w / 2, h / 2 + 180);
        ctx.globalAlpha = 1;
    }

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    _buildExtractionSummary() {
        const estimatedValue = this.player?.loot || 0;
        return {
            estimatedValue,
            items: [...(this.player?.inventoryItems || [])],
            kills: this.stats.kills,
            duration: this.stats.timeSurvived,
            durationLabel: this._formatTime(this.stats.timeSurvived),
            weaponId: this.player?.weaponId || 'militia_carbine',
            weaponName: this.player?.weapon?.name || 'Militia Carbine',
            loadout: { ...(this.player?.loadout || {}) }
        };
    }
}
