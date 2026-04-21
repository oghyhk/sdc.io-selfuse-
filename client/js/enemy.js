// ============================================================
// enemy.js — AI enemies: Drone & Sentinel
// ============================================================

import {
    DRONE_RADIUS, DRONE_SPEED, DRONE_HP, DRONE_DAMAGE, DRONE_ATTACK_COOLDOWN,
    DRONE_SIGHT_RANGE, DRONE_CHASE_RANGE, DRONE_PATROL_RANGE,
    SENTINEL_RADIUS, SENTINEL_SPEED, SENTINEL_HP, SENTINEL_DAMAGE,
    SENTINEL_ATTACK_COOLDOWN, SENTINEL_SIGHT_RANGE, SENTINEL_CHASE_RANGE,
    SENTINEL_SHOOT_RANGE, SENTINEL_BULLET_SPEED,
    MAP_WIDTH, MAP_HEIGHT, TILE_SIZE
} from './constants.js';
import {
    dist, distSq, normalize, clamp, angleBetween, randFloat, randInt,
    hasLineOfSight, generateId, circleCollision
} from './utils.js';

// AI states
const STATE = {
    PATROL: 'patrol',
    CHASE: 'chase',
    ATTACK: 'attack',
    RETURN: 'return',
};

const DIFFICULTY_MODIFIERS = {
    easy: {
        hp: 0.85,
        damage: 0.85,
        speed: 0.92,
        attackCooldown: 1.08,
        sightRange: 0.95,
        chaseRange: 0.95,
        shootRange: 0.96,
        bulletSpeed: 0.95,
    },
    advanced: {
        hp: 1,
        damage: 1,
        speed: 1,
        attackCooldown: 1,
        sightRange: 1,
        chaseRange: 1,
        shootRange: 1,
        bulletSpeed: 1,
    },
    hell: {
        hp: 1.35,
        damage: 1.3,
        speed: 1.18,
        attackCooldown: 0.82,
        sightRange: 1.18,
        chaseRange: 1.15,
        shootRange: 1.1,
        bulletSpeed: 1.15,
    },
    chaos: {
        hp: 2.4,
        damage: 2.0,
        speed: 1.5,
        attackCooldown: 0.5,
        sightRange: 1.6,
        chaseRange: 1.6,
        shootRange: 1.35,
        bulletSpeed: 1.5,
    },
};

export class Enemy {
    constructor(x, y, type, difficulty = 'advanced') {
        this.id = generateId();
        this.x = x;
        this.y = y;
        this.type = type; // 'drone' or 'sentinel'
        this.difficulty = difficulty;
        this.spawnX = x;
        this.spawnY = y;
        this.angle = randFloat(0, Math.PI * 2);
        const modifiers = DIFFICULTY_MODIFIERS[difficulty] || DIFFICULTY_MODIFIERS.advanced;

        if (type === 'drone') {
            this.radius = DRONE_RADIUS;
            this.speed = DRONE_SPEED * modifiers.speed;
            this.hp = Math.round(DRONE_HP * modifiers.hp);
            this.maxHp = this.hp;
            this.damage = Math.round(DRONE_DAMAGE * modifiers.damage);
            this.attackCooldown = DRONE_ATTACK_COOLDOWN * modifiers.attackCooldown;
            this.sightRange = DRONE_SIGHT_RANGE * modifiers.sightRange;
            this.chaseRange = DRONE_CHASE_RANGE * modifiers.chaseRange;
            this.patrolRange = DRONE_PATROL_RANGE;
            this.canShoot = false;
        } else {
            this.radius = SENTINEL_RADIUS;
            this.speed = SENTINEL_SPEED * modifiers.speed;
            this.hp = Math.round(SENTINEL_HP * modifiers.hp);
            this.maxHp = this.hp;
            this.damage = Math.round(SENTINEL_DAMAGE * modifiers.damage);
            this.attackCooldown = SENTINEL_ATTACK_COOLDOWN * modifiers.attackCooldown;
            this.sightRange = SENTINEL_SIGHT_RANGE * modifiers.sightRange;
            this.chaseRange = SENTINEL_CHASE_RANGE * modifiers.chaseRange;
            this.patrolRange = 100;
            this.canShoot = true;
            this.shootRange = SENTINEL_SHOOT_RANGE * modifiers.shootRange;
            this.bulletSpeed = SENTINEL_BULLET_SPEED * modifiers.bulletSpeed;
        }

        this.alive = true;
        this.state = STATE.PATROL;
        this.attackTimer = 0;
        this.damageFlash = 0;
        this.isChaos = difficulty === 'chaos';

        // Patrol waypoint
        this.patrolTargetX = x;
        this.patrolTargetY = y;
        this.patrolWaitTimer = 0;
        this.chaosBurstShots = this.isChaos && this.canShoot ? 2 : 1;
        this.chaosBurstDelay = 0.08;
        this.chaosBurstTimer = 0;
        this.chaosBurstRemaining = 0;

        // Death animation
        this.deathTimer = 0;
    }

    update(dt, player, wallGrid, walls, bullets) {
        if (!this.alive) {
            this.deathTimer += dt;
            return;
        }

        this.attackTimer = Math.max(0, this.attackTimer - dt);
        this.damageFlash = Math.max(0, this.damageFlash - dt);
        this.chaosBurstTimer = Math.max(0, this.chaosBurstTimer - dt);

        const dx0 = this.x - player.x;
        const dy0 = this.y - player.y;
        const dSqToPlayer = dx0 * dx0 + dy0 * dy0;
        const dToPlayer = Math.sqrt(dSqToPlayer);
        const canSee = player.alive && dSqToPlayer < this.sightRange * this.sightRange &&
            hasLineOfSight(this.x, this.y, player.x, player.y, wallGrid.getNearby(this.x, this.y, this.sightRange));

        // State transitions
        switch (this.state) {
            case STATE.PATROL:
                if (canSee) {
                    this.state = STATE.CHASE;
                }
                break;
            case STATE.CHASE:
                if (!player.alive) {
                    this.state = STATE.RETURN;
                } else if (dToPlayer > this.chaseRange && !canSee) {
                    this.state = STATE.RETURN;
                } else if (this.canShoot && dToPlayer < this.shootRange && canSee) {
                    this.state = STATE.ATTACK;
                } else if (!this.canShoot && dToPlayer < this.radius + player.radius + 5) {
                    this.state = STATE.ATTACK;
                }
                break;
            case STATE.ATTACK:
                if (!player.alive) {
                    this.state = STATE.RETURN;
                } else if (this.canShoot && (dToPlayer > this.shootRange * 1.2 || !canSee)) {
                    this.state = STATE.CHASE;
                } else if (!this.canShoot && dToPlayer > this.radius + player.radius + 30) {
                    this.state = STATE.CHASE;
                }
                break;
            case STATE.RETURN:
                if (canSee && player.alive) {
                    this.state = STATE.CHASE;
                } else if (dist(this.x, this.y, this.spawnX, this.spawnY) < 20) {
                    this.state = STATE.PATROL;
                }
                break;
        }

        // Execute state behavior
        switch (this.state) {
            case STATE.PATROL:
                this._patrol(dt, wallGrid);
                break;
            case STATE.CHASE:
                this._chase(dt, player, wallGrid);
                break;
            case STATE.ATTACK:
                this._attack(dt, player, wallGrid, bullets);
                break;
            case STATE.RETURN:
                this._moveTo(dt, this.spawnX, this.spawnY, wallGrid);
                break;
        }

        // Map bounds
        this.x = clamp(this.x, this.radius, MAP_WIDTH - this.radius);
        this.y = clamp(this.y, this.radius, MAP_HEIGHT - this.radius);
    }

    _patrol(dt, wallGrid) {
        this.patrolWaitTimer -= dt;
        if (this.patrolWaitTimer > 0) return;

        const d = dist(this.x, this.y, this.patrolTargetX, this.patrolTargetY);
        if (d < 10) {
            // Pick new patrol waypoint
            this.patrolTargetX = this.spawnX + randFloat(-this.patrolRange, this.patrolRange);
            this.patrolTargetY = this.spawnY + randFloat(-this.patrolRange, this.patrolRange);
            this.patrolTargetX = clamp(this.patrolTargetX, this.radius, MAP_WIDTH - this.radius);
            this.patrolTargetY = clamp(this.patrolTargetY, this.radius, MAP_HEIGHT - this.radius);
            this.patrolWaitTimer = this.isChaos ? randFloat(0.2, 0.9) : randFloat(0.5, 2.0);
            return;
        }

        this._moveTo(dt, this.patrolTargetX, this.patrolTargetY, wallGrid, this.isChaos ? 0.72 : 0.5);
    }

    _chase(dt, player, wallGrid) {
        const chaseSpeed = this.isChaos ? (this.canShoot ? 1.08 : 1.18) : 1.0;
        this._moveTo(dt, player.x, player.y, wallGrid, chaseSpeed);
        this.angle = angleBetween(this.x, this.y, player.x, player.y);
    }

    _fireAtPlayer(player, bullets, spread = 0) {
        const leadTime = this.isChaos ? Math.min(0.32, dist(this.x, this.y, player.x, player.y) / Math.max(1, this.bulletSpeed || 1)) : 0;
        const targetX = player.x + (player.vx || 0) * leadTime;
        const targetY = player.y + (player.vy || 0) * leadTime;
        const baseAngle = angleBetween(this.x, this.y, targetX, targetY);
        const angle = baseAngle + randFloat(-spread, spread);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        bullets.push({
            id: generateId(),
            x: this.x + cos * (this.radius + 4),
            y: this.y + sin * (this.radius + 4),
            vx: cos * this.bulletSpeed,
            vy: sin * this.bulletSpeed,
            damage: this.damage,
            owner: 'enemy',
            radius: this.isChaos ? 6 : 5,
            life: this.isChaos ? 1.75 : 1.5,
            maxLife: this.isChaos ? 1.75 : 1.5
        });
    }

    _attack(dt, player, wallGrid, bullets) {
        this.angle = angleBetween(this.x, this.y, player.x, player.y);

        if (this.canShoot) {
            // Ranged attack (sentinel)
            if (this.attackTimer <= 0) {
                this._fireAtPlayer(player, bullets, this.isChaos ? 0.03 : 0);
                if (this.isChaos) {
                    this.chaosBurstRemaining = this.chaosBurstShots - 1;
                    this.chaosBurstTimer = this.chaosBurstDelay;
                }
                this.attackTimer = this.attackCooldown;
            }
            if (this.isChaos && this.chaosBurstRemaining > 0 && this.chaosBurstTimer <= 0) {
                this._fireAtPlayer(player, bullets, 0.04);
                this.chaosBurstRemaining -= 1;
                this.chaosBurstTimer = this.chaosBurstDelay;
            }
            if (this.isChaos) {
                const orbitAngle = angleBetween(player.x, player.y, this.x, this.y) + Math.PI / 2;
                const strafeX = player.x + Math.cos(orbitAngle) * 72;
                const strafeY = player.y + Math.sin(orbitAngle) * 72;
                this._moveTo(dt, strafeX, strafeY, wallGrid, 0.92);
            }
        } else {
            // Contact attack (drone) — move into player and deal damage
            if (circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
                if (this.attackTimer <= 0) {
                    player.takeDamage(this.damage);
                    this.attackTimer = this.attackCooldown;
                }
            } else {
                this._moveTo(dt, player.x, player.y, wallGrid, this.isChaos ? 1.32 : 1.0);
            }
        }
    }

    _moveTo(dt, tx, ty, wallGrid, speedMult = 1.0) {
        const dx = tx - this.x;
        const dy = ty - this.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2) return;

        const nx = dx / d;
        const ny = dy / d;
        this.x += nx * this.speed * speedMult * dt;
        this.y += ny * this.speed * speedMult * dt;
        this.angle = Math.atan2(ny, nx);

        // Wall collision
        const nearby = wallGrid.getNearby(this.x, this.y, this.radius + 10);
        for (const w of nearby) {
            const closestX = clamp(this.x, w.x, w.x + w.w);
            const closestY = clamp(this.y, w.y, w.y + w.h);
            const ddx = this.x - closestX;
            const ddy = this.y - closestY;
            const dSq = ddx * ddx + ddy * ddy;
            if (dSq < this.radius * this.radius && dSq > 0) {
                const dd = Math.sqrt(dSq);
                const overlap = this.radius - dd;
                this.x += (ddx / dd) * overlap;
                this.y += (ddy / dd) * overlap;
            }
        }
    }

    takeDamage(amount) {
        this.hp -= amount;
        this.damageFlash = 0.1;
        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
        }
    }
}
