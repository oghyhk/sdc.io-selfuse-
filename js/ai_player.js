// ============================================================
// ai_player.js — AI-controlled operator logic for pre-PvP raids
// ============================================================

import { ZONE, CRATE_INTERACT_RANGE, EXTRACTION_RADIUS, MAP_HEIGHT, MAP_WIDTH, TILE_SIZE } from './constants.js';
import { Player } from './player.js';
import { GUN_LOADOUT_SLOTS, ITEM_DEFS, LOADOUT_SLOTS, getItemDefinition } from './profile.js';
import { angleBetween, dist, hasLineOfSight, randChoice, randFloat, randInt } from './utils.js';
import { findPath } from './pathfinding.js';

const BOT_NAMES = [
    'Ghost-11', 'Raven-2', 'Mako-7', 'Atlas-4', 'Viper-9', 'Nova-3', 'Cipher-8', 'Echo-6',
    'Falcon-5', 'Warden-1', 'Blitz-12', 'Mantis-14', 'Reaper-10', 'Aegis-16', 'Phantom-13',
    'Orion-15', 'Drift-17', 'Specter-18', 'Valkyrie-19', 'Ion-20',
];

const RARITY_ASCENDING = ['gray', 'white', 'green', 'blue', 'purple', 'gold', 'red', 'legend'];

const AI_TYPE_SPAWN_WEIGHTS = {
    easy: [
        { value: 'searcher', weight: 40 },
        { value: 'runner', weight: 35 },
        { value: 'fighter', weight: 25 },
    ],
    advanced: [
        { value: 'searcher', weight: 34 },
        { value: 'runner', weight: 33 },
        { value: 'fighter', weight: 33 },
    ],
    hell: [
        { value: 'searcher', weight: 28 },
        { value: 'runner', weight: 26 },
        { value: 'fighter', weight: 46 },
    ],
    chaos: [
        { value: 'searcher', weight: 12 },
        { value: 'runner', weight: 14 },
        { value: 'fighter', weight: 74 },
    ],
};

const AI_LEVEL_SPAWN_WEIGHTS = {
    easy: [
        { value: 'lv1', weight: 82 },
        { value: 'lv2', weight: 18 },
    ],
    advanced: [
        { value: 'lv1', weight: 58 },
        { value: 'lv2', weight: 42 },
    ],
    hell: [
        { value: 'lv1', weight: 26 },
        { value: 'lv2', weight: 58 },
        { value: 'lv3', weight: 14 },
        { value: 'lv4', weight: 2 },
    ],
    chaos: [
        { value: 'lv2', weight: 30 },
        { value: 'lv3', weight: 50 },
        { value: 'lv4', weight: 20 },
    ],
};

const AI_LEVEL_CONFIG = {
    lv1: {
        maxRarity: 'purple',
        rarityWeights: { gray: 16, white: 34, green: 28, blue: 16, purple: 6 },
        aimError: [24, 52],
        predictionFactor: 0,
        aimDistanceScale: 1.15,
        decisionDelay: [0.28, 0.58],
        lootDelay: [0.18, 0.36],
        switchDelay: [1.5, 3.2],
        strafeDelay: [0.65, 1.6],
        aggroRange: [360, 620],
        wanderRadius: [170, 420],
        preferredRange: [0.56, 0.82],
        movementNoise: 0.24,
        hesitationChance: 0.16,
        dashChance: 0,
        combatConfidence: 0.7,
        disengageBias: 1.25,
        ammoReserve: [45, 120],
        consumableAmount: [8, 28],
        secondaryChance: { easy: 0.08, advanced: 0.18, hell: 0.22, chaos: 0.24 },
    },
    lv2: {
        maxRarity: 'gold',
        rarityWeights: { gray: 8, white: 16, green: 25, blue: 24, purple: 18, gold: 9 },
        aimError: [10, 22],
        predictionFactor: 0,
        aimDistanceScale: 0.85,
        decisionDelay: [0.18, 0.42],
        lootDelay: [0.22, 0.5],
        switchDelay: [1.2, 2.6],
        strafeDelay: [0.45, 1.15],
        aggroRange: [440, 760],
        wanderRadius: [210, 520],
        preferredRange: [0.5, 0.74],
        movementNoise: 0.12,
        hesitationChance: 0.05,
        dashChance: 0,
        combatConfidence: 1,
        disengageBias: 1,
        ammoReserve: [90, 240],
        consumableAmount: [14, 44],
        secondaryChance: { easy: 0.18, advanced: 0.34, hell: 0.4, chaos: 0.46 },
    },
    lv3: {
        maxRarity: 'red',
        rarityWeights: { white: 7, green: 14, blue: 23, purple: 24, gold: 22, red: 10 },
        aimError: [5, 10],
        predictionFactor: 1,
        aimDistanceScale: 0.55,
        decisionDelay: [0.12, 0.28],
        lootDelay: [0.2, 0.42],
        switchDelay: [0.95, 1.9],
        strafeDelay: [0.35, 0.9],
        aggroRange: [520, 880],
        wanderRadius: [240, 600],
        preferredRange: [0.46, 0.7],
        movementNoise: 0.18,
        hesitationChance: 0.02,
        dashChance: 0.18,
        combatConfidence: 1.18,
        disengageBias: 0.92,
        ammoReserve: [120, 320],
        consumableAmount: [18, 64],
        secondaryChance: { easy: 0, advanced: 0, hell: 0.5, chaos: 0.62 },
        awkwardOffsetMagnitude: 0.34,
    },
    // lv4 shares all behaviour/combat logic with lv3;
    // loadout is forced gold/red only (handled in buildBotLoadout)
    lv4: {
        maxRarity: 'red',
        rarityWeights: { gold: 90, red: 10 },
        aimError: [5, 10],
        predictionFactor: 1,
        aimDistanceScale: 0.55,
        decisionDelay: [0.12, 0.28],
        lootDelay: [0.2, 0.42],
        switchDelay: [0.95, 1.9],
        strafeDelay: [0.35, 0.9],
        aggroRange: [520, 880],
        wanderRadius: [240, 600],
        preferredRange: [0.46, 0.7],
        movementNoise: 0.18,
        hesitationChance: 0.02,
        dashChance: 0.18,
        combatConfidence: 1.18,
        disengageBias: 0.92,
        ammoReserve: [1998, 1998],
        consumableAmount: [1998, 1998],
        secondaryChance: { easy: 0, advanced: 0, hell: 0.62, chaos: 0.72 },
        awkwardOffsetMagnitude: 0.34,
    },
};

const AI_TYPE_CONFIG = {
    searcher: {
        crateSeekChance: 0.88,
        richCrateBias: 1.35,
        operatorPriority: 0.72,
        enemyPriority: 0.88,
        aggression: 0.78,
        chaseBias: 0.8,
        retreatBias: 1.05,
        safeZoneWeight: 16,
        combatZoneWeight: 34,
        highValueZoneWeight: 58,
    },
    runner: {
        crateSeekChance: 0.52,
        richCrateBias: 0.95,
        operatorPriority: 0.58,
        enemyPriority: 0.82,
        aggression: 0.55,
        chaseBias: 0.48,
        retreatBias: 1.45,
        safeZoneWeight: 54,
        combatZoneWeight: 18,
        highValueZoneWeight: 24,
    },
    fighter: {
        crateSeekChance: 0.3,
        richCrateBias: 0.72,
        operatorPriority: 1.34,
        enemyPriority: 1.02,
        aggression: 1.28,
        chaseBias: 1.32,
        retreatBias: 0.78,
        safeZoneWeight: 14,
        combatZoneWeight: 62,
        highValueZoneWeight: 24,
    },
};

function pickWeighted(entries) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    if (!total) return entries[entries.length - 1]?.value ?? entries[entries.length - 1]?.id ?? null;
    let roll = Math.random() * total;
    for (const entry of entries) {
        roll -= entry.weight;
        if (roll <= 0) return entry.value ?? entry.id;
    }
    return entries[entries.length - 1]?.value ?? entries[entries.length - 1]?.id ?? null;
}

function getRarityIndex(rarity) {
    const index = RARITY_ASCENDING.indexOf(rarity);
    return index === -1 ? RARITY_ASCENDING.length : index;
}

function isRarityAllowed(rarity, maxRarity = 'legend') {
    return getRarityIndex(rarity) <= getRarityIndex(maxRarity);
}

function getDefinitionsForCategory(category, maxRarity = 'legend') {
    return Object.values(ITEM_DEFS)
        .filter((definition) => definition.category === category)
        .filter((definition) => isRarityAllowed(definition.rarity, maxRarity));
}

function getDefinitionsByFilter(filterFn) {
    return Object.values(ITEM_DEFS).filter((definition) => filterFn(definition));
}

function buildWeightedDefinitionEntries(definitions, rarityWeights, extraWeightFn = null) {
    return definitions
        .map((definition) => {
            const rarityWeight = rarityWeights[definition.rarity] || 0;
            const extraWeight = typeof extraWeightFn === 'function' ? extraWeightFn(definition) : 1;
            return { value: definition.id, weight: Math.max(0, rarityWeight * extraWeight) };
        })
        .filter((entry) => entry.weight > 0);
}

function pickDefinitionId(definitions, rarityWeights, fallbackId = null, extraWeightFn = null) {
    const weighted = buildWeightedDefinitionEntries(definitions, rarityWeights, extraWeightFn);
    if (weighted.length) return pickWeighted(weighted);
    return fallbackId || definitions.sort((a, b) => getRarityIndex(a.rarity) - getRarityIndex(b.rarity) || a.sellValue - b.sellValue)[0]?.id || null;
}

function pickDefinitionForCategory(category, levelConfig) {
    const definitions = getDefinitionsForCategory(category, levelConfig.maxRarity);
    return pickDefinitionId(definitions, levelConfig.rarityWeights);
}

function pickGunDefinition(levelConfig) {
    const definitions = getDefinitionsForCategory('gun', levelConfig.maxRarity);
    return pickDefinitionId(definitions, levelConfig.rarityWeights, 'g17', (definition) => {
        const clipSize = Math.max(1, definition?.stats?.clipSize || 1);
        return 1 + Math.min(0.45, clipSize / 60);
    }) || 'g17';
}

function pickAmmoDefinition(levelConfig, primaryGunId) {
    const definitions = getDefinitionsByFilter((definition) => definition.lootType === 'ammo' && definition.id !== 'ammo_white' && isRarityAllowed(definition.rarity, levelConfig.maxRarity));
    const fallback = definitions.sort((a, b) => getRarityIndex(a.rarity) - getRarityIndex(b.rarity))[0]?.id || 'ammo_green';
    return pickDefinitionId(definitions, levelConfig.rarityWeights, fallback, (definition) => {
        if (primaryGunId === 'awm') {
            return definition.id === 'ammo_338_ap' ? 0 : (1.1 + Math.max(0, (definition.damageMultiplier || 1) - 1));
        }
        return 1;
    });
}

function pickConsumableDefinition(levelConfig) {
    const definitions = getDefinitionsForCategory('consumable', levelConfig.maxRarity);
    return pickDefinitionId(definitions, levelConfig.rarityWeights, 'field_bandage');
}

function pickGoodsDefinition(levelConfig) {
    const definitions = getDefinitionsByFilter((definition) => definition.lootType === 'goods' && isRarityAllowed(definition.rarity, levelConfig.maxRarity));
    return pickDefinitionId(definitions, levelConfig.rarityWeights, null, () => 0.75);
}

function getSecondaryGunChance(levelConfig, difficulty) {
    return levelConfig.secondaryChance?.[difficulty] || 0;
}

export function createAIOperatorProfile(difficulty = 'advanced') {
    const type = pickWeighted(AI_TYPE_SPAWN_WEIGHTS[difficulty] || AI_TYPE_SPAWN_WEIGHTS.advanced) || 'fighter';
    const level = pickWeighted(AI_LEVEL_SPAWN_WEIGHTS[difficulty] || AI_LEVEL_SPAWN_WEIGHTS.advanced) || 'lv1';
    return {
        type,
        level,
        maxRarity: AI_LEVEL_CONFIG[level]?.maxRarity || 'purple',
    };
}

function buildBotLoadout(difficulty = 'advanced', aiProfile = createAIOperatorProfile(difficulty)) {
    const levelConfig = AI_LEVEL_CONFIG[aiProfile.level] || AI_LEVEL_CONFIG.lv2;
    const isLv4 = aiProfile.level === 'lv4';
    const primaryGun = pickGunDefinition(levelConfig);
    const secondaryChance = getSecondaryGunChance(levelConfig, difficulty);
    const secondaryGun = Math.random() < secondaryChance ? pickGunDefinition(levelConfig) : null;
    const loadout = {
        gunPrimary: primaryGun,
        gunSecondary: secondaryGun,
        armor: pickDefinitionForCategory('armor', levelConfig),
        helmet: pickDefinitionForCategory('helmet', levelConfig),
        shoes: pickDefinitionForCategory('shoes', levelConfig),
        backpack: pickDefinitionForCategory('backpack', levelConfig),
    };

    // Lv4: always gold ammo + gold consumable, 1998 each
    const ammoDefinitionId = isLv4
        ? 'ammo_gold'
        : pickAmmoDefinition(levelConfig, primaryGun);
    const spareAmmo = isLv4
        ? 1998
        : (primaryGun === 'awm'
            ? randInt(8, Math.max(12, Math.floor(levelConfig.ammoReserve[1] * 0.18)))
            : randInt(levelConfig.ammoReserve[0], levelConfig.ammoReserve[1]));
    const consumableDefinitionId = isLv4
        ? 'regen_injector'
        : pickConsumableDefinition(levelConfig);
    const consumableAmount = isLv4
        ? 1998
        : randInt(levelConfig.consumableAmount[0], levelConfig.consumableAmount[1]);
    const backpackItems = [
        { definitionId: ammoDefinitionId, quantity: spareAmmo },
        { definitionId: consumableDefinitionId, quantity: consumableAmount },
    ];

    const goodsDefinitionId = pickGoodsDefinition(levelConfig);
    if (goodsDefinitionId && Math.random() < (aiProfile.type === 'searcher' ? 0.72 : 0.48)) {
        backpackItems.push({ definitionId: goodsDefinitionId, quantity: 1 });
    }

    return { loadout, backpackItems };
}

function makeInputSnapshot() {
    return {
        moveDir: { x: 0, y: 0 },
        aimWorld: { x: 0, y: 0 },
        shooting: false,
        dashRequested: false,
        interactRequested: false,
        modeToggleRequested: false,
        useConsumableRequested: false,
        weaponSwitchRequested: false,
    };
}

export class AIPlayer extends Player {
    constructor(x, y, loadout = {}, backpackItems = [], options = {}) {
        super(x, y, loadout, backpackItems, []);
        this.isBot = true;
        this.bulletOwnerType = 'bot';
        this.difficulty = options.difficulty || 'advanced';
        this.aiProfile = options.aiProfile || createAIOperatorProfile(this.difficulty);
        this.rosterId = options.rosterId || null;
        this.aiType = this.aiProfile.type || 'fighter';
        this.aiLevel = this.aiProfile.level || 'lv1';
        this.aiTypeConfig = AI_TYPE_CONFIG[this.aiType] || AI_TYPE_CONFIG.fighter;
        this.aiLevelConfig = AI_LEVEL_CONFIG[this.aiLevel] || AI_LEVEL_CONFIG.lv2;
        this.displayName = options.displayName || randChoice(BOT_NAMES);
        this.gameKills = 0;
        this.setSquad(options.squadId || `bot-solo-${this.id}`, options.squadIndex || 0, options.squadSize || 1);
        this.deathTimer = 0;
        this.aiDecisionTimer = 0;
        this.aiLootTimer = randFloat(this.aiLevelConfig.lootDelay[0], this.aiLevelConfig.lootDelay[1]);
        this.aiStuckTimer = 0;
        this.aiSwitchTimer = randFloat(this.aiLevelConfig.switchDelay[0], this.aiLevelConfig.switchDelay[1]);
        this.aiStrafeTimer = randFloat(this.aiLevelConfig.strafeDelay[0], this.aiLevelConfig.strafeDelay[1]);
        this.aiStrafeDirection = Math.random() < 0.5 ? -1 : 1;
        this.aiReleaseShotTimer = 0;
        this.aiTarget = null;
        this.aiDestination = { x, y };
        this.aiLastSeenTarget = null;
        this.aiPreferredRangeMultiplier = randFloat(this.aiLevelConfig.preferredRange[0], this.aiLevelConfig.preferredRange[1]);
        this.aiAggroRange = randInt(this.aiLevelConfig.aggroRange[0], this.aiLevelConfig.aggroRange[1]);
        this.aiWanderRadius = randInt(this.aiLevelConfig.wanderRadius[0], this.aiLevelConfig.wanderRadius[1]);
        this.aiLastPosition = { x, y };
        this.aiCrateTargetId = null;
        this.aiPathOffset = { x: 0, y: 0 };
        this.aiPathOffsetTimer = 0;
        this.aiAimError = randFloat(this.aiLevelConfig.aimError[0], this.aiLevelConfig.aimError[1]);

        // A* pathfinding state
        this.aiPath = null;          // array of {x,y} waypoints
        this.aiPathIndex = 0;        // current waypoint index
        this.aiPathRecomputeTimer = 0; // cooldown to avoid recomputing every frame

        // Lv3 cover-seeking state
        this.aiSeekingCover = false;     // true when looking for wall cover before healing
        this.aiCoverTarget = null;       // {x,y} position behind a wall

        // Extraction intent
        this.aiWantsToExtract = false;
        this.aiExtractTimer = 0;
        this.aiExtractCheckTimer = randFloat(8, 18); // first check after some time in raid
        this.aiExtracted = false;
    }

    updateAI(dt, context) {
        this._updateFloatingDamageTexts(dt);
        if (!this.alive) {
            this.deathTimer += dt;
            return;
        }

        this.aiDecisionTimer -= dt;
        this.aiLootTimer -= dt;
        this.aiSwitchTimer -= dt;
        this.aiStrafeTimer -= dt;
        this.aiReleaseShotTimer = Math.max(0, this.aiReleaseShotTimer - dt);
        this.aiPathOffsetTimer -= dt;

        if (this.aiStrafeTimer <= 0) {
            this.aiStrafeDirection *= -1;
            this.aiStrafeTimer = randFloat(this.aiLevelConfig.strafeDelay[0], this.aiLevelConfig.strafeDelay[1]);
        }

        if (this.aiPathOffsetTimer <= 0) {
            const magnitude = (this.aiLevel === 'lv3' || this.aiLevel === 'lv4')
                ? (this.aiLevelConfig.awkwardOffsetMagnitude || 0.28)
                : this.aiLevelConfig.movementNoise;
            this.aiPathOffset = {
                x: randFloat(-magnitude, magnitude),
                y: randFloat(-magnitude, magnitude),
            };
            this.aiPathOffsetTimer = randFloat(0.25, (this.aiLevel === 'lv3' || this.aiLevel === 'lv4') ? 0.7 : 0.9);
        }

        const movedDistance = dist(this.x, this.y, this.aiLastPosition.x, this.aiLastPosition.y);
        if (movedDistance < 8) this.aiStuckTimer += dt;
        else this.aiStuckTimer = 0;
        this.aiLastPosition = { x: this.x, y: this.y };
        this.aiPathRecomputeTimer = Math.max(0, this.aiPathRecomputeTimer - dt);

        // Extraction intent check
        const gateOpen = context.extractionGateOpen !== false; // default open
        this.aiExtractCheckTimer -= dt;
        if (!this.aiWantsToExtract && this.aiExtractCheckTimer <= 0) {
            this.aiExtractCheckTimer = randFloat(5, 12);
            // Only develop extraction intent when the gate is actually open
            if (gateOpen) {
                this.aiWantsToExtract = this._shouldSeekExtraction(context);
            }
        }
        // If gate just locked (e.g. was open then closed — shouldn't happen, but safety)
        // or AI wanted to extract but gate is still locked, cancel intent
        if (this.aiWantsToExtract && !gateOpen) {
            this.aiWantsToExtract = false;
        }

        if (this.aiDecisionTimer <= 0) {
            if (this.aiSeekingCover) {
                // While seeking cover, still pick targets to shoot back, but don't change destination
                this.aiTarget = this._pickTarget(context);
            } else if (this.aiWantsToExtract) {
                // Even when heading to extract, still pick fights along the way
                this.aiTarget = this._pickTarget(context);
                if (!this.aiTarget) {
                    const dest = this._pickExtractionDestination(context);
                    this._setDestinationWithPath(dest, context);
                }
            } else {
                this.aiTarget = this._pickTarget(context);
                if (!this.aiTarget) {
                    const dest = this._pickRoamDestination(context);
                    this._setDestinationWithPath(dest, context);
                }
            }
            this.aiDecisionTimer = randFloat(this.aiLevelConfig.decisionDelay[0], this.aiLevelConfig.decisionDelay[1]);
        }

        // Stuck recovery: recompute path when stuck
        if (this.aiStuckTimer > 0.7 && !this.aiTarget) {
            this.aiStuckTimer = 0;
            const dest = this._pickRoamDestination(context);
            this._setDestinationWithPath(dest, context);
        }

        if (!this.aiTarget && this.aiLootTimer <= 0) {
            this._lootNearbyCrate(context);
            this.aiLootTimer = randFloat(this.aiLevelConfig.lootDelay[0], this.aiLevelConfig.lootDelay[1]);
        }

        // Lv3/Lv4 cover-seeking: if low HP and exposed, seek cover before healing
        if ((this.aiLevel === 'lv3' || this.aiLevel === 'lv4') && !this.isHealing && this._hasAllowedConsumable()) {
            const healThreshold = this.aiType === 'runner' ? 0.82 : this.aiType === 'searcher' ? 0.68 : 0.6;
            if (this.hp < this.maxHp * healThreshold) {
                const nearbyThreats = this._getVisibleThreats(context);
                if (nearbyThreats.length > 0) {
                    // Exposed to enemy fire — seek cover, do NOT heal
                    if (!this.aiSeekingCover) {
                        this.aiSeekingCover = true;
                        this.aiTarget = null;
                        const cover = this._findCoverPosition(context, nearbyThreats);
                        if (cover) {
                            this.aiCoverTarget = cover;
                            this._setDestinationWithPath(cover, context);
                        }
                    }
                } else {
                    // Safe from line-of-sight — can heal now
                    this.aiSeekingCover = false;
                    this.aiCoverTarget = null;
                }
            } else {
                this.aiSeekingCover = false;
                this.aiCoverTarget = null;
            }
        }

        if (this._shouldUseConsumable(context)) {
            this._useAllowedConsumable();
        }

        const input = this._buildInput(context);
        super.update(dt, input, context.wallGrid, context.bullets);
    }

    _getSquadmates(context) {
        return (context.aiPlayers || []).filter((bot) => bot.id !== this.id && bot.squadId === this.squadId);
    }

    _getSquadLeader(context) {
        return [this, ...this._getSquadmates(context)].reduce((leader, member) => {
            if (!leader) return member;
            return (member.squadIndex || 0) < (leader.squadIndex || 0) ? member : leader;
        }, null);
    }

    _pickTarget(context) {
        const candidates = [
            context.player,
            ...(context.aiPlayers || []).filter((bot) => bot.id !== this.id),
            ...(context.enemies || []),
        ];

        let bestTarget = null;
        let bestScore = -Infinity;

        for (const candidate of candidates) {
            if (!candidate?.alive) continue;
            if (candidate.isBot && this.isFriendlyWith(candidate)) continue;
            const isOperator = candidate === context.player || candidate.isBot;
            const distanceToTarget = dist(this.x, this.y, candidate.x, candidate.y);
            const operatorRangeMultiplier = this.aiType === 'fighter' ? 1.2 : this.aiType === 'searcher' ? 0.9 : 0.72;
            const maxRange = isOperator
                ? this.aiAggroRange * operatorRangeMultiplier
                : Math.min(this.aiAggroRange * 0.85, 460);
            if (distanceToTarget > maxRange) continue;

            const canSee = hasLineOfSight(
                this.x,
                this.y,
                candidate.x,
                candidate.y,
                context.wallGrid.getNearby(this.x, this.y, distanceToTarget)
            );
            if (!canSee && distanceToTarget > 260) continue;

            const priority = candidate === context.player
                ? 1.2
                : candidate.isBot
                    ? 1.04
                    : 0.9;
            const typeBias = isOperator ? this.aiTypeConfig.operatorPriority : this.aiTypeConfig.enemyPriority;
            const hpRatio = Math.max(0.15, (candidate.hp || candidate.maxHp || 1) / Math.max(1, candidate.maxHp || candidate.hp || 1));
            let score = (priority * typeBias * 500) + (canSee ? 120 : 0) - distanceToTarget - (hpRatio * 55);
            if (this.aiType === 'searcher' && isOperator && this.aiCrateTargetId && distanceToTarget > 170) {
                score -= 90;
            }
            if (this.aiType === 'runner' && isOperator) {
                score -= 110;
                score -= (1 - Math.min(1, this.hp / Math.max(1, this.maxHp))) * 70;
            }
            if (this.aiType === 'fighter' && isOperator) {
                score += 80;
            }
            if (score > bestScore) {
                bestScore = score;
                bestTarget = candidate;
            }
        }

        if (bestTarget) {
            this.aiLastSeenTarget = { x: bestTarget.x, y: bestTarget.y };
        }
        return bestTarget;
    }

    _pickRoamDestination(context) {
        const squadmates = this._getSquadmates(context);
        const squadLeader = this._getSquadLeader(context);
        if (squadmates.length && squadLeader) {
            const anchor = squadLeader === this ? this.aiDestination : (squadLeader.aiDestination || { x: squadLeader.x, y: squadLeader.y });
            if (squadLeader !== this || Math.random() < 0.45) {
                return {
                    x: Math.max(30, Math.min(MAP_WIDTH - 30, anchor.x + randFloat(-90, 90))),
                    y: Math.max(30, Math.min(MAP_HEIGHT - 30, anchor.y + randFloat(-90, 90))),
                };
            }
        }

        const zones = [
            { type: ZONE.HIGH_VALUE, weight: this.aiTypeConfig.highValueZoneWeight },
            { type: ZONE.COMBAT, weight: this.aiTypeConfig.combatZoneWeight },
            { type: ZONE.SAFE, weight: this.aiTypeConfig.safeZoneWeight },
        ];
        const pickedZone = pickWeighted(zones.map((entry) => ({ id: entry.type, weight: entry.weight })));
        const desiredZone = pickedZone == null ? ZONE.COMBAT : Number(pickedZone);

        const richCrates = (context.mapData?.lootCrates || []).filter((crate) => crate.items?.length > 0);
        if (richCrates.length && Math.random() < this.aiTypeConfig.crateSeekChance) {
            const crate = richCrates.reduce((best, current) => {
                if (!best) return current;
                const bestScore = best.items.reduce((sum, item) => sum + (item.sellValue || 0), 0) - dist(this.x, this.y, best.x, best.y) * (2 - this.aiTypeConfig.richCrateBias);
                const currentScore = current.items.reduce((sum, item) => sum + (item.sellValue || 0), 0) - dist(this.x, this.y, current.x, current.y) * (2 - this.aiTypeConfig.richCrateBias);
                return currentScore > bestScore ? current : best;
            }, null);
            if (crate) {
                this.aiCrateTargetId = crate.id;
                return { x: crate.x, y: crate.y };
            }
        }

        this.aiCrateTargetId = null;
        for (let attempt = 0; attempt < 40; attempt++) {
            const radius = randFloat(80, this.aiWanderRadius);
            const angle = randFloat(0, Math.PI * 2);
            const x = Math.max(30, Math.min(MAP_WIDTH - 30, this.x + Math.cos(angle) * radius));
            const y = Math.max(30, Math.min(MAP_HEIGHT - 30, this.y + Math.sin(angle) * radius));
            const col = Math.floor(x / TILE_SIZE);
            const row = Math.floor(y / TILE_SIZE);
            if (context.mapData?.tiles?.[row]?.[col] === 1) continue;
            if (desiredZone != null && context.mapData?.zones?.[row]?.[col] !== desiredZone && Math.random() < 0.75) continue;
            return { x, y };
        }

        const extraction = randChoice(context.mapData?.extractionPoints || []);
        if (extraction) {
            return {
                x: extraction.x + randFloat(-EXTRACTION_RADIUS * 0.6, EXTRACTION_RADIUS * 0.6),
                y: extraction.y + randFloat(-EXTRACTION_RADIUS * 0.6, EXTRACTION_RADIUS * 0.6),
            };
        }
        return { x: this.x, y: this.y };
    }

    _buildInput(context) {
        const input = makeInputSnapshot();
        const target = this.aiTarget;

        if (this.aiSwitchTimer <= 0 && this._getAvailableGunSlots().length > 1 && ((this.currentAmmo <= 0 && !this.isReloading) || (this.isReloading && this.currentAmmo <= 0))) {
            input.weaponSwitchRequested = true;
            this.aiReleaseShotTimer = 0.18;
            this.aiSwitchTimer = randFloat(1.3, 2.8);
        }

        if (target?.alive) {
            const isOperatorTarget = target === context.player || target.isBot;
            const targetDistance = dist(this.x, this.y, target.x, target.y);
            const nearbyWalls = context.wallGrid.getNearby(this.x, this.y, targetDistance);
            const canSee = hasLineOfSight(this.x, this.y, target.x, target.y, nearbyWalls);
            const leadTime = Math.min(0.34, targetDistance / Math.max(1, this.bulletSpeed || 1));
            const predictedX = target.x + (target.vx || 0) * leadTime * this.aiLevelConfig.predictionFactor;
            const predictedY = target.y + (target.vy || 0) * leadTime * this.aiLevelConfig.predictionFactor;
            const aimNoise = this.aiAimError * (targetDistance / Math.max(90, (this.bulletRange || 280) * this.aiLevelConfig.aimDistanceScale));
            input.aimWorld.x = predictedX + randFloat(-aimNoise, aimNoise);
            input.aimWorld.y = predictedY + randFloat(-aimNoise, aimNoise);
            const desiredRange = Math.max(110, Math.min(320, (this.bulletRange || 280) * this.aiPreferredRangeMultiplier));
            const healthRatio = this.hp / Math.max(1, this.maxHp);
            const shouldDisengage = isOperatorTarget && (
                (this.aiType === 'runner' && (targetDistance < desiredRange * 1.4 || healthRatio < 0.88))
                || (this.aiType === 'searcher' && healthRatio < 0.42)
            );

            let moveX = 0;
            let moveY = 0;
            if (shouldDisengage || targetDistance < desiredRange * (this.aiType === 'runner' ? 1.1 : 0.72)) {
                moveX = this.x - target.x;
                moveY = this.y - target.y;
            } else if (targetDistance > desiredRange * (this.aiType === 'fighter' ? 1.35 : 1.15) || !canSee) {
                // Use A* to navigate around walls when chasing a target
                if (!canSee && context.mapData?.navGrid && this.aiPathRecomputeTimer <= 0) {
                    const chasePath = findPath(
                        context.mapData.navGrid, context.mapData.navRows, context.mapData.navCols,
                        this.x, this.y, target.x, target.y
                    );
                    if (chasePath && chasePath.length > 1) {
                        this.aiPath = chasePath;
                        this.aiPathIndex = 0;
                        this.aiPathRecomputeTimer = 0.4; // Don't recompute every frame
                    }
                }
                // Follow A* waypoint if available, else direct-line
                if (!canSee && this.aiPath && this.aiPathIndex < this.aiPath.length) {
                    while (this.aiPathIndex < this.aiPath.length - 1) {
                        const wp = this.aiPath[this.aiPathIndex];
                        if (dist(this.x, this.y, wp.x, wp.y) < 32) {
                            this.aiPathIndex++;
                        } else break;
                    }
                    const wp = this.aiPath[this.aiPathIndex];
                    moveX = wp.x - this.x;
                    moveY = wp.y - this.y;
                } else {
                    moveX = target.x - this.x;
                    moveY = target.y - this.y;
                }
            } else {
                const orbitAngle = angleBetween(this.x, this.y, target.x, target.y) + (Math.PI / 2) * this.aiStrafeDirection;
                moveX = Math.cos(orbitAngle);
                moveY = Math.sin(orbitAngle);
            }

            moveX += this.aiPathOffset.x;
            moveY += this.aiPathOffset.y;
            if (this.aiLevel === 'lv1' && Math.random() < this.aiLevelConfig.hesitationChance) {
                moveX *= 0.3;
                moveY *= 0.3;
            }

            const moveDistance = Math.hypot(moveX, moveY) || 1;
            input.moveDir.x = moveX / moveDistance;
            input.moveDir.y = moveY / moveDistance;
            const maxShootRange = Math.max(120, (this.bulletRange || 280) * (this.aiType === 'fighter' ? 0.98 : 0.9));
            const canFire = canSee && targetDistance <= maxShootRange && this.aiReleaseShotTimer <= 0 && !this.isHealing;
            const fireBias = this.aiType === 'fighter' ? 0.96 : this.aiType === 'searcher' ? 0.78 : 0.56;
            input.shooting = canFire && (!shouldDisengage || targetDistance > 90) && Math.random() < (fireBias * this.aiLevelConfig.combatConfidence);
            input.dashRequested = (this.aiLevel === 'lv3' || this.aiLevel === 'lv4')
                && !this.isHealing
                && this.dashCooldown <= 0
                && (targetDistance < 110 || healthRatio < 0.5 || (!canSee && this.aiType === 'fighter'))
                && Math.random() < this.aiLevelConfig.dashChance;
            return input;
        }

        const destination = this.aiDestination || this._pickRoamDestination(context);

        // ── A* waypoint following ──
        let nextWP = destination; // fallback to direct movement
        if (this.aiPath && this.aiPathIndex < this.aiPath.length) {
            // Advance past reached waypoints
            while (this.aiPathIndex < this.aiPath.length - 1) {
                const wp = this.aiPath[this.aiPathIndex];
                if (dist(this.x, this.y, wp.x, wp.y) < 32) {
                    this.aiPathIndex++;
                } else {
                    break;
                }
            }
            nextWP = this.aiPath[this.aiPathIndex];
        }

        const distToWP = dist(this.x, this.y, nextWP.x, nextWP.y);
        // If we reached the final destination or have no more waypoints, pick new
        if (distToWP < 26 && (!this.aiPath || this.aiPathIndex >= this.aiPath.length - 1)) {
            const dest = this._pickRoamDestination(context);
            this._setDestinationWithPath(dest, context);
            nextWP = this.aiPath?.[0] || dest;
        }

        const dx = nextWP.x - this.x;
        const dy = nextWP.y - this.y;
        const length = Math.hypot(dx, dy) || 1;
        const wanderX = (dx / length) + this.aiPathOffset.x;
        const wanderY = (dy / length) + this.aiPathOffset.y;
        const wanderLength = Math.hypot(wanderX, wanderY) || 1;
        input.moveDir.x = wanderX / wanderLength;
        input.moveDir.y = wanderY / wanderLength;
        input.aimWorld.x = nextWP.x;
        input.aimWorld.y = nextWP.y;
        return input;
    }

    /**
     * Set a new destination and compute an A* path to it.
     * Falls back to direct-line movement if pathfinding is unavailable.
     */
    _setDestinationWithPath(dest, context) {
        this.aiDestination = dest;
        this.aiPath = null;
        this.aiPathIndex = 0;

        const mapData = context.mapData;
        if (mapData?.navGrid && mapData.navRows && mapData.navCols) {
            const path = findPath(
                mapData.navGrid, mapData.navRows, mapData.navCols,
                this.x, this.y, dest.x, dest.y
            );
            if (path && path.length > 1) {
                this.aiPath = path;
                this.aiPathIndex = 0;
            }
        }
    }

    _shouldSeekExtraction(context) {
        const gameTime = context.gameTime || 0;
        const healthRatio = this.hp / Math.max(1, this.maxHp);
        const hasGoods = this.inventoryItems.some((item) => item && item.category !== 'ammo' && item.category !== 'consumable');

        // Type-specific extraction tendencies
        if (this.aiType === 'runner') {
            if (gameTime > 25 && hasGoods) return true;
            if (gameTime > 40) return Math.random() < 0.6;
            if (healthRatio < 0.4) return true;
        } else if (this.aiType === 'searcher') {
            if (gameTime > 35 && hasGoods) return true;
            if (gameTime > 55) return Math.random() < 0.5;
            if (healthRatio < 0.3) return true;
        } else {
            // fighter — least likely to extract
            if (gameTime > 50 && hasGoods) return Math.random() < 0.4;
            if (gameTime > 70) return Math.random() < 0.35;
            if (healthRatio < 0.2) return true;
        }
        return false;
    }

    _pickExtractionDestination(context) {
        const extractions = context.mapData?.extractionPoints || [];
        if (!extractions.length) return this._pickRoamDestination(context);
        // Pick closest extraction point
        let best = extractions[0];
        let bestDist = dist(this.x, this.y, best.x, best.y);
        for (let i = 1; i < extractions.length; i++) {
            const d = dist(this.x, this.y, extractions[i].x, extractions[i].y);
            if (d < bestDist) { best = extractions[i]; bestDist = d; }
        }
        return {
            x: best.x + randFloat(-EXTRACTION_RADIUS * 0.3, EXTRACTION_RADIUS * 0.3),
            y: best.y + randFloat(-EXTRACTION_RADIUS * 0.3, EXTRACTION_RADIUS * 0.3),
        };
    }

    _shouldUseConsumable(context) {
        if (this.isHealing) return false;
        if (!this._hasAllowedConsumable()) return false;
        const useThreshold = this.aiType === 'runner' ? 0.82 : this.aiType === 'searcher' ? 0.68 : 0.6;
        if (this.hp >= this.maxHp * useThreshold) return false;

        // Lv3/Lv4: only heal when no enemy has line-of-sight (behind cover)
        if (this.aiLevel === 'lv3' || this.aiLevel === 'lv4') {
            const visibleThreats = this._getVisibleThreats(context);
            return visibleThreats.length === 0;
        }

        // Lv1/lv2: original distance-based check
        const threats = [context.player, ...(context.aiPlayers || []).filter((bot) => bot.id !== this.id)]
            .filter((entity) => entity?.alive)
            .filter((entity) => !this.isFriendlyWith(entity))
            .some((entity) => dist(this.x, this.y, entity.x, entity.y) < (this.aiType === 'runner' ? 220 : 190));
        return !threats;
    }

    /**
     * Get all hostile operators that have line-of-sight to this AI within aggro range.
     */
    _getVisibleThreats(context) {
        const range = this.aiAggroRange * 1.1;
        return [context.player, ...(context.aiPlayers || []).filter(b => b.id !== this.id)]
            .filter(e => e?.alive && !this.isFriendlyWith(e))
            .filter(e => {
                const d = dist(this.x, this.y, e.x, e.y);
                if (d > range) return false;
                const walls = context.wallGrid.getNearby(this.x, this.y, d);
                return hasLineOfSight(this.x, this.y, e.x, e.y, walls);
            });
    }

    /**
     * Find a nearby position behind a wall that blocks LOS from all given threats.
     * Samples candidate spots adjacent to nearby walls and picks the closest one
     * that is not visible to any threat.
     */
    _findCoverPosition(context, threats) {
        const tiles = context.mapData?.tiles;
        if (!tiles) return null;

        const myCol = Math.floor(this.x / TILE_SIZE);
        const myRow = Math.floor(this.y / TILE_SIZE);
        const searchRadius = 8; // tiles to search

        let bestPos = null;
        let bestDist = Infinity;

        for (let dr = -searchRadius; dr <= searchRadius; dr++) {
            for (let dc = -searchRadius; dc <= searchRadius; dc++) {
                const r = myRow + dr;
                const c = myCol + dc;
                if (r <= 0 || r >= (tiles.length - 1) || c <= 0 || c >= (tiles[0]?.length - 1)) continue;
                if (tiles[r][c] === 1) continue; // skip wall tiles

                // Must be adjacent to at least one wall (has cover)
                const hasWallNeighbor =
                    (tiles[r - 1]?.[c] === 1) || (tiles[r + 1]?.[c] === 1) ||
                    (tiles[r]?.[c - 1] === 1) || (tiles[r]?.[c + 1] === 1);
                if (!hasWallNeighbor) continue;

                const px = c * TILE_SIZE + TILE_SIZE / 2;
                const py = r * TILE_SIZE + TILE_SIZE / 2;
                const d = dist(this.x, this.y, px, py);
                if (d >= bestDist) continue; // prune: already found closer

                // Check that no threat has LOS to this candidate position
                let safe = true;
                for (const threat of threats) {
                    const td = dist(px, py, threat.x, threat.y);
                    const walls = context.wallGrid.getNearby(px, py, td);
                    if (hasLineOfSight(px, py, threat.x, threat.y, walls)) {
                        safe = false;
                        break;
                    }
                }
                if (safe) {
                    bestDist = d;
                    bestPos = { x: px, y: py };
                }
            }
        }

        return bestPos;
    }

    _hasAllowedConsumable() {
        return this.inventoryItems.some((item) => item?.definitionId && getItemDefinition(item.definitionId)?.category === 'consumable' && isRarityAllowed(getItemDefinition(item.definitionId)?.rarity, this.aiLevelConfig.maxRarity));
    }

    _useAllowedConsumable() {
        const index = this.inventoryItems.findIndex((item) => item?.definitionId && getItemDefinition(item.definitionId)?.category === 'consumable' && isRarityAllowed(getItemDefinition(item.definitionId)?.rarity, this.aiLevelConfig.maxRarity));
        if (index === -1) return false;
        const definitionId = this.inventoryItems[index].definitionId;
        const result = this._startHealing(definitionId);
        return result?.ok || false;
    }

    _lootNearbyCrate(context) {
        const crates = (context.mapData?.lootCrates || [])
            .filter((crate) => crate.items?.length > 0 && dist(this.x, this.y, crate.x, crate.y) <= CRATE_INTERACT_RANGE);
        if (!crates.length) return false;

        const crate = crates.reduce((best, current) => {
            if (!best) return current;
            return dist(this.x, this.y, current.x, current.y) < dist(this.x, this.y, best.x, best.y) ? current : best;
        }, null);
        if (!crate) return false;

        const itemIndex = crate.items.reduce((bestIndex, item, index, items) => {
            if (bestIndex === -1) return index;
            const currentBest = items[bestIndex];
            const currentScore = (item.sellValue || 0) * (this.aiType === 'searcher' ? 1.12 : 1) + (this._shouldEquipLoot(item) ? 100000 : 0);
            const bestScore = (currentBest.sellValue || 0) * (this.aiType === 'searcher' ? 1.12 : 1) + (this._shouldEquipLoot(currentBest) ? 100000 : 0);
            return currentScore > bestScore ? index : bestIndex;
        }, -1);
        if (itemIndex === -1) return false;

        const [item] = crate.items.splice(itemIndex, 1);
        const added = this.addItem(item);
        if (!added) {
            crate.items.splice(itemIndex, 0, item);
            return false;
        }
        if (this._shouldEquipLoot(item)) {
            this.equipItemFromBackpack(item.id);
        }
        return true;
    }

    _shouldEquipLoot(item) {
        if (!isRarityAllowed(item?.rarity, this.aiLevelConfig.maxRarity)) return false;
        if (item.category === 'gun') {
            const weakestSlot = GUN_LOADOUT_SLOTS.reduce((lowestSlot, slot) => {
                if (!lowestSlot) return slot;
                const currentValue = getItemDefinition(this.loadout?.[slot])?.sellValue || 0;
                const lowestValue = getItemDefinition(this.loadout?.[lowestSlot])?.sellValue || 0;
                return currentValue < lowestValue ? slot : lowestSlot;
            }, GUN_LOADOUT_SLOTS[0]);
            return !this.loadout.gunSecondary || (item.sellValue || 0) > (getItemDefinition(this.loadout?.[weakestSlot])?.sellValue || 0);
        }
        if (!LOADOUT_SLOTS.includes(item.category)) return false;
        const currentValue = getItemDefinition(this.loadout?.[item.category])?.sellValue || 0;
        return !this.loadout?.[item.category] || (item.sellValue || 0) > currentValue;
    }
}

export function createAIPlayer(x, y, difficulty = 'advanced', index = 0, options = {}) {
    const aiProfile = options.aiProfile || createAIOperatorProfile(difficulty);
    const preparation = buildBotLoadout(difficulty, aiProfile);
    return new AIPlayer(x, y, preparation.loadout, preparation.backpackItems, {
        difficulty,
        aiProfile,
        displayName: options.displayName || BOT_NAMES[index % BOT_NAMES.length],
        rosterId: options.rosterId || null,
        ...options,
    });
}
