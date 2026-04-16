// ============================================================
// game.js — Main game loop, state machine, and integration
// ============================================================

import { generateMap, WallGrid } from './map.js';
import { InputManager } from './input.js';
import { Player } from './player.js';
import { createAIPlayer, createAIOperatorProfile } from './ai_player.js';
import { pickRosterForRaid, incrementRosterStat, batchUpdateRosterStats, applyRosterEloChanges } from './ai_roster.js';
import { Enemy } from './enemy.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { AudioManager } from './audio.js';
import {
    EXTRACTION_RADIUS, EXTRACTION_TIME, LOOT_PICKUP_RANGE, CRATE_INTERACT_RANGE,
    HEALTHPACK_HEAL, MAP_WIDTH, MAP_HEIGHT, TILE_SIZE, COLORS, CRATE_WIDTH, CRATE_HEIGHT
} from './constants.js';
import {
    dist, circleCollision, circleRectCollision, clamp, generateId, randInt, resetIdCounter
} from './utils.js';
import { calculateDeathLosses, calculateSafeboxDeathLosses, computeEloChange, computePerKillElo, computeDeathPenaltyScale, createLootItem, createPersistentEntryFromLootItem, getItemCategoryLabel, getItemDefinition, getRarityMeta, getSlotLabel, ITEM_DEFS } from './profile.js';

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
        this.onRunComplete = options.onRunComplete || null;

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
        this.aiPlayers = [];
        this.enemies = [];
        this.bullets = [];
        this.totalPlayersInRaid = 1;
        this.gameTime = 0;
        this.extracting = false;
        this.extractTimer = 0;
        this.extractZone = null;
        this.openCrateId = null;
        this.nearbyCrateId = null;
        this.inventoryUiOpen = false;
        this.crateMessage = '';
        this.activeProfile = null;
        this.activeDifficulty = 'advanced';
        this.lastExtractSummary = null;
        this._deathHandled = false;

        // Particles (simple)
        this.particles = [];
        this.floatingDamageNumbers = [];
        this.killFeed = [];
        this.killBanner = null;
        this.operatorKillChain = 0;
        this.operatorKillChainTimer = 0;
        this.operatorKillStreak = 0;

        // Stats for end screen
        this.stats = { kills: 0, operatorKills: 0, aiEnemyKills: 0, lootCollected: 0, timeSurvived: 0, eloKillBonus: 0 };
        this.playerElo = 1000;
        this.playerKillerElo = null;

        // Canvas click listener for returning from post-run screens
        this._canvasClickHandler = (event) => {
            if ((this.state === GAME_STATE.DEAD || this.state === GAME_STATE.EXTRACTED) && this._isContinueButtonClick(event)) {
                this.goToMenu();
            }
        };
        canvas.addEventListener('click', this._canvasClickHandler);

        this._postRunKeyHandler = (event) => {
            if (this.state !== GAME_STATE.DEAD && this.state !== GAME_STATE.EXTRACTED) return;
            if (event.code === 'Space' || event.code === 'Enter' || event.code === 'NumpadEnter') {
                event.preventDefault();
                this.goToMenu();
            }
        };
        window.addEventListener('keydown', this._postRunKeyHandler);

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

    startGame(profile, options = {}) {
        this.audio.init();
        this.activeProfile = profile || null;
        this.activeDifficulty = options?.difficulty || 'advanced';
        this._startGame();
    }

    goToMenu() {
        this._setState(GAME_STATE.MENU);
    }

    _getContinueButtonBounds() {
        const padding = 28;
        const width = 170;
        const height = 46;
        return {
            x: this.canvas.width - width - padding,
            y: this.canvas.height - height - padding,
            width,
            height,
        };
    }

    _isContinueButtonClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;
        const button = this._getContinueButtonBounds();
        return x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height;
    }

    _drawContinueButton(label = 'Continue') {
        const { ctx } = this;
        const button = this._getContinueButtonBounds();
        const pulse = 0.72 + 0.28 * Math.sin(Date.now() / 300);

        ctx.save();
        ctx.fillStyle = `rgba(68,138,255,${0.18 + pulse * 0.16})`;
        ctx.strokeStyle = 'rgba(68,138,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(button.x, button.y, button.width, button.height, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#e8f1ff';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, button.x + button.width / 2, button.y + button.height / 2 + 1);

        ctx.restore();
    }

    _startGame() {
        resetIdCounter();
        this._setState(GAME_STATE.PLAYING);
        this.gameTime = 0;
        this.bullets = [];
        this.particles = [];
        this.floatingDamageNumbers = [];
        this.killFeed = [];
        this.killBanner = null;
        this.operatorKillChain = 0;
        this.operatorKillChainTimer = 0;
        this.operatorKillStreak = 0;
        this.extracting = false;
        this.extractTimer = 0;
        this.lastExtractSummary = null;
        this._deathHandled = false;
        this.openCrateId = null;
        this.nearbyCrateId = null;
        this.inventoryUiOpen = false;
        this.crateMessage = '';
        this.stats = { kills: 0, operatorKills: 0, aiEnemyKills: 0, lootCollected: 0, timeSurvived: 0, eloKillBonus: 0 };
        this.playerElo = this.activeProfile?.elo || 1000;
        this.playerKillerElo = null;

        // Generate map
        this.mapData = generateMap({ difficulty: this.activeDifficulty });
        this.wallGrid = new WallGrid(this.mapData.walls);

        // Create player
        this.player = new Player(
            this.mapData.playerSpawn.x,
            this.mapData.playerSpawn.y,
            this.activeProfile?.loadout || {},
            this.activeProfile?.backpackItems || [],
            this.activeProfile?.safeboxItems || []
        );
        this.player.displayName = this.activeProfile?.username || 'Operator';
        this.player.setSquad(`human-solo-${this.player.id}`, 0, 1);
        this.player.onDamageTaken = (entity, amount) => this._spawnFloatingDamageNumber(entity.x, entity.y, amount);

        // Operator count per difficulty
        const raidCountByDifficulty = {
            easy: () => randInt(16, 19),
            advanced: () => randInt(16, 19),
            hell: () => randInt(16, 19),
            chaos: () => randInt(36, 39),
        };
        this.totalPlayersInRaid = (raidCountByDifficulty[this.activeDifficulty] || raidCountByDifficulty.advanced)();
        this.aiPlayers = this._spawnAiPlayers(this.totalPlayersInRaid - 1);

        // Boss spawning logic
        if (this.activeDifficulty === 'chaos' && Math.random() < 0.30) {
            this._spawnBoss();
        } else if (this.activeDifficulty === 'hell' && Math.random() < 0.05) {
            this._spawnBoss();
        }

        // Track death count for extraction gating (chaos)
        this.totalOperatorDeaths = 0;
        this.extractionGateOpen = this.activeDifficulty !== 'chaos';

        // Create enemies
        this.enemies = [];
        for (const spawn of this.mapData.enemySpawns) {
            this.enemies.push(new Enemy(spawn.x, spawn.y, spawn.type, this.activeDifficulty));
        }

        // Camera snap to player
        this.camera.x = this.player.x - this.camera.width / 2;
        this.camera.y = this.player.y - this.camera.height / 2;
    }

    _spawnAiPlayers(count) {
        const bots = [];
        const usedPositions = [{ x: this.player.x, y: this.player.y }];
        const squadSizes = this._buildAiSquadSizes(count);
        let operatorIndex = 0;

        // Pick from the 49 roster accounts
        const rosterPicks = pickRosterForRaid(this.activeDifficulty, count);
        // Mark all chosen roster operators as starting a new raid
        const raidUpdates = rosterPicks.map((r) => ({ id: r.id, key: 'raids' }));
        if (raidUpdates.length) batchUpdateRosterStats(raidUpdates);

        squadSizes.forEach((squadSize, squadNumber) => {
            const anchor = this._getRandomOperatorSpawn(usedPositions);
            const squadId = squadSize === 1 ? `ai-solo-${squadNumber + 1}` : `ai-squad-${squadNumber + 1}`;
            const spawnPoints = this._createSquadSpawnPoints(anchor, squadSize, usedPositions);

            spawnPoints.forEach((spawn, squadIndex) => {
                usedPositions.push(spawn);
                const rosterEntry = rosterPicks[operatorIndex] || null;
                const aiProfile = rosterEntry
                    ? { type: rosterEntry.type, level: rosterEntry.level, maxRarity: undefined }
                    : createAIOperatorProfile(this.activeDifficulty);
                // Let createAIOperatorProfile fill maxRarity if missing
                if (rosterEntry && !aiProfile.maxRarity) {
                    aiProfile.maxRarity = ({ lv1: 'purple', lv2: 'gold', lv3: 'red' })[rosterEntry.level] || 'purple';
                }
                const bot = createAIPlayer(spawn.x, spawn.y, this.activeDifficulty, operatorIndex, {
                    squadId,
                    squadIndex,
                    squadSize,
                    aiProfile,
                    displayName: rosterEntry?.name || undefined,
                    rosterId: rosterEntry?.id || null,
                });
                bot.onDamageTaken = (entity, amount) => this._spawnFloatingDamageNumber(entity.x, entity.y, amount);
                bot.elo = rosterEntry?.stats?.elo || 1000;
                bots.push(bot);
                operatorIndex += 1;
            });
        });

        return bots;
    }

    _spawnBoss() {
        const anchor = this._getRandomOperatorSpawn([{ x: this.player.x, y: this.player.y }]);
        const bossProfile = { type: 'fighter', level: 'boss', maxRarity: 'red' };
        const BOSS_NAMES = ['WARLORD', 'TITAN', 'OVERLORD', 'APEX', 'DOMINATOR', 'REAPER-PRIME', 'SENTINEL', 'OBLIVION'];
        const bossName = `BOSS ${BOSS_NAMES[Math.floor(Math.random() * BOSS_NAMES.length)]}`;
        const bot = createAIPlayer(anchor.x, anchor.y, this.activeDifficulty, 99, {
            aiProfile: bossProfile,
            displayName: bossName,
            squadId: 'boss-squad',
            squadIndex: 0,
            squadSize: 1,
        });
        bot.onDamageTaken = (entity, amount) => this._spawnFloatingDamageNumber(entity.x, entity.y, amount);
        bot.elo = 1500; // bosses have high ELO
        this.aiPlayers.push(bot);

        this.killFeed.unshift({
            text: `${bossName} HAS ENTERED THE RAID`,
            detail: '',
            color: '#ff4444',
            life: 3,
            maxLife: 3,
        });
        this.killFeed = this.killFeed.slice(0, 4);
    }

    _buildAiSquadSizes(count) {
        const sizes = [];
        let remaining = Math.max(0, count);
        while (remaining > 0) {
            if (remaining >= 3) {
                sizes.push(3);
                remaining -= 3;
            } else {
                sizes.push(1);
                remaining -= 1;
            }
        }
        return sizes;
    }

    _createSquadSpawnPoints(anchor, squadSize, usedPositions = []) {
        const points = [anchor];
        const offsets = [
            { x: 48, y: 24 },
            { x: -42, y: 34 },
            { x: 0, y: -54 },
            { x: 64, y: -30 },
            { x: -64, y: -22 },
        ];

        for (let index = 1; index < squadSize; index += 1) {
            const preferred = offsets[index - 1] || { x: randInt(-70, 70), y: randInt(-70, 70) };
            let spawn = {
                x: Math.max(30, Math.min(MAP_WIDTH - 30, anchor.x + preferred.x)),
                y: Math.max(30, Math.min(MAP_HEIGHT - 30, anchor.y + preferred.y)),
            };
            if (usedPositions.some((point) => dist(point.x, point.y, spawn.x, spawn.y) < 38)) {
                spawn = this._getRandomOperatorSpawn([...usedPositions, ...points]);
            }
            points.push(spawn);
        }

        return points;
    }

    _getRandomOperatorSpawn(avoidPositions = []) {
        const tiles = this.mapData?.tiles || [];
        for (let attempt = 0; attempt < 260; attempt += 1) {
            const col = randInt(2, Math.max(2, Math.floor(MAP_WIDTH / TILE_SIZE) - 3));
            const row = randInt(2, Math.max(2, Math.floor(MAP_HEIGHT / TILE_SIZE) - 3));
            if (tiles[row]?.[col] === 1) continue;
            const x = col * TILE_SIZE + TILE_SIZE / 2;
            const y = row * TILE_SIZE + TILE_SIZE / 2;
            if (avoidPositions.some((point) => dist(point.x, point.y, x, y) < 170)) continue;
            if ((this.mapData?.extractionPoints || []).some((point) => dist(point.x, point.y, x, y) < EXTRACTION_RADIUS * 1.8)) continue;
            return { x, y };
        }

        const fallback = this.mapData?.enemySpawns?.find((spawn) => !avoidPositions.some((point) => dist(point.x, point.y, spawn.x, spawn.y) < 120));
        return fallback ? { x: fallback.x, y: fallback.y } : { x: this.player.x + 200, y: this.player.y + 120 };
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

        if (this.input.weaponSwitchRequested) {
            this.crateMessage = `${this.player.weapon?.name || 'Gun'} equipped`;
            this.crateMessageTimer = 1.1;
        }

        const bulletsBeforeBots = this.bullets.length;
        for (const bot of this.aiPlayers) {
            if (bot.aiExtracted) continue;
            bot.updateAI(dt, {
                player: this.player,
                aiPlayers: this.aiPlayers,
                enemies: this.enemies,
                wallGrid: this.wallGrid,
                mapData: this.mapData,
                bullets: this.bullets,
                gameTime: this.gameTime,
                extractionGateOpen: this.extractionGateOpen,
            });
        }
        if (this.bullets.length > bulletsBeforeBots) {
            this.audio.playEnemyShoot();
        }

        // Check player death
        if (!this.player.alive) {
            if (!this._deathHandled) {
                this._deathHandled = true;
                this.totalOperatorDeaths = (this.totalOperatorDeaths || 0) + 1;
                this.audio.playDeath();
                const deathLosses = calculateDeathLosses(this.activeProfile, this.activeDifficulty);
                const deathBackpackValue = (this.player.inventoryItems || []).reduce((sum, item) => sum + (item?.sellValue || 0), 0);
                const deathEquipmentValue = deathLosses.reduce((sum, definitionId) => sum + (getItemDefinition(definitionId)?.sellValue || 0), 0);
                const safeboxLossIndices = calculateSafeboxDeathLosses(this.player.safeboxItems, this.activeDifficulty);
                const safeboxLossIndexSet = new Set(safeboxLossIndices);
                const deathSafeboxValue = safeboxLossIndices.reduce((sum, index) => sum + (this.player.safeboxItems[index]?.sellValue || 0), 0);
                const survivingSafeboxItems = this.player.safeboxItems.filter((_, index) => !safeboxLossIndexSet.has(index));
                const deathSummary = this._buildRunSummary({ deathLosses, deathBackpackValue, deathEquipmentValue, deathSafeboxValue });
                this.lastExtractSummary = deathSummary;
                this._applyAiRosterElo();
                if (this.onRunComplete) {
                    this.onRunComplete({
                        status: 'dead',
                        difficulty: this.activeDifficulty,
                        safeboxItems: survivingSafeboxItems
                            .map((item) => createPersistentEntryFromLootItem(item))
                            .filter(Boolean),
                        summary: deathSummary,
                    });
                }
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
        this._checkAiHealthPickup();

        // Loot crates
        this._updateCrateState(dt);
        this._handleCrateInteraction();

        // Consumable use (Q key)
        this._handleConsumableUse();

        // Extraction
        this._checkExtraction(dt);
        this._checkAiExtraction(dt);

        // Particles
        this._updateParticles(dt);
        this._updateFloatingDamageNumbers(dt);
        this._updateKillFeedback(dt);

        // AI loot drops / death bookkeeping
        this._handleAiPlayerDeaths();

        // Camera
        this.camera.follow(this.player.x, this.player.y, dt);
    }

    // Compute attenuated bullet damage based on distance traveled
    _getAttenuatedDamage(b) {
        if (!b.baseRange || !b.outrangeMulti) return b.damage; // enemy bullets etc.
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const distTraveled = (b.maxLife - b.life) * speed;
        if (distTraveled <= b.baseRange) return b.damage; // within base range: full damage
        const progress = (distTraveled - b.baseRange) / b.baseRange; // 0→1 over [range, 2*range]
        return b.damage * b.outrangeMulti * Math.max(0, 1 - progress);
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
                    if ((b.wallPenetration || 0) > 0) {
                        const speed = Math.hypot(b.vx, b.vy) || 1;
                        const pushDistance = Math.max(TILE_SIZE, w.w, w.h) + b.radius + 2;
                        b.x += (b.vx / speed) * pushDistance;
                        b.y += (b.vy / speed) * pushDistance;
                        b.wallPenetration -= 1;
                        break;
                    }
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

            let bulletRemoved = false;

            if (b.owner !== 'enemy') {
                for (const e of this.enemies) {
                    if (!e.alive) continue;
                    if (!circleCollision(b.x, b.y, b.radius, e.x, e.y, e.radius)) continue;
                    e.takeDamage(b.instantKill ? e.maxHp : this._getAttenuatedDamage(b));
                    this._spawnParticles(b.x, b.y, COLORS.ENEMY_DRONE, 5);
                    this.audio.playHit();
                    if (!e.alive) {
                        if (b.owner === 'player') {
                            this.stats.kills++;
                            this.stats.aiEnemyKills++;
                        }
                        this._spawnParticles(e.x, e.y, e.type === 'drone' ? COLORS.ENEMY_DRONE : COLORS.ENEMY_SENTINEL, 12);
                        // 1% chance AI enemy drops a high-value crate
                        if (Math.random() < 0.01) {
                            const hvItems = this._generateHighValueCrateItems();
                            if (hvItems.length) {
                                this.mapData.lootCrates.push({
                                    id: generateId(),
                                    x: e.x,
                                    y: e.y,
                                    w: CRATE_WIDTH,
                                    h: CRATE_HEIGHT,
                                    opened: false,
                                    inspected: true,
                                    tier: 'elite',
                                    tierLabel: 'High Value Crate',
                                    tierColor: '#ffd700',
                                    items: hvItems,
                                });
                                this.crateMessage = 'HIGH VALUE CRATE DROPPED!';
                                this.crateMessageTimer = 2.5;
                            }
                        }
                    }
                    this.bullets.splice(i, 1);
                    bulletRemoved = true;
                    break;
                }
                if (bulletRemoved) continue;

                if (b.owner !== 'player' && this.player.alive && circleCollision(b.x, b.y, b.radius, this.player.x, this.player.y, this.player.radius)) {
                    this.player.takeDamage(this._getAttenuatedDamage(b), b);
                    this._spawnParticles(b.x, b.y, COLORS.PLAYER, 5);
                    if (!this.player.alive && b.owner === 'bot' && b.ownerId) {
                        const killer = this.aiPlayers.find((a) => a.id === b.ownerId);
                        if (killer) {
                            killer.gameKills = (killer.gameKills || 0) + 1;
                            killer.eloKillBonus = (killer.eloKillBonus || 0) + computePerKillElo(killer.elo || 1000, this.playerElo);
                        }
                        if (killer?.rosterId) incrementRosterStat(killer.rosterId, 'kills');
                        this.playerKillerElo = killer?.elo || 1000;
                    }
                    this.bullets.splice(i, 1);
                    continue;
                }

                for (const bot of this.aiPlayers) {
                    if (!bot.alive) continue;
                    if (b.owner === 'bot' && b.ownerId === bot.id) continue;
                    if (b.ownerSquadId && b.ownerSquadId === bot.squadId) continue;
                    if (!circleCollision(b.x, b.y, b.radius, bot.x, bot.y, bot.radius)) continue;
                    bot.takeDamage(b.instantKill ? bot.maxHp : this._getAttenuatedDamage(b), b);
                    this._spawnParticles(b.x, b.y, COLORS.AI_PLAYER, 5);
                    this.audio.playHit();
                    if (!bot.alive) {
                        if (b.owner === 'player') {
                            this.stats.kills++;
                            this.stats.operatorKills++;
                            this.stats.eloKillBonus = (this.stats.eloKillBonus || 0) + computePerKillElo(this.playerElo, bot.elo || 1000);
                            this._registerOperatorKill(bot);
                        } else if (b.owner === 'bot' && b.ownerId) {
                            // Track kill for the AI attacker
                            const killer = this.aiPlayers.find((a) => a.id === b.ownerId);
                            if (killer) {
                                killer.gameKills = (killer.gameKills || 0) + 1;
                                killer.eloKillBonus = (killer.eloKillBonus || 0) + computePerKillElo(killer.elo || 1000, bot.elo || 1000);
                            }
                            if (killer?.rosterId) incrementRosterStat(killer.rosterId, 'kills');
                            bot.killedByElo = killer?.elo || 1000;
                        }
                        this._handleAiPlayerDeath(bot);
                    }
                    this.bullets.splice(i, 1);
                    bulletRemoved = true;
                    break;
                }
                if (bulletRemoved) continue;
            } else {
                if (this.player.alive && b.ownerSquadId !== this.player.squadId && circleCollision(b.x, b.y, b.radius, this.player.x, this.player.y, this.player.radius)) {
                    this.player.takeDamage(this._getAttenuatedDamage(b), b);
                    this._spawnParticles(b.x, b.y, COLORS.PLAYER, 5);
                    if (!this.player.alive && b.owner === 'bot' && b.ownerId) {
                        const killer = this.aiPlayers.find((a) => a.id === b.ownerId);
                        if (killer) {
                            killer.gameKills = (killer.gameKills || 0) + 1;
                            killer.eloKillBonus = (killer.eloKillBonus || 0) + computePerKillElo(killer.elo || 1000, this.playerElo);
                        }
                        if (killer?.rosterId) incrementRosterStat(killer.rosterId, 'kills');
                        this.playerKillerElo = killer?.elo || 1000;
                    }
                    this.bullets.splice(i, 1);
                    continue;
                }

                for (const bot of this.aiPlayers) {
                    if (!bot.alive) continue;
                    if (!circleCollision(b.x, b.y, b.radius, bot.x, bot.y, bot.radius)) continue;
                    bot.takeDamage(this._getAttenuatedDamage(b), b);
                    this._spawnParticles(b.x, b.y, COLORS.AI_PLAYER, 5);
                    if (!bot.alive) {
                        // Enemy killed a bot — no roster kill stat for enemies
                        this._handleAiPlayerDeath(bot);
                    }
                    this.bullets.splice(i, 1);
                    bulletRemoved = true;
                    break;
                }
                if (bulletRemoved) continue;
            }
        }
    }

    _checkAiHealthPickup() {
        for (const bot of this.aiPlayers) {
            if (!bot.alive || bot.hp >= bot.maxHp) continue;
            for (const hp of this.mapData.healthPacks) {
                if (hp.collected) continue;
                const d = dist(bot.x, bot.y, hp.x, hp.y);
                if (d < LOOT_PICKUP_RANGE + bot.radius) {
                    hp.collected = true;
                    bot.heal(HEALTHPACK_HEAL);
                    this._spawnParticles(hp.x, hp.y, COLORS.HEALTHPACK, 5);
                    break;
                }
            }
        }
    }

    _handleAiPlayerDeaths() {
        for (const bot of this.aiPlayers) {
            if (!bot || bot.alive || bot._deathHandled) continue;
            this._handleAiPlayerDeath(bot);
        }
    }

    _handleAiPlayerDeath(bot) {
        if (!bot || bot._deathHandled) return;
        bot._deathHandled = true;
        bot.returnLoadedAmmoToInventory();

        // Track operator death for extraction gating
        this.totalOperatorDeaths = (this.totalOperatorDeaths || 0) + 1;
        if (!this.extractionGateOpen && this.totalOperatorDeaths >= Math.ceil(this.totalPlayersInRaid / 2)) {
            this.extractionGateOpen = true;
            this.killFeed.unshift({
                text: 'EXTRACTION ZONE UNLOCKED',
                detail: '',
                color: '#82b1ff',
                life: 4,
                maxLife: 4,
            });
            this.killFeed = this.killFeed.slice(0, 6);
        }

        // Track roster death stat
        if (bot.rosterId) {
            incrementRosterStat(bot.rosterId, 'deaths');
        }

        const droppedItems = [
            ...Object.values(bot.loadout || {}).filter(Boolean).map((definitionId) => createLootItem(definitionId)).filter(Boolean),
            ...bot.inventoryItems.map((item) => ({ ...item })),
            ...bot.safeboxItems.map((item) => ({ ...item })),
        ];

        // Boss-specific drops
        if (bot.aiLevel === 'boss') {
            // Drop 1 red consumable
            const redConsumables = Object.keys(ITEM_DEFS).filter(
                (id) => ITEM_DEFS[id].category === 'consumable' && ITEM_DEFS[id].rarity === 'red'
            );
            if (redConsumables.length) {
                const pick = redConsumables[Math.floor(Math.random() * redConsumables.length)];
                const item = createLootItem(pick);
                if (item) droppedItems.push(item);
            }

            // Drop 1 red ammo
            const redAmmo = Object.keys(ITEM_DEFS).filter(
                (id) => ITEM_DEFS[id].category === 'ammo' && ITEM_DEFS[id].rarity === 'red'
            );
            if (redAmmo.length) {
                const pick = redAmmo[Math.floor(Math.random() * redAmmo.length)];
                const item = createLootItem(pick);
                if (item) droppedItems.push(item);
            }

            // 3% chance to drop bitcoin
            if (Math.random() < 0.03 && ITEM_DEFS['btc']) {
                const item = createLootItem('btc');
                if (item) droppedItems.push(item);
            }

            // Boss kill notification
            this.killFeed.unshift({
                text: `${bot.displayName || 'BOSS'} ELIMINATED`,
                detail: '',
                color: '#ff6600',
                life: 3,
                maxLife: 3,
            });
            this.killFeed = this.killFeed.slice(0, 6);
        }

        bot.inventoryItems = [];
        bot.safeboxItems = [];

        if (droppedItems.length) {
            this.mapData.lootCrates.push({
                id: generateId(),
                x: bot.x,
                y: bot.y,
                w: CRATE_WIDTH,
                h: CRATE_HEIGHT,
                opened: false,
                inspected: true,
                tier: 'operator',
                tierLabel: 'Operator Cache',
                tierColor: COLORS.AI_PLAYER,
                items: droppedItems,
            });
        }

        this._spawnParticles(bot.x, bot.y, COLORS.AI_PLAYER, 12);
    }

    _generateHighValueCrateItems() {
        const count = 1 + Math.floor(Math.random() * 3); // 1-3 items
        const items = [];
        const goldCandidates = Object.keys(ITEM_DEFS).filter(
            (id) => ITEM_DEFS[id].rarity === 'gold' && ITEM_DEFS[id].lootType !== 'ammo'
        );
        const redCandidates = Object.keys(ITEM_DEFS).filter(
            (id) => ITEM_DEFS[id].rarity === 'red' && ITEM_DEFS[id].lootType !== 'ammo'
        );

        for (let i = 0; i < count; i++) {
            const roll = Math.random();
            let picked;
            if (roll < 0.02) {
                // 2% — .338 AP ammo
                picked = createLootItem('ammo_338_ap');
            } else if (roll < 0.15) {
                // 13% — red rarity item
                const id = redCandidates[Math.floor(Math.random() * redCandidates.length)];
                picked = id ? createLootItem(id) : null;
            } else {
                // 85% — gold rarity item
                const id = goldCandidates[Math.floor(Math.random() * goldCandidates.length)];
                picked = id ? createLootItem(id) : null;
            }
            if (picked) items.push(picked);
        }
        return items;
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

    _handleConsumableUse() {
        if (!this.input.useConsumableRequested) return;
        const result = this.player.useConsumable();
        if (result) {
            if (result.action === 'started') {
                this.crateMessage = `Healing with ${result.name}`;
                this.crateMessageTimer = 1.2;
                this._spawnParticles(this.player.x, this.player.y - 10, '#4caf50', 8);
            } else if (result.action === 'cancelled') {
                this.crateMessage = `Stopped healing${result.name ? ` ${result.name}` : ''}`;
                this.crateMessageTimer = 1.0;
            } else if (result.action === 'full') {
                this.crateMessage = 'Already at full HP.';
                this.crateMessageTimer = 1.0;
            }
        } else {
            this.crateMessage = 'No consumables.';
            this.crateMessageTimer = 1.0;
        }
    }

    _handleCrateInteraction() {
        if (!this.input.interactRequested) return;

        if (!this.nearbyCrateId) {
            this.inventoryUiOpen = !this.inventoryUiOpen;
            return;
        }

        const crate = this.mapData.lootCrates.find((entry) => entry.id === this.nearbyCrateId);
        if (!crate) return;

        const wasOpen = crate.opened;
        for (const entry of this.mapData.lootCrates) {
            entry.opened = false;
        }

        crate.inspected = true;
        crate.opened = !wasOpen;
        this.openCrateId = crate.opened ? crate.id : null;
        this.inventoryUiOpen = crate.opened;
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

    getRaidUiView() {
        if (this.state !== GAME_STATE.PLAYING || !this.player) {
            return { visible: false, crateVisible: false };
        }

        const crateView = this.getOpenCrateView();
        return {
            visible: this.inventoryUiOpen || crateView.visible,
            crateVisible: crateView.visible,
            crate: crateView.crate,
            prompt: crateView.prompt,
            message: crateView.message,
            backpack: {
                spaceUsed: this.player.getCarriedSpaceUsed(),
                capacity: this.player.carryCapacity,
                items: this.player.getBackpackView().map((item) => ({
                    ...item,
                    slotLabel: getItemCategoryLabel(item),
                    rarityLabel: getRarityMeta(item.rarity).label,
                    rarityColor: getRarityMeta(item.rarity).color,
                })),
            },
            safebox: {
                spaceUsed: this.player.getSafeboxSpaceUsed(),
                capacity: 4,
                items: this.player.getSafeboxView().map((item) => ({
                    ...item,
                    slotLabel: getItemCategoryLabel(item),
                    rarityLabel: getRarityMeta(item.rarity).label,
                    rarityColor: getRarityMeta(item.rarity).color,
                })),
            },
            loadout: {
                items: this.player.getLoadoutView().map((item) => ({
                    ...item,
                    slotLabel: getSlotLabel(item.slot),
                    rarityLabel: getRarityMeta(item.rarity).label,
                    rarityColor: getRarityMeta(item.rarity).color,
                })),
            },
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

    equipBackpackItem(itemId) {
        const result = this.player.equipItemFromBackpack(itemId);
        this.crateMessage = result.message;
        this.crateMessageTimer = 1.2;
        return result;
    }

    abandonBackpackItem(itemId) {
        const result = this.player.dropBackpackItem(itemId);
        if (result.ok && result.droppedItem) {
            this._depositItemInNearestCrate(result.droppedItem);
        }
        this.crateMessage = result.message;
        this.crateMessageTimer = 1.2;
        return result;
    }

    unequipLoadoutItem(slot) {
        const result = this.player.unequipLoadoutItem(slot);
        this.crateMessage = result.message;
        this.crateMessageTimer = 1.2;
        return result;
    }

    abandonLoadoutItem(slot) {
        const result = this.player.abandonLoadoutItem(slot);
        if (result.ok && result.droppedItem) {
            this._depositItemInNearestCrate(result.droppedItem);
        }
        this.crateMessage = result.message;
        this.crateMessageTimer = 1.2;
        return result;
    }

    _depositItemInNearestCrate(item) {
        // Find nearest non-operator loot crate
        const nonOperatorCrates = this.mapData.lootCrates.filter((c) => c.tier !== 'operator');
        if (!nonOperatorCrates.length) return;
        let bestCrate = nonOperatorCrates[0];
        let bestDist = dist(this.player.x, this.player.y, bestCrate.x, bestCrate.y);
        for (let i = 1; i < nonOperatorCrates.length; i++) {
            const d = dist(this.player.x, this.player.y, nonOperatorCrates[i].x, nonOperatorCrates[i].y);
            if (d < bestDist) { bestDist = d; bestCrate = nonOperatorCrates[i]; }
        }
        bestCrate.items.push(item);
    }

    moveBackpackItemToSafebox(itemId) {
        const result = this.player.moveBackpackItemToSafebox(itemId);
        this.crateMessage = result.message;
        this.crateMessageTimer = 1.2;
        return result;
    }

    moveSafeboxItemToBackpack(itemId) {
        const result = this.player.moveSafeboxItemToBackpack(itemId);
        this.crateMessage = result.message;
        this.crateMessageTimer = 1.2;
        return result;
    }

    _checkExtraction(dt) {
        if (!this.extractionGateOpen) {
            this.extracting = false;
            this.extractTimer = 0;
            return;
        }
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
                this.player?.returnLoadedAmmoToInventory?.();
                this.lastExtractSummary = this._buildRunSummary();
                if (this.onExtraction) {
                    this.onExtraction(this.lastExtractSummary);
                }
                this._applyAiRosterElo();
                if (this.onRunComplete) {
                    this.onRunComplete({
                        status: 'extracted',
                        difficulty: this.activeDifficulty,
                        safeboxItems: this.player.safeboxItems
                            .map((item) => createPersistentEntryFromLootItem(item))
                            .filter(Boolean),
                        summary: this.lastExtractSummary,
                    });
                }
                this._setState(GAME_STATE.EXTRACTED);
                this.audio.playExtract();
            }
        } else {
            this.extracting = false;
            this.extractTimer = 0;
        }
    }

    _checkAiExtraction(dt) {
        for (const bot of this.aiPlayers) {
            if (!bot.alive || bot.aiExtracted || !bot.aiWantsToExtract) continue;
            if (!this.extractionGateOpen) { bot.aiExtractTimer = 0; continue; }
            let inZone = false;
            for (const ez of this.mapData.extractionPoints) {
                if (dist(bot.x, bot.y, ez.x, ez.y) < EXTRACTION_RADIUS + bot.radius) {
                    inZone = true;
                    break;
                }
            }
            if (inZone) {
                bot.aiExtractTimer += dt;
                if (bot.aiExtractTimer >= EXTRACTION_TIME) {
                    bot.aiExtracted = true;
                    bot.alive = false;
                    bot._deathHandled = true; // prevent normal death logic
                    if (bot.rosterId) {
                        incrementRosterStat(bot.rosterId, 'extractions');
                    }
                    this._spawnParticles(bot.x, bot.y, '#88ddff', 14);
                    this.killFeed.unshift({
                        text: `${(bot.displayName || 'Operator').toUpperCase()} EXTRACTED`,
                        detail: '',
                        color: '#88ddff',
                        life: 2.5,
                        maxLife: 2.5,
                    });
                    this.killFeed = this.killFeed.slice(0, 4);
                }
            } else {
                bot.aiExtractTimer = Math.max(0, bot.aiExtractTimer - dt * 2);
            }
        }
    }

    // ==================== AI ROSTER ELO ====================

    /**
     * Collect outcomes for all AI operators in this raid.
     * Bots still alive get a simulated outcome based on health and situation.
     */
    _collectAiOutcomes() {
        const outcomes = [];
        for (const bot of this.aiPlayers) {
            if (!bot.rosterId) continue;
            if (bot.aiExtracted) {
                outcomes.push({ rosterId: bot.rosterId, extracted: true, eloKillBonus: bot.eloKillBonus || 0, deathPenaltyScale: 1.0 });
            } else if (!bot.alive) {
                const deathScale = bot.killedByElo != null
                    ? computeDeathPenaltyScale(bot.elo || 1000, bot.killedByElo)
                    : 1.0;
                outcomes.push({ rosterId: bot.rosterId, extracted: false, eloKillBonus: bot.eloKillBonus || 0, deathPenaltyScale: deathScale });
            } else {
                // Bot is still alive — simulate outcome.
                // Higher HP ratio & wanting to extract → more likely to survive
                const hpRatio = bot.hp / bot.maxHp;
                const wantsExtract = bot.aiWantsToExtract ? 0.2 : 0;
                const survivalChance = Math.min(0.85, 0.25 + hpRatio * 0.4 + wantsExtract);
                const extracted = Math.random() < survivalChance;
                if (extracted) {
                    incrementRosterStat(bot.rosterId, 'extractions');
                } else {
                    incrementRosterStat(bot.rosterId, 'deaths');
                }
                outcomes.push({ rosterId: bot.rosterId, extracted, eloKillBonus: bot.eloKillBonus || 0, deathPenaltyScale: 1.0 });
            }
        }
        return outcomes;
    }

    /**
     * Apply ELO changes for all AI operators after the raid ends.
     */
    _applyAiRosterElo() {
        const outcomes = this._collectAiOutcomes();
        if (outcomes.length) {
            applyRosterEloChanges(outcomes, this.activeDifficulty, computeEloChange);
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

    _spawnFloatingDamageNumber(x, y, amount) {
        const value = Math.max(0, Math.round(Number(amount) || 0));
        if (value <= 0) return;
        this.floatingDamageNumbers.push({
            x,
            y,
            value,
            life: 0.9,
            maxLife: 0.9,
            xOffset: (Math.random() * 12) - 6,
            yOffset: -8,
            driftX: (Math.random() * 20) - 10,
            riseSpeed: 28 + Math.random() * 12,
        });
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

    _updateFloatingDamageNumbers(dt) {
        for (let i = this.floatingDamageNumbers.length - 1; i >= 0; i -= 1) {
            const entry = this.floatingDamageNumbers[i];
            entry.life -= dt;
            entry.yOffset -= entry.riseSpeed * dt;
            entry.xOffset += entry.driftX * dt;
            if (entry.life <= 0) {
                this.floatingDamageNumbers.splice(i, 1);
            }
        }
    }

    _updateKillFeedback(dt) {
        if (this.operatorKillChainTimer > 0) {
            this.operatorKillChainTimer = Math.max(0, this.operatorKillChainTimer - dt);
            if (this.operatorKillChainTimer <= 0) {
                this.operatorKillChain = 0;
            }
        }

        for (let i = this.killFeed.length - 1; i >= 0; i -= 1) {
            this.killFeed[i].life -= dt;
            if (this.killFeed[i].life <= 0) {
                this.killFeed.splice(i, 1);
            }
        }

        if (this.killBanner) {
            this.killBanner.life -= dt;
            if (this.killBanner.life <= 0) {
                this.killBanner = null;
            }
        }
    }

    _getKillChainLabel(chain) {
        if (chain >= 5) return `CHAIN x${chain}`;
        if (chain === 4) return 'QUAD ELIM';
        if (chain === 3) return 'TRIPLE ELIM';
        if (chain === 2) return 'DOUBLE ELIM';
        return 'TARGET DOWN';
    }

    _getKillStreakLabel(streak) {
        if (streak >= 10) return 'DOMINATING';
        if (streak >= 7) return 'OVERWATCH';
        if (streak >= 5) return 'PRESSURE';
        if (streak >= 3) return 'COMBAT STREAK';
        return '';
    }

    _getKillFeedbackColor(chain, streak) {
        if (chain >= 3 || streak >= 7) return '#ffb347';
        if (chain >= 2 || streak >= 5) return '#ffcc66';
        return '#8fe3ff';
    }

    _registerOperatorKill(bot) {
        this.operatorKillChain = this.operatorKillChainTimer > 0 ? this.operatorKillChain + 1 : 1;
        this.operatorKillChainTimer = 3.5;
        this.operatorKillStreak += 1;

        const victimName = bot?.displayName || 'Operator';
        const streakLabel = this._getKillStreakLabel(this.operatorKillStreak);
        const bannerTitle = this._getKillChainLabel(this.operatorKillChain);
        const accentColor = this._getKillFeedbackColor(this.operatorKillChain, this.operatorKillStreak);

        this.killBanner = {
            title: bannerTitle,
            subtitle: streakLabel ? `${streakLabel} · ${victimName}` : `ELIMINATED · ${victimName}`,
            color: accentColor,
            tag: 'OPERATOR ELIMINATION',
            chain: this.operatorKillChain,
            streak: this.operatorKillStreak,
            life: 1.45,
            maxLife: 1.45,
        };

        this.killFeed.unshift({
            text: victimName.toUpperCase(),
            detail: streakLabel || bannerTitle,
            color: accentColor,
            life: 2.5,
            maxLife: 2.5,
        });
        this.killFeed = this.killFeed.slice(0, 4);

        this.audio.playOperatorKill(this.operatorKillChain, this.operatorKillStreak);
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

    _renderFloatingDamageNumbers() {
        const { ctx } = this;
        const cam = this.camera;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const entry of this.floatingDamageNumbers) {
            const sx = entry.x - cam.x + entry.xOffset;
            const sy = entry.y - cam.y + entry.yOffset;
            const alpha = Math.max(0, entry.life / entry.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff5a5a';
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur = 10;
            ctx.font = 'bold 18px monospace';
            ctx.fillText(`${entry.value}`, sx, sy);
        }
        ctx.restore();
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
        r.drawExtractionZones(this.mapData.extractionPoints, this.extracting, this.extractTimer, this.extractionGateOpen);
        r.drawCrates(this.mapData.lootCrates, this.nearbyCrateId, this.openCrateId);
        r.drawHealthPacks(this.mapData.healthPacks);
        r.drawEnemies(this.enemies);
        r.drawAiPlayers(this.aiPlayers, this.player);
        r.drawBullets(this.bullets);
        r.drawPlayer(this.player);
        this._renderParticles();
        this._renderFloatingDamageNumbers();
        r.drawCrosshair(this.input.mouse.x, this.input.mouse.y);
        r.drawHUD(this.player, this.gameTime, this.extracting, this.extractTimer, this.nearbyCrateId ? 'F · Open Crate' : '', this.crateMessage, this.killFeed, this.killBanner);

        // Extraction gate indicator for chaos mode
        if (!this.extractionGateOpen) {
            const ctx = this.ctx;
            const cam = this.camera;
            const needed = Math.ceil(this.totalPlayersInRaid / 2);
            const current = this.totalOperatorDeaths || 0;
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(cam.width / 2 - 130, 60, 260, 28);
            ctx.fillStyle = '#ff5252';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`🔒 EXTRACT LOCKED — ${current}/${needed} operators eliminated`, cam.width / 2, 78);
            ctx.restore();
        }

        r.drawMinimap(this.mapData.tiles, this.player, this.enemies, this.aiPlayers, this.mapData.lootCrates, this.mapData.extractionPoints);
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
        ctx.fillText(`Operators Killed: ${this.stats.operatorKills}`, w / 2, h / 2);
        ctx.fillText(`AI Enemies Killed: ${this.stats.aiEnemyKills}`, w / 2, h / 2 + 30);
        ctx.fillText(`Time Survived: ${this._formatTime(this.stats.timeSurvived)}`, w / 2, h / 2 + 60);

        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.fillText(this.activeDifficulty === 'chaos' ? 'Backpack loot was lost. Safebox contents may also have been lost.' : 'Backpack loot was lost. Safebox contents were retained.', w / 2, h / 2 + 110);

        const lostSummary = this.lastExtractSummary || this._buildRunSummary();
        ctx.fillStyle = '#ffb74d';
        ctx.font = 'bold 20px monospace';
        this.renderer.drawCoinValueText('LOST VALUE: ', lostSummary.lostValue, w / 2, h / 2 + 145, {
            align: 'center',
            iconSize: 18,
            iconOffsetY: -9,
        });

        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = COLORS.EXTRACTION;
        ctx.font = 'bold 16px monospace';
        ctx.fillText('[ PRESS SPACE OR ENTER TO CONTINUE ]', w / 2, h / 2 + 185);
        ctx.globalAlpha = 1;

        this._drawContinueButton();
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

        const summary = this.lastExtractSummary || this._buildRunSummary();

        ctx.fillStyle = COLORS.LOOT_COMMON;
        ctx.font = 'bold 24px monospace';
        ctx.fillText(`ITEMS SECURED: ${summary.items.length}`, w / 2, h / 2);

        ctx.fillStyle = '#ccc';
        ctx.font = '16px monospace';
        ctx.fillText(`Operators Killed: ${this.stats.operatorKills}`, w / 2, h / 2 + 45);
        ctx.fillText(`AI Enemies Killed: ${this.stats.aiEnemyKills}`, w / 2, h / 2 + 75);
        ctx.fillText(`Time: ${this._formatTime(this.stats.timeSurvived)}`, w / 2, h / 2 + 105);

        ctx.fillStyle = '#aaa';
        ctx.font = 'bold 20px monospace';
        this.renderer.drawCoinValueText('EST. EXTRACTED VALUE: ', summary.estimatedValue, w / 2, h / 2 + 150, {
            align: 'center',
            iconSize: 18,
            iconOffsetY: -9,
        });

        ctx.fillStyle = '#ffb74d';
        ctx.font = 'bold 20px monospace';
        this.renderer.drawCoinValueText('LOST VALUE: ', summary.lostValue || 0, w / 2, h / 2 + 185, {
            align: 'center',
            iconSize: 18,
            iconOffsetY: -9,
        });

        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = COLORS.EXTRACTION;
        ctx.font = 'bold 16px monospace';
        ctx.fillText('[ PRESS SPACE OR ENTER TO CONTINUE ]', w / 2, h / 2 + 235);
        ctx.globalAlpha = 1;

        this._drawContinueButton();
    }

    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    _buildRunSummary(extra = {}) {
        const estimatedValue = this.player?.getExtractedRaidValue?.() || 0;
        const lossSummary = this.player?.getRunLossSummary({ backpack: extra.deathBackpackValue || 0, deathEquipment: extra.deathEquipmentValue || 0, safebox: extra.deathSafeboxValue || 0 }) || {
            ammoUsed: 0,
            consumablesUsed: 0,
            abandoned: 0,
            backpack: 0,
            deathEquipment: 0,
            safebox: 0,
            total: 0,
        };
        return {
            estimatedValue,
            items: [...(this.player?.inventoryItems || [])],
            kills: this.stats.kills,
            operatorKills: this.stats.operatorKills,
            aiEnemyKills: this.stats.aiEnemyKills,
            difficulty: this.activeDifficulty,
            duration: this.stats.timeSurvived,
            durationLabel: this._formatTime(this.stats.timeSurvived),
            weaponId: this.player?.weaponId || null,
            weaponName: this.player?.weapon?.name || 'Unarmed',
            loadout: { ...(this.player?.loadout || {}) },
            lostValue: lossSummary.total,
            valueExtracted: estimatedValue,
            netValue: estimatedValue - lossSummary.total,
            lostValueBreakdown: {
                ammoUsed: lossSummary.ammoUsed,
                consumablesUsed: lossSummary.consumablesUsed,
                abandoned: lossSummary.abandoned,
                backpack: lossSummary.backpack,
                deathEquipment: lossSummary.deathEquipment,
                safebox: lossSummary.safebox,
            },
            deathLosses: Array.isArray(extra.deathLosses) ? [...extra.deathLosses] : [],
            eloKillBonus: this.stats.eloKillBonus || 0,
            deathPenaltyScale: this.playerKillerElo != null
                ? computeDeathPenaltyScale(this.playerElo, this.playerKillerElo)
                : 1.0,
        };
    }
}
