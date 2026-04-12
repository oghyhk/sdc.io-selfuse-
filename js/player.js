// ============================================================
// player.js — Player entity
// ============================================================

import {
    PLAYER_RADIUS, PLAYER_SPEED, PLAYER_MAX_HP,
    PLAYER_SHOOT_DAMAGE, PLAYER_SHOOT_COOLDOWN, PLAYER_BULLET_SPEED, PLAYER_BULLET_RANGE,
    PLAYER_DASH_SPEED, PLAYER_DASH_DURATION, PLAYER_DASH_COOLDOWN, PLAYER_MELEE_DAMAGE, PLAYER_MELEE_COOLDOWN,
    MAP_WIDTH, MAP_HEIGHT, PLAYER_BASE_CARRY_CAPACITY, PLAYER_MAX_ENERGY,
    PLAYER_ENERGY_DRAIN_PER_SECOND, PLAYER_ENERGY_RECOVERY_PER_SECOND,
    PLAYER_SLOW_SPEED_MULTIPLIER, PLAYER_ENERGY_RETURN_THRESHOLD
} from './constants.js';
import { clamp, normalize, generateId, angleBetween } from './utils.js';
import { getItemDefinition } from './profile.js';

export class Player {
    constructor(x, y, loadout = {}) {
        this.id = generateId();
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = PLAYER_RADIUS;
        this.alive = true;
        this.angle = 0; // facing direction

        this.loadout = {
            gun: getItemDefinition(loadout.gun)?.category === 'gun' ? loadout.gun : 'militia_carbine',
            melee: getItemDefinition(loadout.melee)?.category === 'melee' ? loadout.melee : 'field_knife',
            armor: getItemDefinition(loadout.armor)?.category === 'armor' ? loadout.armor : 'cloth_vest',
            helmet: getItemDefinition(loadout.helmet)?.category === 'helmet' ? loadout.helmet : 'scout_cap',
            shoes: getItemDefinition(loadout.shoes)?.category === 'shoes' ? loadout.shoes : 'trail_shoes',
            backpack: getItemDefinition(loadout.backpack)?.category === 'backpack' ? loadout.backpack : 'sling_pack'
        };

        this.weaponId = this.loadout.gun;
        this.weapon = getItemDefinition(this.weaponId);
        this.melee = getItemDefinition(this.loadout.melee);
        this.armor = getItemDefinition(this.loadout.armor);
        this.helmet = getItemDefinition(this.loadout.helmet);
        this.shoes = getItemDefinition(this.loadout.shoes);
        this.backpack = getItemDefinition(this.loadout.backpack);

        this.moveSpeed = PLAYER_SPEED;
        this.shootDamage = this.weapon?.stats?.damage ?? PLAYER_SHOOT_DAMAGE;
        this.shootCooldownDuration = this.weapon?.stats?.cooldown ?? PLAYER_SHOOT_COOLDOWN;
        this.bulletSpeed = this.weapon?.stats?.bulletSpeed ?? PLAYER_BULLET_SPEED;
        this.bulletRange = this.weapon?.stats?.range ?? PLAYER_BULLET_RANGE;
        this.meleeDamage = this.melee?.stats?.meleeDamage ?? PLAYER_MELEE_DAMAGE;
        this.meleeCooldown = this.melee?.stats?.meleeCooldown ?? PLAYER_MELEE_COOLDOWN;
        this.carryCapacity = PLAYER_BASE_CARRY_CAPACITY;
        this.baseMoveSpeed = PLAYER_SPEED;
        this.energyMax = PLAYER_MAX_ENERGY;
        this.energy = this.energyMax;
        this.prefersSlowMode = false;
        this.isSlowMode = false;

        let bonusHp = 0;
        for (const item of [this.armor, this.helmet, this.shoes, this.backpack]) {
            if (!item) continue;
            bonusHp += item.modifiers?.maxHp || 0;
            this.baseMoveSpeed += item.modifiers?.speed || 0;
            this.carryCapacity += item.modifiers?.carrySlots || 0;
            if (item.modifiers?.shootCooldownMultiplier) {
                this.shootCooldownDuration *= item.modifiers.shootCooldownMultiplier;
            }
        }

        this.maxHp = PLAYER_MAX_HP + bonusHp;
        this.hp = this.maxHp;
        this.moveSpeed = this.baseMoveSpeed;

        // Shooting
        this.shootCooldown = 0;

        // Dash
        this.dashing = false;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.dashDirX = 0;
        this.dashDirY = 0;

        // Loot
        this.loot = 0;
        this.inventoryItems = [];

        // Extraction
        this.extracting = false;
        this.extractTimer = 0;

        // Damage flash
        this.damageFlash = 0;

        // Invincibility frames after taking damage
        this.invincible = 0;
    }

    update(dt, input, wallGrid, bullets) {
        if (!this.alive) return;

        // Timers
        this.shootCooldown = Math.max(0, this.shootCooldown - dt);
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        this.damageFlash = Math.max(0, this.damageFlash - dt);
        this.invincible = Math.max(0, this.invincible - dt);

        // Aim angle
        this.angle = angleBetween(this.x, this.y, input.aimWorld.x, input.aimWorld.y);

        if (input.modeToggleRequested) {
            if (this.isSlowMode) {
                if (this.energy / this.energyMax > PLAYER_ENERGY_RETURN_THRESHOLD) {
                    this.prefersSlowMode = false;
                }
            } else {
                this.prefersSlowMode = true;
            }
        }

        if (this.energy <= 0) {
            this.energy = 0;
            this.prefersSlowMode = true;
        }

        this.isSlowMode = this.prefersSlowMode;
        if (!this.isSlowMode && this.energy / this.energyMax <= PLAYER_ENERGY_RETURN_THRESHOLD && this.energy < this.energyMax) {
            this.isSlowMode = true;
            this.prefersSlowMode = true;
        }

        const isMoving = input.moveDir.x !== 0 || input.moveDir.y !== 0;
        if (!this.dashing) {
            if (!this.isSlowMode && isMoving) {
                this.energy = Math.max(0, this.energy - PLAYER_ENERGY_DRAIN_PER_SECOND * dt);
                if (this.energy <= 0) {
                    this.energy = 0;
                    this.isSlowMode = true;
                    this.prefersSlowMode = true;
                }
            } else if (this.isSlowMode) {
                this.energy = Math.min(this.energyMax, this.energy + PLAYER_ENERGY_RECOVERY_PER_SECOND * dt);
            }
        }

        this.moveSpeed = this.baseMoveSpeed * (this.isSlowMode ? PLAYER_SLOW_SPEED_MULTIPLIER : 1);

        // Dash initiation
        if (input.dashRequested && !this.dashing && this.dashCooldown <= 0) {
            const dir = input.moveDir;
            if (dir.x !== 0 || dir.y !== 0) {
                this.dashing = true;
                this.dashTimer = PLAYER_DASH_DURATION;
                this.dashCooldown = PLAYER_DASH_COOLDOWN;
                const n = normalize(dir.x, dir.y);
                this.dashDirX = n.x;
                this.dashDirY = n.y;
                this.invincible = PLAYER_DASH_DURATION; // i-frames during dash
            }
        }

        // Movement
        let speed = PLAYER_SPEED;
        let moveX, moveY;

        if (this.dashing) {
            this.dashTimer -= dt;
            if (this.dashTimer <= 0) {
                this.dashing = false;
            }
            moveX = this.dashDirX * PLAYER_DASH_SPEED;
            moveY = this.dashDirY * PLAYER_DASH_SPEED;
        } else {
            moveX = input.moveDir.x * this.moveSpeed;
            moveY = input.moveDir.y * this.moveSpeed;
        }

        this.x += moveX * dt;
        this.y += moveY * dt;

        // Wall collision
        this._resolveWalls(wallGrid);

        // Map bounds
        this.x = clamp(this.x, this.radius, MAP_WIDTH - this.radius);
        this.y = clamp(this.y, this.radius, MAP_HEIGHT - this.radius);

        // Shooting
        if (input.shooting && this.shootCooldown <= 0 && !this.dashing) {
            this._shoot(input.aimWorld, bullets);
            this.shootCooldown = this.shootCooldownDuration;
        }
    }

    _shoot(aimWorld, bullets) {
        const angle = angleBetween(this.x, this.y, aimWorld.x, aimWorld.y);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        bullets.push({
            id: generateId(),
            x: this.x + cos * (this.radius + 4),
            y: this.y + sin * (this.radius + 4),
            vx: cos * this.bulletSpeed,
            vy: sin * this.bulletSpeed,
            damage: this.shootDamage,
            owner: 'player',
            radius: 4,
            life: this.bulletRange / this.bulletSpeed,
            maxLife: this.bulletRange / this.bulletSpeed
        });
    }

    _resolveWalls(wallGrid) {
        const nearby = wallGrid.getNearby(this.x, this.y, this.radius + 10);
        for (const w of nearby) {
            const closestX = clamp(this.x, w.x, w.x + w.w);
            const closestY = clamp(this.y, w.y, w.y + w.h);
            const dx = this.x - closestX;
            const dy = this.y - closestY;
            const dSq = dx * dx + dy * dy;
            if (dSq < this.radius * this.radius && dSq > 0) {
                const d = Math.sqrt(dSq);
                const overlap = this.radius - d;
                this.x += (dx / d) * overlap;
                this.y += (dy / d) * overlap;
            } else if (dSq === 0) {
                // Inside wall — push out
                this.x += 1;
                this.y += 1;
            }
        }
    }

    takeDamage(amount) {
        if (this.invincible > 0) return;
        this.hp -= amount;
        this.damageFlash = 0.15;
        this.invincible = 0.2;
        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
        }
    }

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    addItem(item) {
        if (this.inventoryItems.length >= this.carryCapacity) {
            return false;
        }
        this.inventoryItems.push(item);
        this.loot += item.sellValue || 0;
        return true;
    }

    getCarriedItemCount() {
        return this.inventoryItems.length;
    }

    canReturnToNormalMode() {
        return this.energy / this.energyMax > PLAYER_ENERGY_RETURN_THRESHOLD;
    }
}
