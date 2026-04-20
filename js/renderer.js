// ============================================================
// renderer.js — Canvas rendering for all game objects
// ============================================================

import {
    TILE_SIZE, MAP_COLS, MAP_ROWS, MAP_WIDTH, MAP_HEIGHT,
    TILE, ZONE, COLORS, EXTRACTION_RADIUS, EXTRACTION_TIME,
    PLAYER_DASH_COOLDOWN, CRATE_WIDTH, CRATE_HEIGHT
} from './constants.js';
import { formatCompactValue, getRarityMeta } from './profile.js';

export class Renderer {
    constructor(ctx, camera) {
        this.ctx = ctx;
        this.cam = camera;
        this.coinImage = new Image();
        this.coinImage.src = '/assets/items/coin.png';
    }

    clear() {
        const { ctx, cam } = this;
        ctx.fillStyle = COLORS.BG;
        ctx.fillRect(0, 0, cam.width, cam.height);
    }

    drawCoinValueText(label, value, x, y, options = {}) {
        const { ctx } = this;
        const text = `${label}${formatCompactValue(value)}`;
        const gap = options.gap ?? 6;
        const iconSize = options.iconSize ?? 14;
        const align = options.align || ctx.textAlign || 'left';
        const iconOffsetY = options.iconOffsetY ?? (ctx.textBaseline === 'middle' ? -iconSize / 2 : -iconSize + 3);
        const textWidth = ctx.measureText(text).width;
        const totalWidth = textWidth + gap + iconSize;

        let startX = x;
        if (align === 'center') {
            startX = x - totalWidth / 2;
        } else if (align === 'right' || align === 'end') {
            startX = x - totalWidth;
        }

        ctx.save();
        ctx.textAlign = 'left';
        ctx.fillText(text, startX, y);
        if (this.coinImage.complete && this.coinImage.naturalWidth > 0) {
            ctx.drawImage(this.coinImage, startX + textWidth + gap, y + iconOffsetY, iconSize, iconSize);
        } else {
            ctx.fillText(' c', startX + textWidth, y);
        }
        ctx.restore();
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
                        ctx.fillStyle = COLORS.FLOOR_HIGH_VALUE;
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
    drawExtractionZones(zones, playerExtracting, extractTimer, gateOpen = true) {
        const { ctx, cam } = this;
        for (const ez of zones) {
            const sx = ez.x - cam.x;
            const sy = ez.y - cam.y;

            if (!gateOpen) {
                // Locked — dim red pulsing circle
                const pulse = 0.4 + 0.15 * Math.sin(Date.now() / 500);
                ctx.globalAlpha = pulse;
                ctx.strokeStyle = '#ff5252';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sx, sy, ez.radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#ff5252';
                ctx.font = 'bold 11px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('LOCKED', sx, sy - ez.radius - 8);
                ctx.fillText('🔒', sx, sy);
                ctx.globalAlpha = 1;
                continue;
            }

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

            // Use tier color for crate base
            const crateColor = crate.tierColor || COLORS.CRATE;
            ctx.fillStyle = crate.inspected ? COLORS.CRATE_OPENED : crateColor;
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

            // Show highest rarity dot
            if (crate.items.length > 0) {
                const topRarity = crate.items.reduce((best, item) => {
                    const order = ['white','green','blue','purple','gold','red'];
                    return order.indexOf(item.rarity) < order.indexOf(best) ? item.rarity : best;
                }, 'red');
                const rarity = getRarityMeta(topRarity);
                ctx.fillStyle = rarity.color;
                ctx.beginPath();
                ctx.arc(baseX + CRATE_WIDTH - 6, baseY + 6, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            if (isNearby) {
                ctx.fillStyle = COLORS.CRATE_INTERACT;
                ctx.font = 'bold 10px monospace';
                // Show tier label + open/close
                const label = crate.tierLabel ? crate.tierLabel.toUpperCase() : 'CRATE';
                ctx.fillText(isOpen ? 'F CLOSE' : `F · ${label}`, sx, baseY - 20);
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

        if (player.isHealing) {
            this.drawHealingEffect(sx, sy, player.radius);
        }

        // Dash trail
        if (player.dashing) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = COLORS.PLAYER_DASH;
            ctx.beginPath();
            ctx.arc(sx - Math.cos(player.angle) * 15, sy - Math.sin(player.angle) * 15, player.radius * 0.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        this._drawOperatorBackpack(player, sx, sy);

        // Body
        ctx.fillStyle = player.damageFlash > 0 ? '#ff6666' : COLORS.PLAYER;
        ctx.strokeStyle = COLORS.PLAYER_STROKE;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        this._drawOperatorArmorRing(player, sx, sy);
        this._drawOperatorHelmet(player, sx, sy);

        // Direction indicator (gun barrel)
        this._drawOperatorGun(player, sx, sy, COLORS.PLAYER_STROKE);

        // Eye / face direction
        const eyeX = sx + Math.cos(player.angle) * player.radius * 0.4;
        const eyeY = sy + Math.sin(player.angle) * player.radius * 0.4;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2);
        ctx.fill();

        const shieldHpP = (player.shieldLayers || []).reduce((s, l) => s + l.hp, 0);
        const shieldMaxP = (player.shieldLayers || []).reduce((s, l) => s + l.maxHp, 0);
        const totalCapP = Math.max(1, player.maxHp + shieldMaxP);
        const miniBarW = player.radius * 2.2;
        const miniBarH = 4;
        const miniBarX = sx - miniBarW / 2;
        const miniBarY = sy + player.radius + 2;
        ctx.fillStyle = COLORS.HP_BAR_BG;
        ctx.fillRect(miniBarX, miniBarY, miniBarW, miniBarH);
        const hpRatioP = player.hp / Math.max(1, player.maxHp);
        const hpFracP = Math.max(0, Math.min(1, player.hp / totalCapP));
        ctx.fillStyle = hpRatioP > 0.3 ? COLORS.HP_BAR : COLORS.HP_BAR_LOW;
        ctx.fillRect(miniBarX, miniBarY, miniBarW * hpFracP, miniBarH);
        if (shieldHpP > 0) {
            ctx.fillStyle = COLORS.SHIELD_BAR;
            ctx.fillRect(miniBarX + miniBarW * hpFracP, miniBarY, miniBarW * Math.max(0, Math.min(1, shieldHpP / totalCapP)), miniBarH);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(miniBarX, miniBarY, miniBarW, miniBarH);

        this._drawOperatorName(player, sx, sy, COLORS.OPERATOR_NAME_SELF);
    }

    _getRarityColor(itemDefinition, fallback = COLORS.PLAYER_STROKE) {
        return itemDefinition ? getRarityMeta(itemDefinition.rarity).color : fallback;
    }

    _drawOperatorArmorRing(operator, sx, sy) {
        const { ctx } = this;
        if (!operator?.armor) return;

        ctx.save();
        ctx.strokeStyle = this._getRarityColor(operator.armor, COLORS.PLAYER_STROKE);
        ctx.lineWidth = 3;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(sx, sy, operator.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    _drawOperatorHelmet(operator, sx, sy) {
        const { ctx } = this;
        if (!operator?.helmet) return;

        const helmetRadius = operator.radius * 0.46;
        const helmetX = sx + Math.cos(operator.angle) * operator.radius * 0.12;
        const helmetY = sy - operator.radius * 0.28;

        ctx.save();
        ctx.fillStyle = this._getRarityColor(operator.helmet, COLORS.PLAYER_STROKE);
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(helmetX, helmetY, helmetRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawOperatorBackpack(operator, sx, sy) {
        const { ctx } = this;
        if (!operator?.backpack) return;

        const backpackRadius = operator.radius * 0.62;
        const backpackX = sx - Math.cos(operator.angle) * operator.radius * 0.58;
        const backpackY = sy - Math.sin(operator.angle) * operator.radius * 0.58;

        ctx.save();
        ctx.fillStyle = this._getRarityColor(operator.backpack, COLORS.PLAYER_STROKE);
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(backpackX, backpackY, backpackRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawOperatorGun(operator, sx, sy, fallbackStroke) {
        const { ctx } = this;
        const barrelLen = operator.radius + 8;
        const startX = sx + Math.cos(operator.angle) * operator.radius * 0.5;
        const startY = sy + Math.sin(operator.angle) * operator.radius * 0.5;
        const endX = sx + Math.cos(operator.angle) * barrelLen;
        const endY = sy + Math.sin(operator.angle) * barrelLen;
        const gunColor = this._getRarityColor(operator?.weapon, fallbackStroke);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.strokeStyle = gunColor;
        ctx.lineWidth = 4;
        ctx.shadowColor = gunColor;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.restore();
    }

    _drawOperatorName(operator, sx, sy, color) {
        const { ctx } = this;
        if (!operator?.displayName) return;
        ctx.save();
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = color;
        ctx.shadowColor = 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = 6;
        ctx.fillText(operator.displayName, sx, sy + operator.radius + 8);
        ctx.restore();
    }

    _drawFloatingDamageTexts(operator, sx, sy) {
        const { ctx } = this;
        if (!operator?.floatingDamageTexts?.length) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const entry of operator.floatingDamageTexts) {
            const alpha = Math.max(0, entry.life / entry.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ff5a5a';
            ctx.shadowColor = 'rgba(0,0,0,0.7)';
            ctx.shadowBlur = 8;
            ctx.font = 'bold 13px monospace';
            ctx.fillText(`-${entry.value}`, sx + entry.xOffset, sy + entry.yOffset);
        }

        ctx.restore();
        ctx.globalAlpha = 1;
    }

    drawAiPlayers(players = [], localPlayer = null) {
        const { ctx, cam } = this;
        for (const bot of players) {
            if (!bot) continue;
            if (bot.aiExtracted) continue;
            if (!bot.alive && bot.deathTimer > 0.65) continue;

            const sx = bot.x - cam.x;
            const sy = bot.y - cam.y;
            if (sx < -60 || sx > cam.width + 60 || sy < -60 || sy > cam.height + 60) continue;

            if (!bot.alive) {
                ctx.globalAlpha = Math.max(0, 1 - bot.deathTimer * 1.6);
            }

            this._drawOperatorBackpack(bot, sx, sy);

            ctx.fillStyle = bot.damageFlash > 0 ? '#bbdefb' : COLORS.AI_PLAYER;
            ctx.strokeStyle = COLORS.AI_PLAYER_STROKE;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(sx, sy, bot.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            this._drawOperatorArmorRing(bot, sx, sy);
            this._drawOperatorHelmet(bot, sx, sy);

            this._drawOperatorGun(bot, sx, sy, COLORS.AI_PLAYER_STROKE);

            const eyeX = sx + Math.cos(bot.angle) * bot.radius * 0.4;
            const eyeY = sy + Math.sin(bot.angle) * bot.radius * 0.4;
            ctx.fillStyle = '#f5fbff';
            ctx.beginPath();
            ctx.arc(eyeX, eyeY, 3, 0, Math.PI * 2);
            ctx.fill();

            const shieldHpB = (bot.shieldLayers || []).reduce((s, l) => s + l.hp, 0);
            const shieldMaxB = (bot.shieldLayers || []).reduce((s, l) => s + l.maxHp, 0);
            const totalCapB = Math.max(1, bot.maxHp + shieldMaxB);
            const miniBarW = bot.radius * 2.2;
            const miniBarH = 4;
            const miniBarX = sx - miniBarW / 2;
            const miniBarY = sy + bot.radius + 2;
            ctx.fillStyle = COLORS.HP_BAR_BG;
            ctx.fillRect(miniBarX, miniBarY, miniBarW, miniBarH);
            const hpRatioB = bot.hp / Math.max(1, bot.maxHp);
            const hpFracB = Math.max(0, Math.min(1, bot.hp / totalCapB));
            ctx.fillStyle = hpRatioB > 0.3 ? COLORS.HP_BAR : COLORS.HP_BAR_LOW;
            ctx.fillRect(miniBarX, miniBarY, miniBarW * hpFracB, miniBarH);
            if (shieldHpB > 0) {
                ctx.fillStyle = COLORS.SHIELD_BAR;
                ctx.fillRect(miniBarX + miniBarW * hpFracB, miniBarY, miniBarW * Math.max(0, Math.min(1, shieldHpB / totalCapB)), miniBarH);
            }
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(miniBarX, miniBarY, miniBarW, miniBarH);

            const nameColor = localPlayer && localPlayer.isFriendlyWith?.(bot)
                ? COLORS.OPERATOR_NAME_TEAM
                : COLORS.OPERATOR_NAME_ENEMY;
            this._drawOperatorName(bot, sx, sy, nameColor);

            ctx.globalAlpha = 1;
        }
    }

    drawHealingEffect(sx, sy, radius) {
        const { ctx } = this;
        const time = Date.now() * 0.0024;
        const plusCount = 6;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < plusCount; i++) {
            const phase = (i / plusCount) + time;
            const orbitAngle = phase * Math.PI * 2;
            const orbitRadius = radius + 6 + ((i % 2) * 5);
            const rise = (phase % 1) * 24;
            const px = sx + Math.cos(orbitAngle) * orbitRadius;
            const py = sy - rise + Math.sin(orbitAngle * 0.7) * 6;
            const alpha = 0.2 + (1 - (phase % 1)) * 0.6;
            const size = 12 + ((i + Math.floor(time * 3)) % 3);

            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#8dff98';
            ctx.shadowColor = '#4caf50';
            ctx.shadowBlur = 10;
            ctx.font = `bold ${size}px monospace`;
            ctx.fillText('+', px, py);
        }

        ctx.restore();
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

            if (b.projectileStyle === 'ap') {
                const projectileWidth = Math.max(2, Number(b.projectileWidth) || 4);
                const projectileLength = Math.max(projectileWidth * 3, Number(b.projectileLength) || 24);
                const tailLength = Math.max(projectileLength * 2, Number(b.trailLength) || 52);
                const angle = Math.atan2(b.vy, b.vx);

                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(angle);

                const tailGradient = ctx.createLinearGradient(0, 0, -tailLength, 0);
                tailGradient.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
                tailGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = tailGradient;
                ctx.fillRect(-tailLength, -projectileWidth * 0.45, tailLength, projectileWidth * 0.9);

                ctx.fillStyle = b.projectileColor || '#050505';
                ctx.fillRect(-projectileLength * 0.2, -projectileWidth * 0.5, projectileLength, projectileWidth);

                ctx.restore();
                continue;
            }

            const color = b.owner === 'enemy'
                ? COLORS.BULLET_ENEMY
                : (b.color || COLORS.BULLET_PLAYER);
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
        return;
    }

    // ---------- HUD ----------
    drawHUD(player, gameTime, extracting, extractTimer, interactionText = '', crateMessage = '', killFeed = [], killBanner = null) {
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

        // Energy bar (hidden with gravity boots)
        if (!player.hasGravityBoots) {
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(energyX, energyY, energyBarW, energyBarH);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(energyX, energyY, energyBarW * (player.energy / player.energyMax), energyBarH);
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1;
            ctx.strokeRect(energyX, energyY, energyBarW, energyBarH);
        }

        // Health bar (with shield)
        const hudShieldHp = (player.shieldLayers || []).reduce((s, l) => s + l.hp, 0);
        const hudShieldMax = (player.shieldLayers || []).reduce((s, l) => s + l.maxHp, 0);
        const hudTotalCap = Math.max(1, player.maxHp + hudShieldMax);
        ctx.fillStyle = COLORS.HP_BAR_BG;
        ctx.fillRect(hpX, hpY, hpBarW, hpBarH);
        const hpRatio = player.hp / Math.max(1, player.maxHp);
        const hudHpFrac = Math.max(0, Math.min(1, player.hp / hudTotalCap));
        ctx.fillStyle = hpRatio > 0.3 ? COLORS.HP_BAR : COLORS.HP_BAR_LOW;
        ctx.fillRect(hpX, hpY, hpBarW * hudHpFrac, hpBarH);
        if (hudShieldHp > 0) {
            ctx.fillStyle = COLORS.SHIELD_BAR;
            const shieldFrac = Math.max(0, Math.min(1, hudShieldHp / hudTotalCap));
            ctx.fillRect(hpX + hpBarW * hudHpFrac, hpY, hpBarW * shieldFrac, hpBarH);
        }
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(hpX, hpY, hpBarW, hpBarH);

        // HP text
        ctx.fillStyle = COLORS.HUD_TEXT;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        const hpText = hudShieldMax > 0
            ? `HP ${Math.round(player.hp)}/${Math.round(player.maxHp)} | SH ${Math.round(hudShieldHp)}/${Math.round(hudShieldMax)}`
            : `HP ${Math.round(player.hp)}/${Math.round(player.maxHp)}`;
        ctx.fillText(hpText, cam.width / 2, hpY + 12);

        // Carry summary
        ctx.fillStyle = COLORS.LOOT_COMMON;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        this.drawCoinValueText(`SPACE ${player.getCarriedSpaceUsed()}/${player.carryCapacity} · EST. VALUE `, player.loot, cam.width / 2, hpY - 20, {
            align: 'center',
            iconSize: 12,
            iconOffsetY: -9,
        });
        const weaponHud = player.getWeaponHudInfo();
        ctx.fillStyle = weaponHud.color || '#d0d7de';
        ctx.font = 'bold 16px monospace';
        ctx.shadowColor = weaponHud.color || '#d0d7de';
        ctx.shadowBlur = 8;
        ctx.fillText(weaponHud.text, cam.width / 2, hpY - 32);
        ctx.shadowBlur = 0;

        const dashReady = player.dashCooldown <= 0;
        const modeText = player.hasGravityBoots ? 'GRAVITY BOOTS' : (player.isSlowMode ? 'SLOW' : 'NORMAL');
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        if (player.hasGravityBoots) {
            ctx.fillText(`MODE ${modeText} · DASH ${dashReady ? 'READY' : `${player.dashCooldown.toFixed(1)}s`}`, cam.width / 2, hpY + 32);
        } else {
            ctx.fillText(`ENERGY ${Math.round(player.energy)}/${player.energyMax} · MODE ${modeText} · R TO TOGGLE · DASH ${dashReady ? 'READY' : `${player.dashCooldown.toFixed(1)}s`}`, cam.width / 2, hpY + 32);
        }

        const healingHud = player.getHealingHudInfo?.();
        if (healingHud) {
            ctx.fillStyle = healingHud.color || '#4caf50';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(healingHud.text, cam.width / 2, hpY + 46);
        }

        // Consumables
        const consumableCount = player.getConsumableCount();
        if (consumableCount > 0) {
            ctx.fillStyle = '#4caf50';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`💊 CONSUMABLES x${consumableCount} · Q TO ${player.isHealing ? 'CANCEL' : 'HEAL'}`, cam.width / 2, hpY + (healingHud ? 60 : 46));
        }

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

        this._drawKillFeed(killFeed, cam.width);
        this._drawKillBanner(killBanner, cam.width);

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

    _drawKillFeed(killFeed = [], width = 0) {
        const { ctx } = this;
        if (!killFeed.length) return;

        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        killFeed.forEach((entry, index) => {
            const alpha = Math.max(0, entry.life / entry.maxLife);
            const boxX = width - 284;
            const y = 104 + index * 42;
            const boxWidth = 262;

            ctx.globalAlpha = alpha;
            ctx.fillStyle = 'rgba(6,12,18,0.72)';
            ctx.fillRect(boxX, y - 15, boxWidth, 32);
            ctx.strokeStyle = entry.color || '#ffcc80';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(boxX, y - 15, boxWidth, 32);

            ctx.fillStyle = entry.color || '#ffcc80';
            ctx.fillRect(boxX, y - 15, 5, 32);

            ctx.fillStyle = '#8fb3c7';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(entry.detail || 'ELIMINATION', boxX + 14, y - 7);

            ctx.fillStyle = '#f2f7fb';
            ctx.shadowColor = 'rgba(0,0,0,0.4)';
            ctx.shadowBlur = 4;
            ctx.font = 'bold 13px monospace';
            ctx.fillText(entry.text || 'TARGET', boxX + 14, y + 7);

            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(143,227,255,0.55)';
            ctx.beginPath();
            ctx.moveTo(boxX + boxWidth - 20, y - 9);
            ctx.lineTo(boxX + boxWidth - 8, y - 9);
            ctx.moveTo(boxX + boxWidth - 20, y + 9);
            ctx.lineTo(boxX + boxWidth - 8, y + 9);
            ctx.stroke();
        });

        ctx.restore();
        ctx.globalAlpha = 1;
    }

    _drawKillBanner(killBanner, width = 0) {
        const { ctx } = this;
        if (!killBanner) return;

        const alpha = Math.max(0, killBanner.life / killBanner.maxLife);
        const scale = 1 + (1 - alpha) * 0.08;
        const panelWidth = 332;
        const panelX = width / 2 - panelWidth / 2;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(6,12,18,0.78)';
        ctx.fillRect(panelX, 82, panelWidth, 70);

        ctx.strokeStyle = 'rgba(143,227,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(panelX, 82, panelWidth, 70);

        ctx.fillStyle = killBanner.color || '#8fe3ff';
        ctx.fillRect(panelX, 82, 6, 70);
        ctx.fillRect(panelX + panelWidth - 6, 82, 6, 70);

        ctx.fillStyle = 'rgba(143,227,255,0.72)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(killBanner.tag || 'OPERATOR ELIMINATION', width / 2, 95);

        ctx.fillStyle = killBanner.color || '#ffb74d';
        ctx.shadowColor = killBanner.color || '#ffb74d';
        ctx.shadowBlur = 12;
        ctx.font = `bold ${Math.round(24 * scale)}px monospace`;
        ctx.fillText(killBanner.title || 'TARGET DOWN', width / 2, 116);

        ctx.fillStyle = '#dce8ef';
        ctx.shadowBlur = 4;
        ctx.font = 'bold 12px monospace';
        ctx.fillText(killBanner.subtitle || '', width / 2, 136);

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(143,227,255,0.58)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`CHAIN ${killBanner.chain || 1} · STREAK ${killBanner.streak || 1}`, width / 2, 149);
        ctx.restore();
        ctx.globalAlpha = 1;
    }

    // ---------- Minimap ----------
    drawMinimap(tiles, player, enemies, aiPlayers, crates, extractionPoints, difficulty = 'advanced') {
        const { ctx, cam } = this;
        // Scale minimap by difficulty: hell 1.5x, chaos 2.0x (0.8× of full 2.5)
        const scaleMultiplier = difficulty === 'chaos' ? 2.0 : difficulty === 'hell' ? 1.5 : 1;
        const mmW = Math.round(160 * scaleMultiplier);
        const mmH = Math.round(120 * scaleMultiplier);
        const mmX = 15;
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

        // Extraction zones (✈ symbol)
        ctx.fillStyle = COLORS.MINIMAP_EXTRACTION;
        ctx.font = `${Math.round(10 * scaleMultiplier)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const ez of extractionPoints) {
            ctx.fillText('✈', mmX + ez.x * scaleX, mmY + ez.y * scaleY);
        }

        // Safe crates only — with legend glow effect
        for (const crate of crates) {
            if (crate.tier !== 'safe' || crate.items.length === 0) continue;
            const cx = mmX + crate.x * scaleX;
            const cy = mmY + crate.y * scaleY;
            // Legend glow
            ctx.shadowColor = '#ff9f1a';
            ctx.shadowBlur = 4;
            ctx.fillStyle = '#ff9f1a';
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // Zone entrance markers (⬡ symbol)
        ctx.fillStyle = '#aaa';
        ctx.font = `${Math.round(8 * scaleMultiplier)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const ent of (this._entrances || [])) {
            ctx.fillText('⬡', mmX + ent.x * scaleX, mmY + ent.y * scaleY);
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
