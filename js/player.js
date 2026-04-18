// ============================================================
// player.js — Player entity
// ============================================================

import {
    PLAYER_RADIUS, PLAYER_SPEED, PLAYER_MAX_HP,
    PLAYER_SHOOT_DAMAGE, PLAYER_SHOOT_COOLDOWN, PLAYER_BULLET_SPEED, PLAYER_BULLET_RANGE,
    PLAYER_DASH_SPEED, PLAYER_DASH_DURATION, PLAYER_DASH_COOLDOWN,
    MAP_WIDTH, MAP_HEIGHT, PLAYER_BASE_CARRY_CAPACITY, PLAYER_MAX_ENERGY,
    PLAYER_ENERGY_DRAIN_PER_SECOND, PLAYER_ENERGY_RECOVERY_PER_SECOND, PLAYER_ENERGY_IDLE_RECOVERY_PER_SECOND,
    PLAYER_SLOW_SPEED_MULTIPLIER, PLAYER_ENERGY_RETURN_THRESHOLD
} from './constants.js';
import { clamp, normalize, generateId, angleBetween } from './utils.js';
import { SAFEBOX_CAPACITY, createLootItem, getAmmoAmountForEntry, getItemDefinition, getRarityMeta, GUN_LOADOUT_SLOTS, LOADOUT_SLOTS, RARITY_ORDER, isAmmoDefinition, isConsumableDefinition, getStackableAmountForEntry, rarityIndex } from './profile.js';

const DEFAULT_HEALING_MOVE_SPEED = 10;
const CONSUMABLE_HEAL_RATE_BY_RARITY = {
    gray: 1,
    white: 1,
    green: 1.5,
    blue: 2,
    purple: 3,
    gold: 4,
    red: 6,
};

export class Player {
    constructor(x, y, loadout = {}, backpackItems = [], safeboxItems = []) {
        this.id = generateId();
        this.displayName = 'Operator';
        this.isBot = false;
        this.bulletOwnerType = 'player';
        this.squadId = `solo-${this.id}`;
        this.squadIndex = 0;
        this.squadSize = 1;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = PLAYER_RADIUS;
        this.alive = true;
        this.angle = 0; // facing direction

        this.loadout = {
            gunPrimary: getItemDefinition(loadout.gunPrimary || loadout.primaryGun || loadout.gun)?.category === 'gun' ? (loadout.gunPrimary || loadout.primaryGun || loadout.gun) : null,
            gunSecondary: getItemDefinition(loadout.gunSecondary || loadout.secondaryGun || loadout.gun2)?.category === 'gun' ? (loadout.gunSecondary || loadout.secondaryGun || loadout.gun2) : null,
            armor: getItemDefinition(loadout.armor)?.category === 'armor' ? loadout.armor : null,
            helmet: getItemDefinition(loadout.helmet)?.category === 'helmet' ? loadout.helmet : null,
            shoes: getItemDefinition(loadout.shoes)?.category === 'shoes' ? loadout.shoes : null,
            backpack: getItemDefinition(loadout.backpack)?.category === 'backpack' ? loadout.backpack : null
        };

        this.weaponSlot = this._getHighestValueGunSlot();
        this.weaponId = this.weaponSlot ? this.loadout[this.weaponSlot] : null;
        this.weapon = getItemDefinition(this.weaponId);
        this.activeCombatSlot = this.weaponSlot || null;
        this.armor = getItemDefinition(this.loadout.armor);
        this.helmet = getItemDefinition(this.loadout.helmet);
        this.shoes = getItemDefinition(this.loadout.shoes);
        this.backpack = getItemDefinition(this.loadout.backpack);

        this.moveSpeed = PLAYER_SPEED;
        this.carryCapacity = PLAYER_BASE_CARRY_CAPACITY;
        this.baseMoveSpeed = PLAYER_SPEED;
        this.energyMax = PLAYER_MAX_ENERGY;
        this.energy = this.energyMax;
        this.manualSlowMode = false;
        this.forcedSlowMode = false;
        this.isSlowMode = false;

        // Shooting
        this.shootCooldown = 0;
        this.ammoCapacity = 0;
        this.currentAmmo = 0;
        this.loadedAmmoQueue = [];
        this.reloadDuration = 0;
        this.reloadTimer = 0;
        this.isReloading = false;
        this.bulletSpread = 0;
        this.projectileScale = 1;
        this.requireMouseReleaseForShot = false;
        this.gunRuntimeStates = Object.fromEntries(
            GUN_LOADOUT_SLOTS.map((slot) => [slot, this._createGunRuntimeState()])
        );

        // Dash
        this.dashing = false;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this.dashDirX = 0;
        this.dashDirY = 0;

        // Loot
        this.loot = 0;
        this.inventoryItems = backpackItems
            .map((entry) => createLootItem(entry.definitionId || entry, { quantity: entry.quantity }))
            .filter(Boolean);
        this.safeboxItems = safeboxItems
            .map((entry) => createLootItem(entry.definitionId || entry, { quantity: entry.quantity }))
            .filter(Boolean)
            .slice(0, 4);
        this.broughtInCounts = this._buildBroughtInCounts(backpackItems, safeboxItems);

        // Active regen effect
        this.regenPerSecond = 0;
        this.regenTimer = 0;

        // Active consumable healing
        this.isHealing = false;
        this.healingDefinitionId = null;
        this.healingName = '';
        this.healingRate = 0;
        this.healingMoveSpeed = DEFAULT_HEALING_MOVE_SPEED;
        this.healingProgress = 0;

        this.runLossBreakdown = {
            ammoUsed: 0,
            consumablesUsed: 0,
            abandoned: 0,
        };

        this.floatingDamageTexts = [];
        this.onDamageTaken = null;

        // Extraction
        this.extracting = false;
        this.extractTimer = 0;

        // Damage flash
        this.damageFlash = 0;

        // Invincibility frames after taking damage
        this.invincible = 0;

        this.shieldLayers = [];

        this._applyLoadoutStats(true);
        this._recalculateLootValue();
        this.reloadBestAvailableAmmo(true);
    }

    _createGunRuntimeState() {
        return {
            loadedAmmoQueue: [],
            shootCooldown: 0,
            reloadTimer: 0,
            isReloading: false,
        };
    }

    _ensureGunRuntimeState(slot) {
        if (!slot || !GUN_LOADOUT_SLOTS.includes(slot)) {
            return this._createGunRuntimeState();
        }
        if (!this.gunRuntimeStates[slot]) {
            this.gunRuntimeStates[slot] = this._createGunRuntimeState();
        }
        return this.gunRuntimeStates[slot];
    }

    _storeActiveGunState() {
        const slot = this.activeCombatSlot || this.weaponSlot;
        if (!slot || !GUN_LOADOUT_SLOTS.includes(slot)) return;
        const state = this._ensureGunRuntimeState(slot);
        state.loadedAmmoQueue = [...this.loadedAmmoQueue];
        state.shootCooldown = Math.max(0, Number(this.shootCooldown) || 0);
        state.reloadTimer = Math.max(0, Number(this.reloadTimer) || 0);
        state.isReloading = Boolean(this.isReloading);
    }

    _syncActiveGunStateFromRuntime() {
        const slot = this.activeCombatSlot || this.weaponSlot;
        if (!slot || !GUN_LOADOUT_SLOTS.includes(slot) || !this.weapon) {
            this.loadedAmmoQueue = [];
            this.currentAmmo = 0;
            this.shootCooldown = 0;
            this.reloadTimer = 0;
            this.isReloading = false;
            return;
        }
        const state = this._ensureGunRuntimeState(slot);
        const cappedQueue = [...(state.loadedAmmoQueue || [])].slice(0, Math.max(0, this.ammoCapacity));
        state.loadedAmmoQueue = cappedQueue;
        this.loadedAmmoQueue = [...cappedQueue];
        this.currentAmmo = this.loadedAmmoQueue.length;
        this.shootCooldown = Math.max(0, Number(state.shootCooldown) || 0);
        this.reloadTimer = Math.max(0, Number(state.reloadTimer) || 0);
        this.isReloading = Boolean(state.isReloading) && this.currentAmmo < this.ammoCapacity;
        if (!this.isReloading) {
            this.reloadTimer = 0;
        }
    }

    _decrementGunCooldowns(dt) {
        for (const slot of GUN_LOADOUT_SLOTS) {
            const state = this._ensureGunRuntimeState(slot);
            state.shootCooldown = Math.max(0, (Number(state.shootCooldown) || 0) - dt);
        }
    }

    _clearGunRuntimeState(slot) {
        if (!slot || !GUN_LOADOUT_SLOTS.includes(slot)) return;
        this.gunRuntimeStates[slot] = this._createGunRuntimeState();
        if ((this.activeCombatSlot || this.weaponSlot) === slot) {
            this._syncActiveGunStateFromRuntime();
        }
    }

    _countEntryQuantity(entry) {
        if (!entry?.definitionId) return 0;
        if (isAmmoDefinition(entry.definitionId)) return getAmmoAmountForEntry(entry);
        if (isConsumableDefinition(entry.definitionId)) return getStackableAmountForEntry(entry);
        return 1;
    }

    _addCountToMap(map, definitionId, amount) {
        if (!definitionId || amount <= 0) return;
        map[definitionId] = (map[definitionId] || 0) + amount;
    }

    _buildBroughtInCounts(backpackItems = [], safeboxItems = []) {
        const counts = {};
        for (const definitionId of Object.values(this.loadout || {})) {
            this._addCountToMap(counts, definitionId, 1);
        }
        for (const entry of backpackItems || []) {
            const definitionId = entry?.definitionId || entry;
            this._addCountToMap(counts, definitionId, this._countEntryQuantity({ definitionId, quantity: entry?.quantity }));
        }
        for (const entry of safeboxItems || []) {
            const definitionId = entry?.definitionId || entry;
            this._addCountToMap(counts, definitionId, this._countEntryQuantity({ definitionId, quantity: entry?.quantity }));
        }
        return counts;
    }

    _getCurrentSecuredCounts() {
        const counts = {};
        for (const definitionId of Object.values(this.loadout || {})) {
            this._addCountToMap(counts, definitionId, 1);
        }
        for (const item of this.inventoryItems) {
            this._addCountToMap(counts, item.definitionId, this._countEntryQuantity(item));
        }
        for (const item of this.safeboxItems) {
            this._addCountToMap(counts, item.definitionId, this._countEntryQuantity(item));
        }
        return counts;
    }

    getExtractedRaidValue() {
        const currentCounts = this._getCurrentSecuredCounts();
        return Object.entries(currentCounts).reduce((sum, [definitionId, count]) => {
            const broughtInCount = this.broughtInCounts?.[definitionId] || 0;
            const extractedCount = Math.max(0, count - broughtInCount);
            const definition = getItemDefinition(definitionId);
            return sum + ((definition?.sellValue || 0) * extractedCount);
        }, 0);
    }

    _calculateCarryCapacity(loadout) {
        let capacity = PLAYER_BASE_CARRY_CAPACITY;
        for (const slot of LOADOUT_SLOTS) {
            const definition = getItemDefinition(loadout?.[slot]);
            capacity += definition?.modifiers?.carrySlots || 0;
        }
        return capacity;
    }

    _getItemSpace(itemOrDefinitionId) {
        const definitionId = typeof itemOrDefinitionId === 'string' ? itemOrDefinitionId : itemOrDefinitionId?.definitionId;
        const explicitSize = typeof itemOrDefinitionId === 'object' ? itemOrDefinitionId?.size : null;
        return Math.max(1, Number(explicitSize ?? getItemDefinition(definitionId)?.size) || 1);
    }

    setSquad(squadId, squadIndex = 0, squadSize = 1) {
        this.squadId = squadId || this.squadId;
        this.squadIndex = Math.max(0, Math.floor(Number(squadIndex) || 0));
        this.squadSize = Math.max(1, Math.floor(Number(squadSize) || 1));
    }

    isFriendlyWith(entity) {
        return Boolean(entity) && Boolean(this.squadId) && this.squadId === entity.squadId;
    }

    getCarriedSpaceUsed() {
        return this.inventoryItems.reduce((sum, item) => sum + this._getItemSpace(item), 0);
    }

    getRemainingCarrySpace() {
        return Math.max(0, this.carryCapacity - this.getCarriedSpaceUsed());
    }

    getSafeboxSpaceUsed() {
        return this.safeboxItems.reduce((sum, item) => sum + this._getItemSpace(item), 0);
    }

    _getAvailableGunSlots() {
        return GUN_LOADOUT_SLOTS.filter((slot) => getItemDefinition(this.loadout?.[slot])?.category === 'gun');
    }

    _getHighestValueGunSlot() {
        return this._getAvailableGunSlots().reduce((bestSlot, slot) => {
            if (!bestSlot) return slot;
            const bestValue = getItemDefinition(this.loadout?.[bestSlot])?.sellValue || 0;
            const slotValue = getItemDefinition(this.loadout?.[slot])?.sellValue || 0;
            return slotValue > bestValue ? slot : bestSlot;
        }, null);
    }

    _applyLoadoutStats(resetHp = false, { skipStore = false } = {}) {
        if (!skipStore) this._storeActiveGunState();
        const availableGunSlots = this._getAvailableGunSlots();
        if (resetHp || !availableGunSlots.includes(this.weaponSlot)) {
            this.weaponSlot = this._getHighestValueGunSlot();
        }
        this.weaponId = this.weaponSlot ? this.loadout[this.weaponSlot] : null;
        this.weapon = getItemDefinition(this.weaponId);
        this.armor = getItemDefinition(this.loadout.armor);
        this.helmet = getItemDefinition(this.loadout.helmet);
        this.shoes = getItemDefinition(this.loadout.shoes);
        this.backpack = getItemDefinition(this.loadout.backpack);

        this.shootDamage = this.weapon?.stats?.damage ?? 0;
        this.shootCooldownDuration = this.weapon?.stats?.cooldown ?? PLAYER_SHOOT_COOLDOWN;
        this.bulletSpeed = this.weapon?.stats?.bulletSpeed ?? PLAYER_BULLET_SPEED;
        this.bulletRange = this.weapon?.stats?.range ?? PLAYER_BULLET_RANGE;
        this.outrangeMulti = Math.max(0, Math.min(2, Number(this.weapon?.stats?.outrangeMulti) || 0.5));
        this.ammoCapacity = this.weapon?.stats?.clipSize ?? 0;
        this.reloadDuration = this.weapon?.stats?.reloadTime ?? 0;
        this.bulletSpread = this.weapon?.stats?.spread ?? 0.03;
        this.projectileScale = Math.max(0.5, Number(this.weapon?.projectileScale) || 1);
        this.baseMoveSpeed = PLAYER_SPEED;
        this.carryCapacity = PLAYER_BASE_CARRY_CAPACITY;

        let bonusHp = 0;
        this.hasGravityBoots = false;
        for (const item of [this.armor, this.helmet, this.shoes, this.backpack]) {
            if (!item) continue;
            bonusHp += item.modifiers?.maxHp || 0;
            this.baseMoveSpeed += item.modifiers?.speed || 0;
            this.carryCapacity += item.modifiers?.carrySlots || 0;
            if (item.modifiers?.shootCooldownMultiplier) {
                this.shootCooldownDuration *= item.modifiers.shootCooldownMultiplier;
            }
            if (item.modifiers?.gravityBoots) {
                this.hasGravityBoots = true;
            }
        }

        this.maxHp = PLAYER_MAX_HP + bonusHp;
        this.hp = resetHp ? this.maxHp : Math.min(this.hp, this.maxHp);

        // Build shield layers from armor and helmet (purple+ rarity)
        const oldShields = this.shieldLayers || [];
        this.shieldLayers = [];
        for (const item of [this.armor, this.helmet]) {
            if (!item) continue;
            const shieldMax = item.modifiers?.shieldHp;
            const shieldRegen = item.modifiers?.shieldRegen || 0;
            if (shieldMax && shieldMax > 0) {
                const ri = rarityIndex(item.rarity);
                const old = oldShields.find(s => s.source === item.category);
                this.shieldLayers.push({
                    maxHp: shieldMax,
                    hp: resetHp ? shieldMax : Math.min(old?.hp ?? shieldMax, shieldMax),
                    regen: shieldRegen,
                    rarity: item.rarity,
                    rarityIndex: ri,
                    source: item.category
                });
            }
        }
        this.shieldLayers.sort((a, b) => b.rarityIndex - a.rarityIndex);

        this.moveSpeed = this.baseMoveSpeed * (this.isSlowMode ? PLAYER_SLOW_SPEED_MULTIPLIER : 1);
        this._syncCombatSlot();
        this._syncActiveGunStateFromRuntime();
    }

    _syncCombatSlot() {
        const availableGunSlots = this._getAvailableGunSlots();
        if (!availableGunSlots.length) {
            this.weaponSlot = null;
            this.weaponId = null;
            this.weapon = null;
            this.activeCombatSlot = null;
            return;
        }
        if (!availableGunSlots.includes(this.weaponSlot)) {
            this.weaponSlot = this._getHighestValueGunSlot();
            this.weaponId = this.weaponSlot ? this.loadout[this.weaponSlot] : null;
            this.weapon = getItemDefinition(this.weaponId);
        }
        if (GUN_LOADOUT_SLOTS.includes(this.activeCombatSlot) && !availableGunSlots.includes(this.activeCombatSlot)) {
            this.activeCombatSlot = this.weaponSlot;
        }
        if (!this.activeCombatSlot) {
            this.activeCombatSlot = this.weaponSlot;
        }
    }

    hasUsableGun() {
        return Boolean(this.weapon && this.ammoCapacity > 0);
    }

    isGunActive() {
        return GUN_LOADOUT_SLOTS.includes(this.activeCombatSlot) && this.hasUsableGun();
    }

    switchGun() {
        const availableGunSlots = this._getAvailableGunSlots();
        if (!availableGunSlots.length) {
            this._storeActiveGunState();
            this.activeCombatSlot = null;
            this._syncActiveGunStateFromRuntime();
            return this.activeCombatSlot;
        }
        this._storeActiveGunState();
        if (availableGunSlots.length === 1) {
            this.weaponSlot = availableGunSlots[0];
        } else if (availableGunSlots.includes(this.activeCombatSlot)) {
            const currentIndex = availableGunSlots.indexOf(this.activeCombatSlot);
            this.weaponSlot = availableGunSlots[(currentIndex + 1) % availableGunSlots.length];
        } else if (availableGunSlots.includes(this.weaponSlot)) {
            const currentIndex = availableGunSlots.indexOf(this.weaponSlot);
            this.weaponSlot = availableGunSlots[(currentIndex + 1) % availableGunSlots.length];
        } else {
            this.weaponSlot = this._getHighestValueGunSlot();
        }

        this.activeCombatSlot = this.weaponSlot;
        this._applyLoadoutStats(false, { skipStore: true });
        this.requireMouseReleaseForShot = true;
        return this.activeCombatSlot;
    }

    _recalculateLootValue() {
        this.loot = this.inventoryItems.reduce((sum, item) => sum + (item.sellValue || 0), 0);
    }

    _addRunLoss(amount, key) {
        if (!(key in this.runLossBreakdown)) return;
        const numericAmount = Math.max(0, Number(amount) || 0);
        this.runLossBreakdown[key] += numericAmount;
    }

    getRunLossSummary(extra = {}) {
        const ammoUsed = this.runLossBreakdown.ammoUsed || 0;
        const consumablesUsed = this.runLossBreakdown.consumablesUsed || 0;
        const abandoned = this.runLossBreakdown.abandoned || 0;
        const backpack = Math.max(0, Number(extra.backpack) || 0);
        const deathEquipment = Math.max(0, Number(extra.deathEquipment) || 0);
        const safebox = Math.max(0, Number(extra.safebox) || 0);
        return {
            ammoUsed,
            consumablesUsed,
            abandoned,
            backpack,
            deathEquipment,
            safebox,
            total: ammoUsed + consumablesUsed + abandoned + backpack + deathEquipment + safebox,
        };
    }

    getLoadoutView() {
        return LOADOUT_SLOTS.map((slot) => {
            const definition = getItemDefinition(this.loadout[slot]);
            return {
                slot,
                definitionId: definition?.id || null,
                name: definition?.name || 'Empty',
                category: slot,
                rarity: definition?.rarity || 'white',
                sellValue: definition?.sellValue || 0,
                description: definition?.description || '',
            };
        });
    }

    getBackpackView() {
        return this.inventoryItems.map((item) => ({ ...item }));
    }

    getSafeboxView() {
        return this.safeboxItems.map((item) => ({ ...item }));
    }

    getBackpackAmmoCount() {
        return this.inventoryItems.reduce((sum, item) => sum + getAmmoAmountForEntry(item), 0);
    }

    _hasFallbackAmmo() {
        return this.getBackpackAmmoCount() <= 0;
    }

    _getAmmoPriority(definitionId) {
        const rarity = getItemDefinition(definitionId)?.rarity || 'white';
        const orderIndex = RARITY_ORDER.indexOf(rarity);
        return orderIndex === -1 ? RARITY_ORDER.length : orderIndex;
    }

    _updateAmmoPackPresentation(item) {
        if (!isAmmoDefinition(item.definitionId)) return;
        const definition = getItemDefinition(item.definitionId);
        const quantity = getAmmoAmountForEntry(item);
        item.quantity = quantity;
        item.name = `${definition?.name || 'Ammo'} x${quantity}`;
        item.sellValue = (definition?.sellValue || 0) * quantity;
        item.description = `${definition?.name || 'Ammo'} pack containing ${quantity} round${quantity === 1 ? '' : 's'}.`;
    }

    _pushAmmoPackToBackpack(definitionId, quantity) {
        let remaining = Math.max(0, Math.floor(quantity || 0));

        for (const item of this.inventoryItems) {
            if (remaining <= 0) break;
            if (item.definitionId !== definitionId || !isAmmoDefinition(item.definitionId)) continue;
            const current = getAmmoAmountForEntry(item);
            const free = Math.max(0, 999 - current);
            if (free <= 0) continue;
            const added = Math.min(free, remaining);
            item.quantity = current + added;
            this._updateAmmoPackPresentation(item);
            remaining -= added;
        }

        while (remaining > 0) {
            const packSize = Math.min(999, remaining);
            this.inventoryItems.push(createLootItem(definitionId, { quantity: packSize }));
            remaining -= packSize;
        }
    }

    _pushConsumableStacksToBackpack(definitionId, quantity) {
        let remaining = Math.max(0, Math.floor(quantity || 0));

        for (const item of this.inventoryItems) {
            if (remaining <= 0) break;
            if (item.definitionId !== definitionId || !isConsumableDefinition(item.definitionId)) continue;
            const current = getStackableAmountForEntry(item);
            const free = Math.max(0, 999 - current);
            if (free <= 0) continue;
            const added = Math.min(free, remaining);
            item.quantity = current + added;
            item.name = `${getItemDefinition(definitionId)?.name || 'Consumable'} x${item.quantity}`;
            item.sellValue = (getItemDefinition(definitionId)?.sellValue || 0) * item.quantity;
            item.description = `${getItemDefinition(definitionId)?.name || 'Consumable'} stack containing ${item.quantity} use${item.quantity === 1 ? '' : 's'}.`;
            remaining -= added;
        }

        while (remaining > 0) {
            const packSize = Math.min(999, remaining);
            this.inventoryItems.push(createLootItem(definitionId, { quantity: packSize }));
            remaining -= packSize;
        }
    }

    _getConsumableHealRate(definitionId) {
        const definition = getItemDefinition(definitionId);
        const configuredRate = Number(definition?.healRate);
        if (Number.isFinite(configuredRate) && configuredRate > 0) {
            return configuredRate;
        }
        const rarity = definition?.rarity || 'white';
        return CONSUMABLE_HEAL_RATE_BY_RARITY[rarity] || 1;
    }

    _getConsumableMoveSpeed(definitionId) {
        const configuredSpeed = Number(getItemDefinition(definitionId)?.healingMoveSpeed);
        if (Number.isFinite(configuredSpeed) && configuredSpeed >= 0) {
            return configuredSpeed;
        }
        return DEFAULT_HEALING_MOVE_SPEED;
    }

    _consumeConsumableUnit(definitionId) {
        const index = this.inventoryItems.findIndex((item) => item.definitionId === definitionId && isConsumableDefinition(item.definitionId));
        if (index === -1) return false;

        const item = this.inventoryItems[index];
        const definition = getItemDefinition(definitionId);
        this._addRunLoss(definition?.sellValue || 0, 'consumablesUsed');
        const remaining = getStackableAmountForEntry(item) - 1;
        if (remaining <= 0) {
            this.inventoryItems.splice(index, 1);
        } else {
            item.quantity = remaining;
            item.name = `${definition?.name || 'Consumable'} x${remaining}`;
            item.sellValue = (definition?.sellValue || 0) * remaining;
            item.description = `${definition?.name || 'Consumable'} stack containing ${remaining} use${remaining === 1 ? '' : 's'}.`;
        }
        this._recalculateLootValue();
        return true;
    }

    stopHealing() {
        this.isHealing = false;
        this.healingDefinitionId = null;
        this.healingName = '';
        this.healingRate = 0;
        this.healingMoveSpeed = DEFAULT_HEALING_MOVE_SPEED;
        this.healingProgress = 0;
    }

    _startHealing(definitionId) {
        const definition = getItemDefinition(definitionId);
        if (!definition || !isConsumableDefinition(definitionId)) {
            return { ok: false, reason: 'missing', name: '' };
        }

        // Instant cure: full HP + shield + energy in one tick, consumes 1 unit
        if (definition.instantCure) {
            if (this.hp >= this.maxHp && this.energy >= this.energyMax &&
                (!this.shieldLayers || this.shieldLayers.every(s => s.hp >= s.maxHp))) {
                return { ok: false, reason: 'full', name: definition.name };
            }
            if (!this._consumeConsumableUnit(definitionId)) {
                return { ok: false, reason: 'missing', name: definition.name };
            }
            this.hp = this.maxHp;
            this.energy = this.energyMax;
            if (this.shieldLayers) {
                for (const shield of this.shieldLayers) {
                    shield.hp = shield.maxHp;
                }
            }
            return { ok: true, reason: 'instant', name: definition.name };
        }

        if (this.hp >= this.maxHp) {
            return { ok: false, reason: 'full', name: definition.name };
        }
        this.isReloading = false;
        this.reloadTimer = 0;
        this.isHealing = true;
        this.healingDefinitionId = definitionId;
        this.healingName = definition.name;
        this.healingRate = this._getConsumableHealRate(definitionId);
        this.healingMoveSpeed = this._getConsumableMoveSpeed(definitionId);
        this.healingProgress = 0;
        return { ok: true, reason: 'started', name: definition.name };
    }

    _returnLoadedAmmoToBackpack(slot = this.activeCombatSlot || this.weaponSlot) {
        const state = slot === (this.activeCombatSlot || this.weaponSlot)
            ? null
            : this._ensureGunRuntimeState(slot);
        const queue = state ? [...(state.loadedAmmoQueue || [])] : [...this.loadedAmmoQueue];
        const ammoCounts = {};
        for (const definitionId of queue) {
            if (definitionId === 'ammo_white') continue;
            ammoCounts[definitionId] = (ammoCounts[definitionId] || 0) + 1;
        }
        for (const [definitionId, quantity] of Object.entries(ammoCounts)) {
            this._pushAmmoPackToBackpack(definitionId, quantity);
        }
        if (state) {
            state.loadedAmmoQueue = [];
            state.reloadTimer = 0;
            state.isReloading = false;
        } else {
            this.loadedAmmoQueue = [];
            this.currentAmmo = 0;
            this.reloadTimer = 0;
            this.isReloading = false;
            this._storeActiveGunState();
        }
    }

    returnLoadedAmmoToInventory() {
        for (const slot of GUN_LOADOUT_SLOTS) {
            if (getItemDefinition(this.loadout?.[slot])?.category === 'gun') {
                this._returnLoadedAmmoToBackpack(slot);
            }
        }
        this._syncActiveGunStateFromRuntime();
        this._recalculateLootValue();
    }

    _getCurrentAmmoDefinitionId() {
        if (this.loadedAmmoQueue.length > 0) {
            return this.loadedAmmoQueue[0];
        }
        const backpackAmmo = this.inventoryItems
            .filter((item) => isAmmoDefinition(item.definitionId) && getAmmoAmountForEntry(item) > 0)
            .sort((a, b) => this._getAmmoPriority(a.definitionId) - this._getAmmoPriority(b.definitionId));
        return backpackAmmo[0]?.definitionId || 'ammo_white';
    }

    _takeAmmoFromBackpack(amount) {
        let remaining = Math.max(0, Math.floor(amount || 0));
        const loadedRounds = [];

        if (this.getBackpackAmmoCount() <= 0) {
            return Array.from({ length: remaining }, () => 'ammo_white');
        }

        while (remaining > 0) {
            const ammoEntries = this.inventoryItems
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => isAmmoDefinition(item.definitionId) && getAmmoAmountForEntry(item) > 0)
                .sort((a, b) => this._getAmmoPriority(a.item.definitionId) - this._getAmmoPriority(b.item.definitionId));

            const nextAmmo = ammoEntries[0];
            if (!nextAmmo) break;

            const { item, index } = nextAmmo;
            const available = getAmmoAmountForEntry(item);
            const used = Math.min(available, remaining);
            for (let i = 0; i < used; i++) {
                loadedRounds.push(item.definitionId);
            }

            const left = available - used;
            if (left <= 0) {
                this.inventoryItems.splice(index, 1);
            } else {
                item.quantity = left;
                this._updateAmmoPackPresentation(item);
            }
            remaining -= used;
        }

        if (remaining > 0) {
            loadedRounds.push(...Array.from({ length: remaining }, () => 'ammo_white'));
        }

        return loadedRounds;
    }

    reloadBestAvailableAmmo(forceReplace = false) {
        if (forceReplace) {
            this._returnLoadedAmmoToBackpack();
        }
        const ammoNeeded = this.ammoCapacity - this.currentAmmo;
        if (ammoNeeded <= 0) return false;
        const loadedRounds = this._takeAmmoFromBackpack(ammoNeeded);
        this.loadedAmmoQueue = [...this.loadedAmmoQueue, ...loadedRounds]
            .sort((a, b) => this._getAmmoPriority(a) - this._getAmmoPriority(b));
        this.currentAmmo = this.loadedAmmoQueue.length;
        this.isReloading = false;
        this.reloadTimer = 0;
        this._recalculateLootValue();
        return loadedRounds.length > 0;
    }

    equipItemFromBackpack(itemId) {
        const index = this.inventoryItems.findIndex((item) => item.id === itemId);
        if (index === -1) return { ok: false, message: 'Item not found in backpack.' };

        const item = this.inventoryItems[index];
        const targetSlot = item.category === 'gun'
            ? (GUN_LOADOUT_SLOTS.find((slot) => !this.loadout[slot])
                || GUN_LOADOUT_SLOTS.reduce((lowestValueSlot, slot) => {
                    const currentValue = getItemDefinition(this.loadout?.[slot])?.sellValue || 0;
                    const lowestValue = getItemDefinition(this.loadout?.[lowestValueSlot])?.sellValue || 0;
                    return currentValue < lowestValue ? slot : lowestValueSlot;
                }, GUN_LOADOUT_SLOTS[0]))
            : item.category;
        if (!LOADOUT_SLOTS.includes(targetSlot)) return { ok: false, message: 'This item cannot be equipped.' };

        const currentDefinitionId = this.loadout[targetSlot];
        const nextLoadout = { ...this.loadout, [targetSlot]: item.definitionId };
        const nextCapacity = this._calculateCarryCapacity(nextLoadout);
        const resultingSpace = this.getCarriedSpaceUsed() - this._getItemSpace(item) + (currentDefinitionId ? this._getItemSpace(currentDefinitionId) : 0);
        if (resultingSpace > nextCapacity) {
            return { ok: false, message: 'Not enough backpack space for the swap.' };
        }

        this.inventoryItems.splice(index, 1);
        if (currentDefinitionId && GUN_LOADOUT_SLOTS.includes(targetSlot)) {
            this._returnLoadedAmmoToBackpack(targetSlot);
            this._clearGunRuntimeState(targetSlot);
        }
        if (item.category === 'gun') {
            // Store current gun's state before switching away
            this._storeActiveGunState();
        }
        if (currentDefinitionId) {
            this.inventoryItems.push(createLootItem(currentDefinitionId));
        }
        this.loadout[targetSlot] = item.definitionId;
        if (item.category === 'gun') {
            this.weaponSlot = targetSlot;
            this.activeCombatSlot = targetSlot;
        }
        this._applyLoadoutStats(false, { skipStore: true });
        this._recalculateLootValue();
        return { ok: true, message: `${item.name} equipped.` };
    }

    dropBackpackItem(itemId) {
        const index = this.inventoryItems.findIndex((item) => item.id === itemId);
        if (index === -1) return { ok: false, message: 'Item not found in backpack.' };
        const [item] = this.inventoryItems.splice(index, 1);
        this._addRunLoss(item.sellValue || 0, 'abandoned');
        this._recalculateLootValue();
        return { ok: true, message: `${item.name} abandoned.`, droppedItem: item };
    }

    moveBackpackItemToSafebox(itemId) {
        const index = this.inventoryItems.findIndex((item) => item.id === itemId);
        if (index === -1) return { ok: false, message: 'Item not found in backpack.' };
        const item = this.inventoryItems[index];
        if (this.getSafeboxSpaceUsed() + this._getItemSpace(item) > SAFEBOX_CAPACITY) {
            return { ok: false, message: 'Safebox is full.' };
        }
        const [removedItem] = this.inventoryItems.splice(index, 1);
        if (isConsumableDefinition(item.definitionId)) {
            this.inventoryItems.splice(index, 0, removedItem);
            return { ok: false, message: 'Consumables cannot be moved into the safebox.' };
        }
        this.safeboxItems.push(removedItem);
        this._recalculateLootValue();
        return { ok: true, message: `${removedItem.name} moved to safebox.` };
    }

    moveSafeboxItemToBackpack(itemId) {
        const index = this.safeboxItems.findIndex((item) => item.id === itemId);
        if (index === -1) return { ok: false, message: 'Item not found in safebox.' };
        const item = this.safeboxItems[index];
        if (this.getCarriedSpaceUsed() + this._getItemSpace(item) > this.carryCapacity) {
            return { ok: false, message: 'Backpack full.' };
        }
        this.safeboxItems.splice(index, 1);
        this.inventoryItems.push(item);
        if (isAmmoDefinition(item.definitionId) && (this.currentAmmo <= 0 || this._getAmmoPriority(item.definitionId) < this._getAmmoPriority(this._getCurrentAmmoDefinitionId()))) {
            this.reloadBestAvailableAmmo(false);
        }
        this._recalculateLootValue();
        return { ok: true, message: `${item.name} moved to backpack.` };
    }

    unequipLoadoutItem(slot) {
        const currentDefinitionId = this.loadout[slot];
        if (!currentDefinitionId) {
            return { ok: false, message: 'Nothing to unequip here.' };
        }

        const nextLoadout = { ...this.loadout, [slot]: null };
        const nextCapacity = this._calculateCarryCapacity(nextLoadout);
        if (this.getCarriedSpaceUsed() + this._getItemSpace(currentDefinitionId) > nextCapacity) {
            return { ok: false, message: 'Backpack is too full to unequip this item.' };
        }

        const currentDefinition = getItemDefinition(currentDefinitionId);
        if (GUN_LOADOUT_SLOTS.includes(slot)) {
            this._returnLoadedAmmoToBackpack(slot);
        }
        this.inventoryItems.push(createLootItem(currentDefinitionId));
        this.loadout[slot] = null;
        this._clearGunRuntimeState(slot);
        this._applyLoadoutStats();
        this._recalculateLootValue();
        return { ok: true, message: `${currentDefinition?.name || 'Item'} moved to backpack.` };
    }

    abandonLoadoutItem(slot) {
        const currentDefinitionId = this.loadout[slot];
        if (!currentDefinitionId) {
            return { ok: false, message: 'Nothing to abandon here.' };
        }
        const currentDefinition = getItemDefinition(currentDefinitionId);
        if (GUN_LOADOUT_SLOTS.includes(slot)) {
            this._returnLoadedAmmoToBackpack(slot);
        }
        this.loadout[slot] = null;
        this._clearGunRuntimeState(slot);
        this._addRunLoss(currentDefinition?.sellValue || 0, 'abandoned');
        this._applyLoadoutStats();
        const droppedItem = createLootItem(currentDefinitionId);
        return { ok: true, message: `${currentDefinition?.name || 'Item'} abandoned.`, droppedItem };
    }

    _updateFloatingDamageTexts(dt) {
        for (let i = this.floatingDamageTexts.length - 1; i >= 0; i -= 1) {
            const entry = this.floatingDamageTexts[i];
            entry.life -= dt;
            entry.yOffset -= entry.riseSpeed * dt;
            entry.xOffset += entry.driftX * dt;
            if (entry.life <= 0) {
                this.floatingDamageTexts.splice(i, 1);
            }
        }
    }

    _spawnFloatingDamageText(amount) {
        const value = Math.max(0, Math.round(Number(amount) || 0));
        if (value <= 0) return;
        this.floatingDamageTexts.push({
            value,
            life: 0.55,
            maxLife: 0.55,
            xOffset: (Math.random() * 10) - 5,
            yOffset: -this.radius * 0.2,
            driftX: (Math.random() * 20) - 10,
            riseSpeed: 28 + Math.random() * 16,
        });
    }

    update(dt, input, wallGrid, bullets) {
        this._updateFloatingDamageTexts(dt);
        if (!this.alive) return;

        if (input.shooting && this.isHealing) {
            this.stopHealing();
        }

        if (!input.shooting) {
            this.requireMouseReleaseForShot = false;
        }

        this._storeActiveGunState();
        this._decrementGunCooldowns(dt);
        this._syncActiveGunStateFromRuntime();

        // Timers
        if (this.isReloading && !this.isHealing) {
            this.reloadTimer = Math.max(0, this.reloadTimer - dt);
            if (this.reloadTimer <= 0) {
                this.isReloading = false;
                this.reloadBestAvailableAmmo(false);
            }
        }
        this.dashCooldown = Math.max(0, this.dashCooldown - dt);
        this.damageFlash = Math.max(0, this.damageFlash - dt);
        this.invincible = Math.max(0, this.invincible - dt);

        // Regen effect
        if (this.regenTimer > 0) {
            this.regenTimer = Math.max(0, this.regenTimer - dt);
            this.heal(this.regenPerSecond * dt);
            if (this.regenTimer <= 0) {
                this.regenPerSecond = 0;
            }
        }

        // Shield regen
        if (this.shieldLayers) {
            for (const shield of this.shieldLayers) {
                if (shield.hp < shield.maxHp) {
                    shield.hp = Math.min(shield.maxHp, shield.hp + shield.regen * dt);
                }
            }
        }

        if (this.isHealing) {
            if (!this.healingDefinitionId || this.hp >= this.maxHp) {
                this.stopHealing();
            } else {
                this.healingProgress += this.healingRate * dt;
                while (this.healingProgress >= 1 && this.hp < this.maxHp) {
                    if (!this._consumeConsumableUnit(this.healingDefinitionId)) {
                        this.stopHealing();
                        break;
                    }
                    this.heal(1);
                    this.healingProgress -= 1;
                }
                if (this.hp >= this.maxHp) {
                    this.stopHealing();
                }
            }
        }

        // Aim angle
        this.angle = angleBetween(this.x, this.y, input.aimWorld.x, input.aimWorld.y);

        const isMoving = input.moveDir.x !== 0 || input.moveDir.y !== 0;
        const energyRatio = this.energy / this.energyMax;

        if (input.modeToggleRequested) {
            if (!this.hasGravityBoots && energyRatio > PLAYER_ENERGY_RETURN_THRESHOLD && !this.forcedSlowMode) {
                this.manualSlowMode = !this.manualSlowMode;
            }
        }

        if (this.hasGravityBoots) {
            // Gravity boots: no energy drain, always normal speed (except healing)
            this.energy = this.energyMax;
            this.forcedSlowMode = false;
            this.manualSlowMode = false;
            this.isSlowMode = false;
        } else {
            if (!this.dashing) {
                if (!this.manualSlowMode && !this.forcedSlowMode && isMoving) {
                    this.energy = Math.max(0, this.energy - PLAYER_ENERGY_DRAIN_PER_SECOND * dt);
                } else {
                    const recoveryRate = isMoving ? PLAYER_ENERGY_RECOVERY_PER_SECOND : PLAYER_ENERGY_IDLE_RECOVERY_PER_SECOND;
                    this.energy = Math.min(this.energyMax, this.energy + recoveryRate * dt);
                }
            }

            if (this.energy <= 0) {
                this.energy = 0;
                this.forcedSlowMode = true;
            }

            const nextEnergyRatio = this.energy / this.energyMax;
            if (this.forcedSlowMode && nextEnergyRatio >= PLAYER_ENERGY_RETURN_THRESHOLD) {
                this.forcedSlowMode = false;
            }

            this.isSlowMode = this.forcedSlowMode || this.manualSlowMode;
        }

        this.moveSpeed = this.isHealing ? this.healingMoveSpeed : this.baseMoveSpeed * (this.isSlowMode ? PLAYER_SLOW_SPEED_MULTIPLIER : 1);

        // Dash initiation
        if (input.dashRequested && !this.isHealing && !this.dashing && this.dashCooldown <= 0) {
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

        if (input.weaponSwitchRequested) {
            this.switchGun();
        }

        if (!this.isHealing && this.isGunActive() && !input.shooting && !this.isReloading && this.currentAmmo < this.ammoCapacity && (this.getBackpackAmmoCount() > 0 || this._hasFallbackAmmo())) {
            this.startReload();
        }

        if (!this.isHealing && this.isGunActive() && input.shooting && this.isReloading && this.currentAmmo > 0) {
            this.isReloading = false;
            this.reloadTimer = 0;
        }

        // Shooting
        if (this.isGunActive() && input.shooting && !this.requireMouseReleaseForShot && this.shootCooldown <= 0 && !this.dashing) {
            if (this.isReloading) {
                this._storeActiveGunState();
                return;
            }
            if (this.currentAmmo <= 0) {
                this.startReload();
                this._storeActiveGunState();
                return;
            }
            this._shoot(input.aimWorld, bullets);
            this.currentAmmo = this.loadedAmmoQueue.length;
            this.shootCooldown = this.shootCooldownDuration;
        }

        this._storeActiveGunState();
    }

    startReload() {
        if (this.isHealing || !this.isGunActive() || this.isReloading || this.currentAmmo >= this.ammoCapacity || this.ammoCapacity <= 0) return false;
        this.isReloading = true;
        this.reloadTimer = this.reloadDuration;
        return true;
    }

    _shoot(aimWorld, bullets) {
        const ammoDefinitionId = this.loadedAmmoQueue.shift() || this._getCurrentAmmoDefinitionId();
        const ammoDefinition = getItemDefinition(ammoDefinitionId);
        const ammoColor = getRarityMeta(ammoDefinition?.rarity || 'white').color;
        const damageMultiplier = ammoDefinition?.damageMultiplier ?? 1;
        const projectileStyle = ammoDefinition?.projectileStyle || 'orb';
        const projectileScale = Math.max(0.5, Number(this.projectileScale) || 1);
        const projectileWidth = Math.max(2, (Number(ammoDefinition?.projectileWidth) || 4) * projectileScale);
        if (ammoDefinitionId !== 'ammo_white') {
            this._addRunLoss(ammoDefinition?.sellValue || 0, 'ammoUsed');
        }
        const angle = angleBetween(this.x, this.y, aimWorld.x, aimWorld.y) + ((Math.random() * 2) - 1) * this.bulletSpread;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        bullets.push({
            id: generateId(),
            x: this.x + cos * (this.radius + 4),
            y: this.y + sin * (this.radius + 4),
            vx: cos * this.bulletSpeed,
            vy: sin * this.bulletSpeed,
            damage: this.shootDamage * damageMultiplier,
            owner: this.bulletOwnerType || 'player',
            ownerId: this.id,
            ownerSquadId: this.squadId,
            ammoDefinitionId,
            color: ammoColor,
            instantKill: Boolean(ammoDefinition?.instantKill),
            radius: projectileStyle === 'ap' ? projectileWidth * 0.5 : 4 * projectileScale,
            wallPenetration: Math.max(0, Math.floor(Number(ammoDefinition?.wallPenetration) || 0)),
            projectileStyle,
            projectileColor: ammoDefinition?.projectileColor || ammoColor,
            projectileWidth,
            projectileLength: Math.max(projectileWidth * 3, Number(ammoDefinition?.projectileLength) || 18),
            trailLength: Math.max(projectileWidth * 8, Number(ammoDefinition?.trailLength) || 32),
            life: (this.bulletRange * 2) / this.bulletSpeed,
            maxLife: (this.bulletRange * 2) / this.bulletSpeed,
            baseRange: this.bulletRange,
            outrangeMulti: this.outrangeMulti
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

    takeDamage(amount, bullet = null) {
        if (this.invincible > 0) return;
        const rawDamage = Math.max(0, Number(amount) || 0);
        let hpDamage = rawDamage;
        if (rawDamage > 0 && this.shieldLayers && this.shieldLayers.length > 0 && bullet && !bullet.instantKill) {
            hpDamage = this._applyShieldDamage(rawDamage, bullet);
        }
        this.hp -= hpDamage;
        this.damageFlash = 0.28;
        this.invincible = 0.2;
        this._spawnFloatingDamageText(rawDamage);
        if (this.onDamageTaken) {
            this.onDamageTaken(this, hpDamage);
        }
        if (this.hp <= 0) {
            this.hp = 0;
            this.alive = false;
        }
    }

    /**
     * Distribute damage across shield layers and return the HP damage that
     * passes through to the operator.
     *   ammo < shield rarity  → shield absorbs all (overflow to operator)
     *   ammo = shield rarity  → shield absorbs 30 %
     *   ammo > shield rarity  → both shield and operator take full damage
     * Higher-rarity shields are consumed first.
     */
    _applyShieldDamage(damage, bullet) {
        const ammoDef = getItemDefinition(bullet.ammoDefinitionId);
        const ammoRi = ammoDef ? rarityIndex(ammoDef.rarity) : 0;
        let remaining = damage;
        for (const shield of this.shieldLayers) {
            if (shield.hp <= 0 || remaining <= 0) continue;
            if (ammoRi < shield.rarityIndex) {
                const absorbed = Math.min(shield.hp, remaining);
                shield.hp -= absorbed;
                remaining -= absorbed;
            } else if (ammoRi === shield.rarityIndex) {
                const shieldPortion = remaining * 0.3;
                const absorbed = Math.min(shield.hp, shieldPortion);
                shield.hp -= absorbed;
                remaining -= absorbed;
            } else {
                shield.hp = Math.max(0, shield.hp - remaining);
            }
        }
        return remaining;
    }

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    getConsumableCount() {
        return this.inventoryItems.reduce((sum, item) => {
            if (!isConsumableDefinition(item.definitionId)) return sum;
            return sum + getStackableAmountForEntry(item);
        }, 0);
    }

    useConsumable() {
        if (this.isHealing) {
            const name = this.healingName;
            this.stopHealing();
            return { action: 'cancelled', name };
        }

        const index = this.inventoryItems.findIndex((item) => isConsumableDefinition(item.definitionId));
        if (index === -1) return false;

        const definitionId = this.inventoryItems[index].definitionId;
        const result = this._startHealing(definitionId);
        if (!result.ok) {
            return result.reason === 'full'
                ? { action: 'full', name: result.name }
                : false;
        }
        // Instant cure (e.g. cure_spell) applies immediately with no tick-based healing
        if (result.reason === 'instant') {
            return { action: 'instant', definitionId, name: result.name };
        }
        return { action: 'started', definitionId, name: result.name };
    }

    addItem(item) {
        if (isConsumableDefinition(item.definitionId)) {
            const quantity = getStackableAmountForEntry(item) || 1;
            const existingFreeSlots = this.inventoryItems
                .filter((entry) => entry.definitionId === item.definitionId && isConsumableDefinition(entry.definitionId))
                .reduce((sum, entry) => sum + Math.max(0, 999 - getStackableAmountForEntry(entry)), 0);
            const extraSlotsNeeded = Math.ceil(Math.max(0, quantity - existingFreeSlots) / 999);
            const extraSpaceNeeded = extraSlotsNeeded * this._getItemSpace(item);
            if (this.getCarriedSpaceUsed() + extraSpaceNeeded > this.carryCapacity) {
                return false;
            }
            this._pushConsumableStacksToBackpack(item.definitionId, quantity);
            this._recalculateLootValue();
            return true;
        }

        // Auto-equip gun to free hand slot if available
        if (getItemDefinition(item.definitionId)?.category === 'gun') {
            const freeSlot = GUN_LOADOUT_SLOTS.find((slot) => !this.loadout[slot]);
            if (freeSlot) {
                const hadGun = this.weapon != null;
                this._storeActiveGunState();
                this.loadout[freeSlot] = item.definitionId;
                if (!hadGun) {
                    // First gun — switch to it
                    this.weaponSlot = freeSlot;
                    this.activeCombatSlot = freeSlot;
                }
                this._applyLoadoutStats(false, { skipStore: true });
                return true;
            }
        }

        if (this.getCarriedSpaceUsed() + this._getItemSpace(item) > this.carryCapacity) {
            return false;
        }
        this.inventoryItems.push(item);
        this.loot += item.sellValue || 0;
        return true;
    }

    getCarriedItemCount() {
        return this.getCarriedSpaceUsed();
    }

    canReturnToNormalMode() {
        return !this.forcedSlowMode && this.energy / this.energyMax > PLAYER_ENERGY_RETURN_THRESHOLD;
    }

    getWeaponHudInfo() {
        if (!this.hasUsableGun()) {
            return {
                text: 'NO GUN EQUIPPED',
                color: '#9e9e9e',
                ammoDefinitionId: null,
                active: false,
            };
        }
        const reserveAmmo = this.getBackpackAmmoCount();
        const ammoDefinitionId = this._getCurrentAmmoDefinitionId();
        const ammoMeta = getRarityMeta(getItemDefinition(ammoDefinitionId)?.rarity || 'white');
        if (this.isReloading) {
            return {
                text: `${this.isGunActive() ? '▶ ' : ''}${this.weapon?.name || 'Gun'} · RELOADING ${this.reloadTimer.toFixed(1)}s · RESERVE ${reserveAmmo > 0 ? reserveAmmo : '∞'} · E SWITCH`,
                color: ammoMeta.color,
                ammoDefinitionId,
                active: this.isGunActive(),
            };
        }
        return {
            text: `${this.isGunActive() ? '▶ ' : ''}${this.weapon?.name || 'Gun'} · AMMO ${this.currentAmmo}/${this.ammoCapacity} · RESERVE ${reserveAmmo > 0 ? reserveAmmo : '∞'} · E SWITCH`,
            color: ammoMeta.color,
            ammoDefinitionId,
            active: this.isGunActive(),
        };
    }

    getHealingHudInfo() {
        if (!this.isHealing) return null;
        const rarityMeta = getRarityMeta(getItemDefinition(this.healingDefinitionId)?.rarity || 'white');
        return {
            text: `HEALING ${this.healingName || 'Consumable'} · ${this.healingRate.toFixed(1)} HP/S · MOVE 10 · Q CANCEL`,
            color: rarityMeta.color,
        };
    }
}
