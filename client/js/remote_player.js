// ============================================================
// remote_player.js — Render and interpolate other human players
// ============================================================

import { COLORS } from './constants.js';

const INTERP_SPEED = 12; // interpolation factor (higher = snappier)

export class RemotePlayer {
    constructor(username) {
        this.username = username;
        this.x = 0;
        this.y = 0;
        this.angle = 0;
        this.vx = 0;
        this.vy = 0;
        this.hp = 100;
        this.maxHp = 100;
        this.alive = true;
        this.shieldHp = 0;
        this.shieldMax = 0;
        this.dashing = false;
        this.gunId = '';
        this.isReloading = false;
        this.radius = 18;

        // Interpolation targets
        this._targetX = 0;
        this._targetY = 0;
        this._targetAngle = 0;
        this._lastUpdate = 0;
    }

    applyState(state) {
        this._targetX = state.x;
        this._targetY = state.y;
        this._targetAngle = state.angle;
        this.vx = state.vx || 0;
        this.vy = state.vy || 0;
        this.hp = state.hp ?? this.hp;
        this.maxHp = state.maxHp ?? this.maxHp;
        this.alive = state.alive ?? this.alive;
        this.shieldHp = state.shieldHp ?? 0;
        this.shieldMax = state.shieldMax ?? 0;
        this.dashing = Boolean(state.dashing);
        this.gunId = state.gunId || '';
        this.isReloading = Boolean(state.isReloading);
        this._lastUpdate = performance.now();

        // Snap if first update or too far away
        const dx = this._targetX - this.x;
        const dy = this._targetY - this.y;
        if (dx * dx + dy * dy > 500 * 500) {
            this.x = this._targetX;
            this.y = this._targetY;
            this.angle = this._targetAngle;
        }
    }

    update(dt) {
        if (!this.alive) return;
        // Smooth interpolation toward target
        const t = Math.min(1, INTERP_SPEED * dt);
        this.x += (this._targetX - this.x) * t;
        this.y += (this._targetY - this.y) * t;
        // Angle interpolation (shortest path)
        let da = this._targetAngle - this.angle;
        if (da > Math.PI) da -= 2 * Math.PI;
        if (da < -Math.PI) da += 2 * Math.PI;
        this.angle += da * t;
    }
}

// Color for remote human players — distinct cyan/teal
const REMOTE_PLAYER_COLOR = '#26c6da';
const REMOTE_PLAYER_STROKE = '#00838f';
const REMOTE_NAME_COLOR = '#80deea';

export function drawRemotePlayers(ctx, camera, remotePlayers) {
    for (const rp of remotePlayers) {
        if (!rp.alive) continue;
        const sx = rp.x - camera.x;
        const sy = rp.y - camera.y;

        // Cull offscreen
        if (sx < -100 || sx > camera.width + 100 || sy < -100 || sy > camera.height + 100) continue;

        ctx.save();

        // Dash trail
        if (rp.dashing) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = COLORS.PLAYER_DASH;
            ctx.beginPath();
            ctx.arc(sx - rp.vx * 0.05, sy - rp.vy * 0.05, rp.radius * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Body circle
        ctx.fillStyle = REMOTE_PLAYER_COLOR;
        ctx.strokeStyle = REMOTE_PLAYER_STROKE;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(sx, sy, rp.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Gun line
        const gunLen = 22;
        const gx = sx + Math.cos(rp.angle) * gunLen;
        const gy = sy + Math.sin(rp.angle) * gunLen;
        ctx.strokeStyle = '#90a4ae';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(rp.angle) * rp.radius * 0.6, sy + Math.sin(rp.angle) * rp.radius * 0.6);
        ctx.lineTo(gx, gy);
        ctx.stroke();

        // Eye dot
        const eyeDist = rp.radius * 0.45;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx + Math.cos(rp.angle) * eyeDist, sy + Math.sin(rp.angle) * eyeDist, 3, 0, Math.PI * 2);
        ctx.fill();

        // HP bar
        const barW = 36;
        const barH = 4;
        const barX = sx - barW / 2;
        const barY = sy - rp.radius - 14;
        const hpFrac = Math.max(0, rp.hp / Math.max(1, rp.maxHp));

        // Shield bar (above HP)
        if (rp.shieldMax > 0) {
            const sFrac = Math.max(0, rp.shieldHp / Math.max(1, rp.shieldMax));
            ctx.fillStyle = COLORS.HP_BAR_BG;
            ctx.fillRect(barX, barY - 6, barW, barH);
            ctx.fillStyle = COLORS.SHIELD_BAR;
            ctx.fillRect(barX, barY - 6, barW * sFrac, barH);
        }

        ctx.fillStyle = COLORS.HP_BAR_BG;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = hpFrac > 0.3 ? COLORS.HP_BAR : COLORS.HP_BAR_LOW;
        ctx.fillRect(barX, barY, barW * hpFrac, barH);

        // Name
        ctx.fillStyle = REMOTE_NAME_COLOR;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(rp.username, sx, barY - (rp.shieldMax > 0 ? 10 : 4));

        ctx.restore();
    }
}
