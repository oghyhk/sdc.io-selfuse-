// ============================================================
// renderer.js — Canvas rendering for all game objects
// ============================================================

import {
    TILE_SIZE, MAP_COLS, MAP_ROWS, MAP_WIDTH, MAP_HEIGHT,
    TILE, ZONE, COLORS, EXTRACTION_RADIUS, EXTRACTION_TIME,
    PLAYER_DASH_COOLDOWN, CRATE_WIDTH, CRATE_HEIGHT
} from './constants.js';
import { getRarityMeta } from './profile.js';

export class Renderer {
    constructor(ctx, camera) {
        this.ctx = ctx;
        this.cam = camera;
    }

    clear() {
        const { ctx, cam } = this;
        ctx.fillStyle = COLORS.BG;
        ctx.fillRect(0, 0, cam.width, cam.height);
    }

    // ---------- Map ----------
    drawMap(tiles, zones) {
        const { ctx, cam } = this;
        const startCol = Math.max(0, Math.floor(cam.x / TILE_SIZE));
        const endCol = Math.min(MAP_COLS - 1, Math.floor((cam.x + cam.width) / TILE_SIZE));
        const startRow = Math.max(0, Math.floor(cam.y / TILE_SIZE));
        const endRow = Math.min(MAP_ROWS - 1, Math.floor((cam.y + cam.height) / TILE_SIZE));

        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const tile = tiles[r][c];
                const sx = c * TILE_SIZE - cam.x;
                const sy = r * TILE_SIZE - cam.y;

                if (tile === TILE.WALL) {
                    ctx.fillStyle = COLORS.WALL;
                    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                    ctx.strokeStyle = COLORS.WALL_STROKE;
                    ctx.lineWidth = 1;
                    ctx.strokeRect(sx + 0.5, sy + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
                } else {
                    // Floor — zone-based coloring
                    const zone = zones[r][c];
                    if (zone === ZONE.HIGH_VALUE) {
                        ctx.fillStyle = '#1a0f0f';
                    } else if (zone === ZONE.COMBAT) {
                        ctx.fillStyle = COLORS.FLOOR_DARK;
                    } else {
                        ctx.fillStyle = COLORS.FLOOR;
                    }
                    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

                    // Subtle grid
                    ctx.strokeStyle = COLORS.GRID;
                    ctx.lineWidth = 0.5;
                    ctx.strokeRect(sx, sy, TILE_SIZE, TILE_SIZE);
                }
            }
        }
    }

    // ---------- Extraction zones ----------
    drawExtractionZones(zones, playerExtracting, extractTimer) {
        const { ctx, cam } = this;
        for (const ez of zones) {
            const sx = ez.x - cam.x;
            const sy = ez.y - cam.y;

            // Glow
            const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, ez.radius * 1.5);
            gradient.addColorStop(0, COLORS.EXTRACTION_GLOW);
            gradient.addColorStop(1, 'rgba(68,138,255,0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(sx, sy, ez.radius * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Circle outline (pulsing)
            const pulse = 0.8 + 0.2 * Math.sin(Date.now() / 300);
            ctx.strokeStyle = COLORS.EXTRACTION;
            ctx.lineWidth = 2;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            ctx.arc(sx, sy, ez.radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            // Inner dashed circle
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = COLORS.EXTRACTION_ACTIVE;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(sx, sy, ez.radius * 0.7, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label
            ctx.fillStyle = COLORS.EXTRACTION;
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('EXTRACT', sx, sy - ez.radius - 8);

            // Arrow indicator
            ctx.fillText('▼', sx, sy - ez.radius + 4);
        }
    }

    // ---------- Crates ----------
    drawCrates(crates, nearbyCrateId, openCrateId) {
        const { ctx, cam } = this;
        for (const crate of crates) {
            const sx = crate.x - cam.x;
            const sy = crate.y - cam.y;
            if (sx < -40 || sx > cam.width + 40 || sy < -40 || sy > cam.height + 40) continue;

            const isNearby = crate.id === nearbyCrateId;
            const isOpen = crate.id === openCrateId;
            const baseY = sy - CRATE_HEIGHT / 2;
            const baseX = sx - CRATE_WIDTH / 2;

            ctx.fillStyle = crate.inspected ? COLORS.CRATE_OPENED : COLORS.CRATE;
            ctx.fillRect(baseX, baseY, CRATE_WIDTH, CRATE_HEIGHT);
            ctx.strokeStyle = isNearby ? COLORS.CRATE_INTERACT : COLORS.CRATE_DARK;
            ctx.lineWidth = isNearby ? 2 : 1.5;
            ctx.strokeRect(baseX, baseY, CRATE_WIDTH, CRATE_HEIGHT);

            ctx.fillStyle = COLORS.CRATE_DARK;
            if (isOpen) {
                ctx.fillRect(baseX - 1, baseY - 7, CRATE_WIDTH + 2, 8);
            } else {
                ctx.fillRect(baseX - 1, baseY + 3, CRATE_WIDTH + 2, 7);
            }

            if (crate.inspected) {
                ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                ctx.beginPath();
                ctx.moveTo(baseX + 5, baseY + 6);
                ctx.lineTo(baseX + CRATE_WIDTH - 5, baseY + CRATE_HEIGHT - 6);
                ctx.stroke();
            }

            if (crate.items.length > 0) {
                const topItem = crate.items[0];
                const rarity = getRarityMeta(topItem.rarity);
                ctx.fillStyle = rarity.color;
                ctx.beginPath();
                ctx.arc(baseX + CRATE_WIDTH - 6, baseY + 6, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            if (isNearby) {
                ctx.fillStyle = COLORS.CRATE_INTERACT;
                ctx.font = 'bold 10px monospace';
                ctx.fillText(isOpen ? 'F CLOSE' : 'F OPEN', sx, baseY - 20);
            }
        }
    }

    // ---------- Health packs ----------
    drawHealthPacks(packs) {
        const { ctx, cam } = this;
        for (const hp of packs) {
            if (hp.collected) continue;
            const sx = hp.x - cam.x;
            const sy = hp.y - cam.y;
            if (sx < -20 || sx > cam.width + 20 || sy < -20 || sy > cam.height + 20) continue;

            ctx.fillStyle = COLORS.HEALTHPACK;
            ctx.shadowColor = COLORS.HEALTHPACK;
            ctx.shadowBlur = 6;
            // Cross shape
            const s = hp.radius * 0.6;
            ctx.fillRect(sx - s / 2, sy - s * 1.5, s, s * 3);
            ctx.fillRect(sx - s * 1.5, sy - s / 2, s * 3, s);
            ctx.shadowBlur = 0;
        }
    }

    // ---------- Player ----------
    drawPlayer(player) {
        const { ctx, cam } = this;
        if (!player.alive) return;

        const sx = player.x - cam.x;
        const sy = player.y - cam.y;

        // Dash trail
        if (player.dashing) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = COLORS.PLAYER_DASH;
            ctx.beginPath();
            ctx.arc(sx - Math.cos(player.angle) * 15, sy - Math.sin(player.angle) * 15, player.radius * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Body
        ctx.fillStyle = player.damageFlash > 0 ? '#ff6666' : COLORS.PLAYER;
        ctx.strokeStyle = COLORS.PLAYER_STROKE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Direction indicator (gun barrel)
        const barrelLen = player.radius + 8;
        const bx = sx + Math.cos(player.angle) * barrelLen;
        const by = sy + Math.sin(player.angle) * barrelLen;
        ctx.strokeStyle = COLORS.PLAYER_STROKE;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(player.angle) * player.radius * 0.5, sy + Math.sin(player.angle) * player.radius * 0.5);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Eye / face direction
        const eyeX = sx + Math.cos(player.angle) * player.radius * 0.4;
        const eyeY = sy + Math.sin(player.angle) * player.radius * 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---------- Enemies ----------
    drawEnemies(enemies) {
        const { ctx, cam } = this;
        for (const e of enemies) {
            if (!e.alive && e.deathTimer > 0.5) continue; // fade out

            const sx = e.x - cam.x;
            const sy = e.y - cam.y;
            if (sx < -50 || sx > cam.width + 50 || sy < -50 || sy > cam.height + 50) continue;

            // Death fade
            if (!e.alive) {
                ctx.globalAlpha = Math.max(0, 1 - e.deathTimer * 2);
            }

            if (e.type === 'drone') {
                // Triangle shape
                const color = e.damageFlash > 0 ? '#ffaaaa' : COLORS.ENEMY_DRONE;
                ctx.fillStyle = color;
                ctx.strokeStyle = COLORS.ENEMY_DRONE_STROKE;
                ctx.lineWidth = 2;
                const r = e.radius;
                ctx.beginPath();
                ctx.moveTo(sx + Math.cos(e.angle) * r * 1.3, sy + Math.sin(e.angle) * r * 1.3);
                ctx.lineTo(sx + Math.cos(e.angle + 2.4) * r, sy + Math.sin(e.angle + 2.4) * r);
                ctx.lineTo(sx + Math.cos(e.angle - 2.4) * r, sy + Math.sin(e.angle - 2.4) * r);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            } else {
                // Sentinel — hexagon
                const color = e.damageFlash > 0 ? '#ffcc80' : COLORS.ENEMY_SENTINEL;
                ctx.fillStyle = color;
                ctx.strokeStyle = COLORS.ENEMY_SENTINEL_STROKE;
                ctx.lineWidth = 2;
                const r = e.radius;
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const a = (Math.PI / 3) * i + e.angle;
                    const px = sx + Math.cos(a) * r;
                    const py = sy + Math.sin(a) * r;
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Gun barrel
                const bx = sx + Math.cos(e.angle) * (r + 6);
                const by = sy + Math.sin(e.angle) * (r + 6);
                ctx.strokeStyle = COLORS.ENEMY_SENTINEL_STROKE;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(sx + Math.cos(e.angle) * r * 0.5, sy + Math.sin(e.angle) * r * 0.5);
                ctx.lineTo(bx, by);
                ctx.stroke();
            }

            // HP bar (if damaged)
            if (e.alive && e.hp < e.maxHp) {
                const barW = e.radius * 2.5;
                const barH = 3;
                const barX = sx - barW / 2;
                const barY = sy - e.radius - 10;
                ctx.fillStyle = COLORS.HP_BAR_BG;
                ctx.fillRect(barX, barY, barW, barH);
                ctx.fillStyle = e.hp / e.maxHp > 0.3 ? COLORS.HP_BAR : COLORS.HP_BAR_LOW;
                ctx.fillRect(barX, barY, barW * (e.hp / e.maxHp), barH);
            }

            // State indicator (debug-ish but helpful)
            if (e.alive && e.state === 'chase') {
                ctx.fillStyle = 'rgba(255,82,82,0.3)';
                ctx.font = '8px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('!', sx, sy - e.radius - 14);
            }

            ctx.globalAlpha = 1;
        }
    }

    // ---------- Bullets ----------
    drawBullets(bullets) {
        const { ctx, cam } = this;
        for (const b of bullets) {
            const sx = b.x - cam.x;
            const sy = b.y - cam.y;
            if (sx < -10 || sx > cam.width + 10 || sy < -10 || sy > cam.height + 10) continue;

            const color = b.owner === 'player' ? COLORS.BULLET_PLAYER : COLORS.BULLET_ENEMY;
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.arc(sx, sy, b.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Trail
            const trail = 0.4 + (b.life / b.maxLife) * 0.6;
            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = color;
            ctx.lineWidth = b.radius * 1.5;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx - b.vx * 0.03, sy - b.vy * 0.03);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    // ---------- Crosshair ----------
    drawCrosshair(mouseX, mouseY) {
        const { ctx } = this;
        ctx.strokeStyle = COLORS.CROSSHAIR;
        ctx.lineWidth = 1.5;
        const s = 10;
        ctx.beginPath();
        ctx.moveTo(mouseX - s, mouseY);
        ctx.lineTo(mouseX - s / 3, mouseY);
        ctx.moveTo(mouseX + s / 3, mouseY);
        ctx.lineTo(mouseX + s, mouseY);
        ctx.moveTo(mouseX, mouseY - s);
        ctx.lineTo(mouseX, mouseY - s / 3);
        ctx.moveTo(mouseX, mouseY + s / 3);
        ctx.lineTo(mouseX, mouseY + s);
        ctx.stroke();

        // Dot
        ctx.fillStyle = COLORS.CROSSHAIR;
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---------- Damage flash overlay ----------
    drawDamageFlash(player) {
        if (!player.alive || player.damageFlash <= 0) return;
        const { ctx, cam } = this;
        ctx.fillStyle = COLORS.DAMAGE_FLASH;
        ctx.globalAlpha = player.damageFlash / 0.15;
        ctx.fillRect(0, 0, cam.width, cam.height);
        ctx.globalAlpha = 1;
    }

    // ---------- HUD ----------
    drawHUD(player, gameTime, extracting, extractTimer, interactionText = '', crateMessage = '') {
        const { ctx, cam } = this;

        const barGroupW = 260;
        const hpBarW = barGroupW;
        const hpBarH = 16;
        const energyBarW = 180;
        const energyBarH = 6;
        const hpX = cam.width / 2 - hpBarW / 2;
        const hpY = cam.height - 46;
        const energyX = cam.width / 2 - energyBarW / 2;
        const energyY = hpY - 12;

        // Energy bar
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(energyX, energyY, energyBarW, energyBarH);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(energyX, energyY, energyBarW * (player.energy / player.energyMax), energyBarH);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(energyX, energyY, energyBarW, energyBarH);

        // Health bar
        ctx.fillStyle = COLORS.HP_BAR_BG;
        ctx.fillRect(hpX, hpY, hpBarW, hpBarH);
        const hpRatio = player.hp / player.maxHp;
        ctx.fillStyle = hpRatio > 0.3 ? COLORS.HP_BAR : COLORS.HP_BAR_LOW;
        ctx.fillRect(hpX, hpY, hpBarW * hpRatio, hpBarH);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(hpX, hpY, hpBarW, hpBarH);

        // HP text
        ctx.fillStyle = COLORS.HUD_TEXT;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`HP ${player.hp}/${player.maxHp}`, cam.width / 2, hpY + 12);

        // Carry summary
        ctx.fillStyle = COLORS.LOOT_COMMON;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`CARRY ${player.getCarriedItemCount()}/${player.carryCapacity} · EST. VALUE ${player.loot}c`, cam.width / 2, hpY - 20);

        const dashReady = player.dashCooldown <= 0;
        const modeText = player.isSlowMode ? 'SLOW' : 'NORMAL';
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.fillText(`ENERGY ${Math.round(player.energy)}/${player.energyMax} · MODE ${modeText} · R TO TOGGLE · DASH ${dashReady ? 'READY' : `${player.dashCooldown.toFixed(1)}s`}`, cam.width / 2, hpY + 32);

        // Timer
        const minutes = Math.floor(gameTime / 60);
        const seconds = Math.floor(gameTime % 60);
        ctx.fillStyle = COLORS.HUD_TEXT;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`, cam.width / 2, 25);

        if (interactionText) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(cam.width / 2 - 110, cam.height - 120, 220, 28);
            ctx.fillStyle = COLORS.CRATE_INTERACT;
            ctx.font = 'bold 12px monospace';
            ctx.fillText(interactionText, cam.width / 2, cam.height - 101);
        }

        if (crateMessage) {
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.fillRect(cam.width / 2 - 110, 44, 220, 26);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px monospace';
            ctx.fillText(crateMessage, cam.width / 2, 61);
        }

        // Extraction progress
        if (extracting) {
            const barW = 200;
            const barH = 20;
            const bx = cam.width / 2 - barW / 2;
            const by = cam.height / 2 + 60;
            const progress = extractTimer / EXTRACTION_TIME;

            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(bx - 5, by - 25, barW + 10, barH + 30);
            ctx.fillStyle = COLORS.EXTRACTION;
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('EXTRACTING...', cam.width / 2, by - 8);

            ctx.fillStyle = COLORS.HP_BAR_BG;
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = COLORS.EXTRACTION;
            ctx.fillRect(bx, by, barW * progress, barH);
            ctx.strokeStyle = '#555';
            ctx.strokeRect(bx, by, barW, barH);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`${(progress * 100).toFixed(0)}%`, cam.width / 2, by + 14);
        }
    }

    // ---------- Minimap ----------
    drawMinimap(tiles, player, enemies, crates, extractionPoints) {
        const { ctx, cam } = this;
        const mmW = 160;
        const mmH = 120;
        const mmX = cam.width - mmW - 15;
        const mmY = 15;
        const scaleX = mmW / MAP_WIDTH;
        const scaleY = mmH / MAP_HEIGHT;

        // BG
        ctx.fillStyle = COLORS.MINIMAP_BG;
        ctx.fillRect(mmX, mmY, mmW, mmH);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(mmX, mmY, mmW, mmH);

        // Walls (simplified - sample every N tiles)
        const step = 2;
        ctx.fillStyle = COLORS.MINIMAP_WALL;
        for (let r = 0; r < MAP_ROWS; r += step) {
            for (let c = 0; c < MAP_COLS; c += step) {
                if (tiles[r][c] === TILE.WALL) {
                    ctx.fillRect(
                        mmX + c * TILE_SIZE * scaleX,
                        mmY + r * TILE_SIZE * scaleY,
                        Math.max(1, TILE_SIZE * step * scaleX),
                        Math.max(1, TILE_SIZE * step * scaleY)
                    );
                }
            }
        }

        // Extraction zones
        ctx.fillStyle = COLORS.MINIMAP_EXTRACTION;
        for (const ez of extractionPoints) {
            ctx.beginPath();
            ctx.arc(mmX + ez.x * scaleX, mmY + ez.y * scaleY, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Loot crates with remaining items
        ctx.fillStyle = COLORS.MINIMAP_LOOT;
        for (const crate of crates) {
            if (crate.items.length === 0) continue;
            ctx.fillRect(mmX + crate.x * scaleX - 1, mmY + crate.y * scaleY - 1, 2, 2);
        }

        // Enemies (alive only)
        ctx.fillStyle = COLORS.MINIMAP_ENEMY;
        for (const e of enemies) {
            if (!e.alive) continue;
            ctx.fillRect(mmX + e.x * scaleX - 1, mmY + e.y * scaleY - 1, 2, 2);
        }

        // Player
        ctx.fillStyle = COLORS.MINIMAP_PLAYER;
        ctx.beginPath();
        ctx.arc(mmX + player.x * scaleX, mmY + player.y * scaleY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Camera viewport rectangle
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(
            mmX + cam.x * scaleX,
            mmY + cam.y * scaleY,
            cam.width * scaleX,
            cam.height * scaleY
        );

        // Label
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('MAP', mmX + mmW - 3, mmY + mmH - 3);
    }
}
