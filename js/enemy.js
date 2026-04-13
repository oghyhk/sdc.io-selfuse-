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

export class Enemy {
    constructor(x, y, type) {
        this.id = generateId();
        this.x = x;
        this.y = y;
        this.type = type; // 'drone' or 'sentinel'
        this.spawnX = x;
        this.spawnY = y;
        this.angle = randFloat(0, Math.PI * 2);

        if (type === 'drone') {
            this.radius = DRONE_RADIUS;
            this.speed = DRONE_SPEED;
            this.hp = DRONE_HP;
            this.maxHp = DRONE_HP;
            this.damage = DRONE_DAMAGE;
            this.attackCooldown = DRONE_ATTACK_COOLDOWN;
            this.sightRange = DRONE_SIGHT_RANGE;
            this.chaseRange = DRONE_CHASE_RANGE;
            this.patrolRange = DRONE_PATROL_RANGE;
            this.canShoot = false;
        } else {
            this.radius = SENTINEL_RADIUS;
            this.speed = SENTINEL_SPEED;
            this.hp = SENTINEL_HP;
            this.maxHp = SENTINEL_HP;
            this.damage = SENTINEL_DAMAGE;
            this.attackCooldown = SENTINEL_ATTACK_COOLDOWN;
            this.sightRange = SENTINEL_SIGHT_RANGE;
            this.chaseRange = SENTINEL_CHASE_RANGE;
            this.patrolRange = 100;
            this.canShoot = true;
            this.shootRange = SENTINEL_SHOOT_RANGE;
            this.bulletSpeed = SENTINEL_BULLET_SPEED;
        }

        this.alive = true;
        this.state = STATE.PATROL;
        this.attackTimer = 0;
        this.damageFlash = 0;

        // Patrol waypoint
        this.patrolTargetX = x;
        this.patrolTargetY = y;
        this.patrolWaitTimer = 0;

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

        const dToPlayer = dist(this.x, this.y, player.x, player.y);
        const canSee = player.alive && dToPlayer < this.sightRange &&
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
            this.patrolWaitTimer = randFloat(0.5, 2.0);
            return;
        }

        this._moveTo(dt, this.patrolTargetX, this.patrolTargetY, wallGrid, 0.5);
    }

    _chase(dt, player, wallGrid) {
        this._moveTo(dt, player.x, player.y, wallGrid, 1.0);
        this.angle = angleBetween(this.x, this.y, player.x, player.y);
    }

    _attack(dt, player, wallGrid, bullets) {
        this.angle = angleBetween(this.x, this.y, player.x, player.y);

        if (this.canShoot) {
            // Ranged attack (sentinel)
            if (this.attackTimer <= 0) {
                const angle = angleBetween(this.x, this.y, player.x, player.y);
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
                    radius: 5,
                    life: 1.5,
                    maxLife: 1.5
                });
                this.attackTimer = this.attackCooldown;
            }
        } else {
            // Melee attack (drone) — move into player and deal contact damage
            if (circleCollision(this.x, this.y, this.radius, player.x, player.y, player.radius)) {
                if (this.attackTimer <= 0) {
                    player.takeDamage(this.damage);
                    this.attackTimer = this.attackCooldown;
                }
            } else {
                this._moveTo(dt, player.x, player.y, wallGrid, 1.0);
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
