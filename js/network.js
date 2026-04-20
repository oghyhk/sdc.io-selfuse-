// ============================================================
// network.js — WebSocket connection manager for multiplayer raids
// ============================================================

const WS_PORT = 8766;

export class NetworkManager {
    constructor() {
        this.ws = null;
        this.username = null;
        this.raidId = null;
        this.mapSeed = null;
        this.difficulty = null;
        this.connected = false;
        this.authenticated = false;

        // Callbacks (set by game.js)
        this.onRaidJoined = null;   // ({ raidId, mapSeed, difficulty, players }) => {}
        this.onRaidStart = null;    // ({ raidId, mapSeed, difficulty, players, host }) => {}
        this.onPlayersUpdate = null;  // (playerStates[]) => {}
        this.onPlayerJoined = null;  // ({ username, playerCount }) => {}
        this.onPlayerLeft = null;    // ({ username }) => {}
        this.onPlayerShoot = null;   // ({ username, x, y, angle, gunId }) => {}
        this.onPlayerDeath = null;   // ({ username, x, y }) => {}
        this.onPlayerExtract = null; // ({ username }) => {}
        this.onDisconnect = null;    // () => {}

        // Phase 2: Shared world callbacks
        this.onCrateTakeOk = null;    // ({ itemId, crateId }) => {}
        this.onCrateTakeFail = null;  // ({ itemId, reason }) => {}
        this.onCrateItemTaken = null; // ({ username, crateId, itemId }) => {}
        this.onHpTakeOk = null;       // ({ hpId }) => {}
        this.onHpTakeFail = null;     // ({ hpId }) => {}
        this.onHpTaken = null;        // ({ username, hpId }) => {}
        this.onCrateSpawned = null;   // ({ username, crate }) => {}
        this.onOpDeathCount = null;   // ({ count }) => {}

        // Phase 3: PvP callbacks
        this.onPvpDamage = null;      // ({ attacker, damage, hp, alive, gunId }) => {}
        this.onPvpHitVisual = null;   // ({ attacker, target, damage, alive }) => {}
        this.onPvpKill = null;        // ({ killer, victim }) => {}

        // Phase 4: Shared AI callbacks
        this.onEnemySync = null;      // ({ enemies }) => {}
        this.onEnemyHit = null;       // ({ username, enemyId, damage, killed }) => {}
        this.onEnemyBullet = null;    // ({ data }) => {}

        // Phase 5: Position correction
        this.onPosCorrect = null;     // ({ x, y }) => {}

        // Host status
        this.isHost = false;
        // Position send throttle
        this._lastPosSend = 0;
        this._posSendInterval = 1000 / 20; // 20Hz
    }

    connect(username) {
        if (this.ws) this.disconnect();
        this.username = username;

        const host = window.location.hostname || 'localhost';
        const url = `ws://${host}:${WS_PORT}`;

        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);
            } catch (e) {
                reject(e);
                return;
            }

            this.ws.onopen = () => {
                this.connected = true;
                // Send auth message
                this._send({ type: 'auth', username: this.username });
            };

            this.ws.onmessage = (event) => {
                let msg;
                try { msg = JSON.parse(event.data); } catch { return; }
                this._handleMessage(msg, resolve);
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.authenticated = false;
                this.raidId = null;
                if (this.onDisconnect) this.onDisconnect();
            };

            this.ws.onerror = () => {
                if (!this.authenticated) reject(new Error('WebSocket connection failed'));
            };

            // Timeout for auth
            setTimeout(() => {
                if (!this.authenticated) {
                    reject(new Error('Auth timeout'));
                    this.disconnect();
                }
            }, 5000);
        });
    }

    disconnect() {
        if (this.ws) {
            try { this.ws.close(); } catch {}
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
        this.raidId = null;
    }

    joinRaid(difficulty) {
        this._send({ type: 'join', difficulty });
    }

    sendPosition(player) {
        const now = performance.now();
        if (now - this._lastPosSend < this._posSendInterval) return;
        this._lastPosSend = now;

        this._send({
            type: 'pos',
            x: Math.round(player.x),
            y: Math.round(player.y),
            angle: +player.angle.toFixed(3),
            vx: Math.round(player.vx || 0),
            vy: Math.round(player.vy || 0),
            hp: Math.round(player.hp),
            maxHp: Math.round(player.maxHp),
            alive: player.alive,
            shieldHp: Math.round((player.shieldLayers || []).reduce((s, l) => s + l.hp, 0)),
            shieldMax: Math.round((player.shieldLayers || []).reduce((s, l) => s + l.maxHp, 0)),
            dashing: Boolean(player.dashing),
            gunId: player.weaponId || '',
            isReloading: Boolean(player.isReloading),
        });
    }

    sendShoot(x, y, angle, gunId) {
        this._send({ type: 'shoot', x: Math.round(x), y: Math.round(y), angle: +angle.toFixed(3), gunId });
    }

    sendDeath(x, y) {
        this._send({ type: 'death', x: Math.round(x), y: Math.round(y) });
    }

    sendExtract() {
        this._send({ type: 'extract' });
    }

    sendLeave() {
        this._send({ type: 'leave' });
        this.raidId = null;
    }

    // Phase 2: Shared world
    sendCrateTake(crateId, itemId) {
        this._send({ type: 'crate_take', crateId, itemId });
    }

    sendHpTake(hpId) {
        this._send({ type: 'hp_take', hpId });
    }

    sendCrateSpawn(crate) {
        this._send({ type: 'crate_spawn', crate });
    }

    sendOpDeath() {
        this._send({ type: 'op_death' });
    }

    // Phase 3: PvP
    sendPvpHit(target, damage, gunId) {
        this._send({ type: 'pvp_hit', target, damage, gunId });
    }

    // Phase 4: Shared AI (host only)
    sendEnemySync(enemies) {
        this._send({ type: 'enemy_sync', enemies });
    }

    sendEnemyHit(enemyId, damage, killed) {
        this._send({ type: 'enemy_hit', enemyId, damage, killed });
    }

    sendEnemyBullet(data) {
        this._send({ type: 'enemy_bullet', data });
    }

    isInRaid() {
        return this.connected && this.authenticated && this.raidId != null;
    }

    _send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    _handleMessage(msg, authResolve) {
        switch (msg.type) {
            case 'auth_ok':
                this.authenticated = true;
                if (authResolve) authResolve();
                break;

            case 'raid_joined':
                this.raidId = msg.raidId;
                this.mapSeed = msg.mapSeed;
                this.difficulty = msg.difficulty;
                if (this.onRaidJoined) this.onRaidJoined(msg);
                break;

            case 'raid_start':
                this.isHost = (msg.host === this.username);
                if (this.onRaidStart) this.onRaidStart(msg);
                break;

            case 'players':
                if (this.onPlayersUpdate) this.onPlayersUpdate(msg.data);
                break;

            case 'player_joined':
                if (this.onPlayerJoined) this.onPlayerJoined(msg);
                break;

            case 'player_left':
                if (this.onPlayerLeft) this.onPlayerLeft(msg);
                break;

            case 'player_shoot':
                if (this.onPlayerShoot) this.onPlayerShoot(msg);
                break;

            case 'player_death':
                if (this.onPlayerDeath) this.onPlayerDeath(msg);
                break;

            case 'player_extract':
                if (this.onPlayerExtract) this.onPlayerExtract(msg);
                break;

            // Phase 2: Shared world
            case 'crate_take_ok':
                if (this.onCrateTakeOk) this.onCrateTakeOk(msg);
                break;
            case 'crate_take_fail':
                if (this.onCrateTakeFail) this.onCrateTakeFail(msg);
                break;
            case 'crate_item_taken':
                if (this.onCrateItemTaken) this.onCrateItemTaken(msg);
                break;
            case 'hp_take_ok':
                if (this.onHpTakeOk) this.onHpTakeOk(msg);
                break;
            case 'hp_take_fail':
                if (this.onHpTakeFail) this.onHpTakeFail(msg);
                break;
            case 'hp_taken':
                if (this.onHpTaken) this.onHpTaken(msg);
                break;
            case 'crate_spawned':
                if (this.onCrateSpawned) this.onCrateSpawned(msg);
                break;
            case 'op_death_count':
                if (this.onOpDeathCount) this.onOpDeathCount(msg);
                break;

            // Phase 3: PvP
            case 'pvp_damage':
                if (this.onPvpDamage) this.onPvpDamage(msg);
                break;
            case 'pvp_hit_visual':
                if (this.onPvpHitVisual) this.onPvpHitVisual(msg);
                break;
            case 'pvp_kill':
                if (this.onPvpKill) this.onPvpKill(msg);
                break;

            // Phase 4: Shared AI
            case 'enemy_sync':
                if (this.onEnemySync) this.onEnemySync(msg);
                break;
            case 'enemy_hit':
                if (this.onEnemyHit) this.onEnemyHit(msg);
                break;
            case 'enemy_bullet':
                if (this.onEnemyBullet) this.onEnemyBullet(msg);
                break;

            // Phase 5: Position correction
            case 'pos_correct':
                if (this.onPosCorrect) this.onPosCorrect(msg);
                break;
        }
    }
}
