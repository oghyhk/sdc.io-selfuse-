// ============================================================
// profile.js — File-backed profile store, item catalog, and market
// ============================================================

export const ACTIVE_USER_KEY = 'sdcio_active_user_v1';
export const API_BASE = '/api';

export const RARITY_ORDER = ['red', 'gold', 'purple', 'blue', 'green', 'white'];

export const RARITY_META = {
    red: { label: 'Red', color: '#ff4d4d', multiplier: 3.2 },
    gold: { label: 'Gold', color: '#ffca28', multiplier: 2.5 },
    purple: { label: 'Purple', color: '#b388ff', multiplier: 1.95 },
    blue: { label: 'Blue', color: '#64b5f6', multiplier: 1.5 },
    green: { label: 'Green', color: '#81c784', multiplier: 1.15 },
    white: { label: 'White', color: '#eceff1', multiplier: 1 }
};

export const LOADOUT_SLOTS = ['gun', 'melee', 'armor', 'helmet', 'shoes', 'backpack'];

export const ITEM_DEFS = {
    militia_carbine: { id: 'militia_carbine', category: 'gun', rarity: 'white', name: 'Militia Carbine', description: 'Starter rifle with stable handling.', sellValue: 120, stats: { damage: 16, cooldown: 0.27, bulletSpeed: 500, range: 340 } },
    ranger_smg: { id: 'ranger_smg', category: 'gun', rarity: 'green', name: 'Ranger SMG', description: 'Fast close-range weapon for aggressive runs.', sellValue: 170, stats: { damage: 12, cooldown: 0.13, bulletSpeed: 470, range: 275 } },
    eclipse_dmr: { id: 'eclipse_dmr', category: 'gun', rarity: 'purple', name: 'Eclipse DMR', description: 'Precision rifle for careful crate fights.', sellValue: 320, stats: { damage: 34, cooldown: 0.55, bulletSpeed: 650, range: 540 } },
    aurora_lmg: { id: 'aurora_lmg', category: 'gun', rarity: 'gold', name: 'Aurora LMG', description: 'Heavy automatic rifle with strong sustained fire.', sellValue: 430, stats: { damage: 20, cooldown: 0.18, bulletSpeed: 540, range: 420 } },
    inferno_rail: { id: 'inferno_rail', category: 'gun', rarity: 'red', name: 'Inferno Railgun', description: 'Prototype rifle that hits extremely hard.', sellValue: 620, stats: { damage: 52, cooldown: 0.72, bulletSpeed: 820, range: 700 } },
    field_knife: { id: 'field_knife', category: 'melee', rarity: 'white', name: 'Field Knife', description: 'Basic close-quarters blade.', sellValue: 80, stats: { meleeDamage: 24, meleeCooldown: 0.42 } },
    breach_hatchet: { id: 'breach_hatchet', category: 'melee', rarity: 'green', name: 'Breach Hatchet', description: 'Reliable utility hatchet.', sellValue: 110, stats: { meleeDamage: 30, meleeCooldown: 0.4 } },
    ion_blade: { id: 'ion_blade', category: 'melee', rarity: 'blue', name: 'Ion Blade', description: 'Light blade with quick recovery.', sellValue: 180, stats: { meleeDamage: 34, meleeCooldown: 0.34 } },
    revenant_machete: { id: 'revenant_machete', category: 'melee', rarity: 'purple', name: 'Revenant Machete', description: 'Heavy finishing blade.', sellValue: 260, stats: { meleeDamage: 42, meleeCooldown: 0.36 } },
    cloth_vest: { id: 'cloth_vest', category: 'armor', rarity: 'white', name: 'Cloth Vest', description: 'Minimal torso protection.', sellValue: 90, modifiers: { maxHp: 10 } },
    ranger_plate: { id: 'ranger_plate', category: 'armor', rarity: 'blue', name: 'Ranger Plate', description: 'Balanced combat vest.', sellValue: 220, modifiers: { maxHp: 28 } },
    titan_rig: { id: 'titan_rig', category: 'armor', rarity: 'gold', name: 'Titan Rig', description: 'Heavy armor for frontline raids.', sellValue: 390, modifiers: { maxHp: 52 } },
    scout_cap: { id: 'scout_cap', category: 'helmet', rarity: 'white', name: 'Scout Cap', description: 'Light head cover.', sellValue: 70, modifiers: { maxHp: 6 } },
    recon_helmet: { id: 'recon_helmet', category: 'helmet', rarity: 'green', name: 'Recon Helmet', description: 'Standard issue tactical helmet.', sellValue: 140, modifiers: { maxHp: 14 } },
    eclipse_visor: { id: 'eclipse_visor', category: 'helmet', rarity: 'purple', name: 'Eclipse Visor', description: 'Enhanced visor with reinforced shell.', sellValue: 250, modifiers: { maxHp: 24 } },
    trail_shoes: { id: 'trail_shoes', category: 'shoes', rarity: 'white', name: 'Trail Shoes', description: 'Plain footwear for basic mobility.', sellValue: 60, modifiers: { speed: 10 } },
    runner_boots: { id: 'runner_boots', category: 'shoes', rarity: 'green', name: 'Runner Boots', description: 'Reliable movement boost.', sellValue: 120, modifiers: { speed: 20 } },
    phase_greaves: { id: 'phase_greaves', category: 'shoes', rarity: 'blue', name: 'Phase Greaves', description: 'Fast boots for quick disengages.', sellValue: 200, modifiers: { speed: 32 } },
    sling_pack: { id: 'sling_pack', category: 'backpack', rarity: 'white', name: 'Sling Pack', description: 'Small pack with limited carrying space.', sellValue: 75, modifiers: { carrySlots: 3 } },
    scout_pack: { id: 'scout_pack', category: 'backpack', rarity: 'green', name: 'Scout Pack', description: 'Compact backpack for efficient loot runs.', sellValue: 130, modifiers: { carrySlots: 5 } },
    mule_pack: { id: 'mule_pack', category: 'backpack', rarity: 'blue', name: 'Mule Pack', description: 'Larger backpack for bigger hauls.', sellValue: 220, modifiers: { carrySlots: 8 } },
    void_satchel: { id: 'void_satchel', category: 'backpack', rarity: 'red', name: 'Void Satchel', description: 'Prototype pack with huge haul capacity.', sellValue: 480, modifiers: { carrySlots: 12 } }
};

export const STARTER_LOADOUT = { gun: 'militia_carbine', melee: 'field_knife', armor: 'cloth_vest', helmet: 'scout_cap', shoes: 'trail_shoes', backpack: 'sling_pack' };
export const STARTER_STASH = Object.values(STARTER_LOADOUT).map((id) => ({ definitionId: id }));

const LOOT_POOLS = {
    0: ['white', 'white', 'green', 'green', 'blue'],
    1: ['green', 'green', 'blue', 'blue', 'purple', 'gold'],
    2: ['blue', 'purple', 'purple', 'gold', 'gold', 'red']
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
        throw new Error(data.message || 'Request failed.');
    }
    return data;
}

export function getItemDefinition(id) {
    return ITEM_DEFS[id] || null;
}

export function getRarityMeta(rarity) {
    return RARITY_META[rarity] || RARITY_META.white;
}

export function getSlotLabel(slot) {
    return slot.charAt(0).toUpperCase() + slot.slice(1);
}

export function getOwnedCounts(profile) {
    const counts = {};
    for (const entry of profile.stashItems || []) {
        counts[entry.definitionId] = (counts[entry.definitionId] || 0) + 1;
    }
    return counts;
}

export function getOwnedItemsByCategory(profile, category) {
    const counts = getOwnedCounts(profile);
    return Object.entries(counts)
        .map(([definitionId, count]) => ({ definition: ITEM_DEFS[definitionId], count }))
        .filter(({ definition }) => definition?.category === category)
        .sort((a, b) => RARITY_ORDER.indexOf(a.definition.rarity) - RARITY_ORDER.indexOf(b.definition.rarity));
}

function defaultLoadout() {
    return { ...STARTER_LOADOUT };
}

function defaultStash() {
    return clone(STARTER_STASH);
}

export function createDefaultProfile(username = 'Guest Operative', isGuest = false) {
    return {
        username,
        isGuest,
        password: '',
        coins: 0,
        loadout: defaultLoadout(),
        stashItems: defaultStash(),
        extractedRuns: [],
        stats: { totalRuns: 0, totalExtractions: 0, totalKills: 0, totalCoinsEarned: 0, totalMarketTrades: 0 }
    };
}

function normalizeLoadout(loadout, stashItems) {
    const counts = {};
    for (const item of stashItems) counts[item.definitionId] = (counts[item.definitionId] || 0) + 1;

    const next = {};
    for (const slot of LOADOUT_SLOTS) {
        const candidate = loadout?.[slot];
        const fallback = STARTER_LOADOUT[slot];
        next[slot] = ITEM_DEFS[candidate]?.category === slot && counts[candidate] > 0 ? candidate : fallback;
        if (!counts[next[slot]]) {
            stashItems.push({ definitionId: next[slot] });
            counts[next[slot]] = 1;
        }
    }
    return next;
}

export function normalizeProfile(profile, fallbackName = 'Guest Operative', isGuest = false) {
    const base = createDefaultProfile(fallbackName, isGuest);
    const stashItems = Array.isArray(profile?.stashItems) && profile.stashItems.length
        ? profile.stashItems.filter((entry) => ITEM_DEFS[entry.definitionId])
        : defaultStash();

    return {
        ...base,
        ...profile,
        isGuest,
        stashItems,
        loadout: normalizeLoadout(profile?.loadout, stashItems),
        extractedRuns: Array.isArray(profile?.extractedRuns) ? profile.extractedRuns : [],
        stats: { ...base.stats, ...(profile?.stats || {}) }
    };
}

export function summarizeProfile(profile) {
    const lastRun = profile.extractedRuns[0] || null;
    return {
        coins: profile.coins,
        extractedRuns: profile.extractedRuns.length,
        lastExtractItemCount: lastRun?.items?.length || 0,
        loadoutNames: LOADOUT_SLOTS.map((slot) => ITEM_DEFS[profile.loadout[slot]]?.name || 'Empty')
    };
}

export function getStashSummary(profile) {
    const summary = { items: 0 };
    for (const rarity of RARITY_ORDER) summary[rarity] = 0;
    for (const item of profile.stashItems || []) {
        const definition = ITEM_DEFS[item.definitionId];
        if (!definition) continue;
        summary.items += 1;
        summary[definition.rarity] += 1;
    }
    return summary;
}

export function createLootItem(definitionId) {
    const definition = ITEM_DEFS[definitionId];
    if (!definition) return null;
    return {
        id: `${definitionId}-${Math.floor(Math.random() * 1000000000)}`,
        definitionId,
        name: definition.name,
        category: definition.category,
        rarity: definition.rarity,
        sellValue: definition.sellValue,
        description: definition.description,
        stats: clone(definition.stats || {}),
        modifiers: clone(definition.modifiers || {})
    };
}

export function createLootItemsForZone(zone, count) {
    const pool = LOOT_POOLS[zone] || LOOT_POOLS[0];
    const itemIds = Object.keys(ITEM_DEFS);
    const items = [];
    for (let i = 0; i < count; i++) {
        const rarity = pool[Math.floor(Math.random() * pool.length)];
        const candidates = itemIds.filter((id) => ITEM_DEFS[id].rarity === rarity);
        const picked = candidates[Math.floor(Math.random() * candidates.length)] || itemIds[0];
        items.push(createLootItem(picked));
    }
    return items.filter(Boolean);
}

export class ProfileStore {
    constructor() {
        this.activeUsername = localStorage.getItem(ACTIVE_USER_KEY) || null;
        this.currentProfile = normalizeProfile(createDefaultProfile(), 'Guest Operative', true);
    }

    async init() {
        if (!this.activeUsername) {
            this.currentProfile = normalizeProfile(createDefaultProfile(), 'Guest Operative', true);
            return this.getCurrentProfile();
        }
        try {
            const result = await apiFetch(`/profile?username=${encodeURIComponent(this.activeUsername)}`);
            this.currentProfile = normalizeProfile(result.profile, this.activeUsername, false);
        } catch {
            this.activeUsername = null;
            localStorage.removeItem(ACTIVE_USER_KEY);
            this.currentProfile = normalizeProfile(createDefaultProfile(), 'Guest Operative', true);
        }
        return this.getCurrentProfile();
    }

    getCurrentProfile() {
        return clone(this.currentProfile);
    }

    isAuthenticated() {
        return Boolean(this.activeUsername);
    }

    async login(username, password) {
        const result = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        this.activeUsername = username;
        localStorage.setItem(ACTIVE_USER_KEY, username);
        this.currentProfile = normalizeProfile(result.profile, username, false);
        return { ok: true, profile: this.getCurrentProfile() };
    }

    async signUp(username, password) {
        const result = await apiFetch('/signup', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        this.activeUsername = username;
        localStorage.setItem(ACTIVE_USER_KEY, username);
        this.currentProfile = normalizeProfile(result.profile, username, false);
        return { ok: true, profile: this.getCurrentProfile() };
    }

    async logout() {
        this.activeUsername = null;
        localStorage.removeItem(ACTIVE_USER_KEY);
        this.currentProfile = normalizeProfile(createDefaultProfile(), 'Guest Operative', true);
        return this.getCurrentProfile();
    }

    async saveCurrentProfile() {
        if (!this.activeUsername) return this.getCurrentProfile();
        const result = await apiFetch('/save-profile', {
            method: 'POST',
            body: JSON.stringify({ username: this.activeUsername, profile: this.currentProfile })
        });
        this.currentProfile = normalizeProfile(result.profile, this.activeUsername, false);
        return this.getCurrentProfile();
    }

    async updateLoadout(slot, definitionId) {
        const definition = ITEM_DEFS[definitionId];
        if (!definition || definition.category !== slot) return this.getCurrentProfile();
        const owned = (this.currentProfile.stashItems || []).some((item) => item.definitionId === definitionId);
        if (!owned) return this.getCurrentProfile();
        this.currentProfile.loadout[slot] = definitionId;
        return this.saveCurrentProfile();
    }

    async recordExtraction(summary) {
        const runSummary = {
            id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            createdAt: new Date().toISOString(),
            ...clone(summary)
        };
        for (const item of runSummary.items || []) {
            if (ITEM_DEFS[item.definitionId]) {
                this.currentProfile.stashItems.push({ definitionId: item.definitionId });
            }
        }
        this.currentProfile.extractedRuns.unshift(runSummary);
        this.currentProfile.extractedRuns = this.currentProfile.extractedRuns.slice(0, 20);
        this.currentProfile.stats.totalRuns += 1;
        this.currentProfile.stats.totalExtractions += 1;
        this.currentProfile.stats.totalKills += runSummary.kills || 0;
        return this.saveCurrentProfile();
    }

    async buyItem(definitionId) {
        const definition = ITEM_DEFS[definitionId];
        if (!definition) throw new Error('Item not found.');
        if (this.currentProfile.coins < definition.sellValue) throw new Error('Not enough coins.');
        this.currentProfile.coins -= definition.sellValue;
        this.currentProfile.stashItems.push({ definitionId });
        this.currentProfile.stats.totalMarketTrades += 1;
        return this.saveCurrentProfile();
    }

    async sellItem(definitionId) {
        const definition = ITEM_DEFS[definitionId];
        if (!definition) throw new Error('Item not found.');
        const stash = this.currentProfile.stashItems || [];
        const ownedCount = stash.filter((item) => item.definitionId === definitionId).length;
        const equipped = Object.values(this.currentProfile.loadout).includes(definitionId);
        if (ownedCount <= 0) throw new Error('You do not own this item.');
        if (equipped && ownedCount === 1) throw new Error('Equip another item first.');
        const index = stash.findIndex((item) => item.definitionId === definitionId);
        if (index === -1) throw new Error('You do not own this item.');
        stash.splice(index, 1);
        this.currentProfile.coins += definition.sellValue;
        this.currentProfile.stats.totalCoinsEarned += definition.sellValue;
        this.currentProfile.stats.totalMarketTrades += 1;
        return this.saveCurrentProfile();
    }
}
