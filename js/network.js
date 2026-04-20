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
        this.onRaidStart = null;    // ({ raidId, mapSeed, difficulty, players }) => {}
        this.onPlayersUpdate = null;  // (playerStates[]) => {}
        this.onPlayerJoined = null;  // ({ username, playerCount }) => {}
        this.onPlayerLeft = null;    // ({ username }) => {}
        this.onPlayerShoot = null;   // ({ username, x, y, angle, gunId }) => {}
        this.onPlayerDeath = null;   // ({ username, x, y }) => {}
        this.onPlayerExtract = null; // ({ username }) => {}
        this.onDisconnect = null;    // () => {}

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
        }
    }
}
