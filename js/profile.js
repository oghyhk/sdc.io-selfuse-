// ============================================================
// profile.js — File-backed profile store, item catalog, and market
// ============================================================

export const ACTIVE_USER_KEY = 'sdcio_active_user_v1';
export const API_BASE = '/api';
export const SAFEBOX_CAPACITY = 4;
export const MIN_TRADE_TOTAL = 10;
export const AMMO_PACK_LIMIT = 999;
export const MAX_PLAYER_LEVEL = 9999;
export const BASE_PLAYER_LEVEL_UP_EXP = 10;
let resolvedApiBase = null;
export let runtimeAchievements = {};

export const RARITY_ORDER = ['legend', 'red', 'gold', 'purple', 'blue', 'green', 'white', 'gray'];

export const RARITY_META = {
    legend: { label: 'Legend', color: '#ff9f1a', multiplier: 4.5 },
    red: { label: 'Red', color: '#ff4d4d', multiplier: 3.2 },
    gold: { label: 'Gold', color: '#ffca28', multiplier: 2.5 },
    purple: { label: 'Purple', color: '#b388ff', multiplier: 1.95 },
    blue: { label: 'Blue', color: '#64b5f6', multiplier: 1.45 },
    green: { label: 'Green', color: '#81c784', multiplier: 1.15 },
    white: { label: 'White', color: '#eceff1', multiplier: 1 },
    gray: { label: 'Gray', color: '#9e9e9e', multiplier: 1 }
};

/** Return a numeric index where higher = rarer. gray=0 … legend=7. */
export function rarityIndex(rarity) {
    const idx = RARITY_ORDER.indexOf(rarity);
    return idx === -1 ? 0 : RARITY_ORDER.length - 1 - idx;
}

export const CRATE_RARITY_ORDER = ['white', 'green', 'blue', 'purple', 'gold', 'red', 'legend'];

export const RAID_DIFFICULTIES = {
    easy: { id: 'easy', label: 'Easy' },
    advanced: { id: 'advanced', label: 'Advanced' },
    hell: { id: 'hell', label: 'Hell' },
    chaos: { id: 'chaos', label: 'Chaos' }
};

export const GUN_LOADOUT_SLOTS = ['gunPrimary', 'gunSecondary'];
export const LOADOUT_SLOTS = ['gunPrimary', 'gunSecondary', 'armor', 'helmet', 'shoes', 'backpack'];
export const AMMO_DEFINITION_IDS = ['ammo_338_ap', 'ammo_red', 'ammo_gold', 'ammo_purple', 'ammo_blue', 'ammo_green', 'ammo_white'];
const SUPPORTED_ITEM_CATEGORIES = new Set(['gun', 'armor', 'helmet', 'shoes', 'backpack', 'loot', 'consumable']);

function isSupportedItemDefinition(definition) {
    return Boolean(definition && SUPPORTED_ITEM_CATEGORIES.has(definition.category));
}

function syncDynamicDefinitionCaches() {
    const dynamicAmmoIds = Object.values(ITEM_DEFS)
        .filter((definition) => isSupportedItemDefinition(definition) && (definition?.lootType === 'ammo' || definition?.ammoAmount))
        .sort((a, b) => {
            const rarityOrder = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
            if (rarityOrder !== 0) return rarityOrder;
            return String(a.id || '').localeCompare(String(b.id || ''));
        })
        .map((definition) => definition.id)
        .filter(Boolean);

    AMMO_DEFINITION_IDS.splice(0, AMMO_DEFINITION_IDS.length, ...dynamicAmmoIds);
}

const LEGACY_AMMO_AMOUNTS = {
    ammo_white: 1,
    ammo_green: 2,
    ammo_blue: 5,
    ammo_purple: 10,
    ammo_gold: 100,
    ammo_red: 25000,
};

export const ITEM_DEFS = {
    // ─── GUNS ───────────────────────────────────────────────
    g17: {
        id: 'g17', category: 'gun', rarity: 'white',
        name: 'G17', description: 'Sidearm with a steady rhythm, 17-round magazine, and light recoil drift.',
        sellValue: 120,
        size: 1,
        image: '/assets/items/g17.png',
        stats: { damage: 14, cooldown: 0.27, bulletSpeed: 500, range: 340, clipSize: 17, reloadTime: 1, spread: 0.075, outrangeMulti: 0.5 }
    },
    as_val: {
        id: 'as_val', category: 'gun', rarity: 'red',
        name: 'AS VAL', description: 'Suppressed rifle with 900 RPM fire rate, 45-round magazine, and wider spray.',
        sellValue: 240,
        size: 12,
        image: '/assets/items/asval.png',
        stats: { damage: 10, cooldown: 60 / 900, bulletSpeed: 540, range: 436, clipSize: 45, reloadTime: 2, spread: 0.11, outrangeMulti: 0.5 }
    },
    awm: {
        id: 'awm', category: 'gun', rarity: 'red',
        name: 'AWM', description: 'Heavy bolt-action magnum rifle with extreme range, high muzzle velocity, and a 5-round magazine.',
        sellValue: 3500000,
        size: 14,
        image: '/assets/items/awm.png',
        projectileScale: 1.5,
        stats: { damage: 95, cooldown: 1.45, bulletSpeed: 960, range: 920, clipSize: 5, reloadTime: 3.4, spread: 0.012, outrangeMulti: 0.5 }
    },

    // ─── LOOT / AMMO ───────────────────────────────────────
    ammo_white: {
        id: 'ammo_white', category: 'loot', lootType: 'ammo', rarity: 'gray',
        name: 'Gray Ammo', description: 'Low-grade gray ammo. Damage x0.8.',
        sellValue: 1,
        ammoAmount: 1,
        damageMultiplier: 0.8,
    },
    ammo_green: {
        id: 'ammo_green', category: 'loot', lootType: 'ammo', rarity: 'green',
        name: 'Green Ammo', description: 'Standard green ammo. Damage x1.0.',
        sellValue: 8,
        ammoAmount: 1,
        damageMultiplier: 1,
    },
    ammo_blue: {
        id: 'ammo_blue', category: 'loot', lootType: 'ammo', rarity: 'blue',
        name: 'Blue Ammo', description: 'Improved blue ammo. Damage x1.05.',
        sellValue: 250,
        ammoAmount: 1,
        damageMultiplier: 1.05,
    },
    ammo_purple: {
        id: 'ammo_purple', category: 'loot', lootType: 'ammo', rarity: 'purple',
        name: 'Purple Ammo', description: 'High-end purple ammo. Damage x1.2.',
        sellValue: 5000,
        ammoAmount: 1,
        damageMultiplier: 1.2,
    },
    ammo_gold: {
        id: 'ammo_gold', category: 'loot', lootType: 'ammo', rarity: 'gold',
        name: 'Gold Ammo', description: 'Elite gold ammo. Damage x1.4.',
        sellValue: 25000,
        ammoAmount: 1,
        damageMultiplier: 1.4,
        image: '/assets/goldammo.png',
    },
    ammo_338_ap: {
        id: 'ammo_338_ap', category: 'loot', lootType: 'ammo', rarity: 'legend',
        name: '.338 AP', description: 'Armor-piercing red ammo that vaporizes targets and punches through a single wall tile.',
        sellValue: 5000000,
        ammoAmount: 1,
        damageMultiplier: 999,
        instantKill: true,
        wallPenetration: 1,
        projectileStyle: 'ap',
        projectileColor: '#050505',
        projectileWidth: 4,
        projectileLength: 26,
        trailLength: 58,
        image: '/assets/items/ap.png',
    },
    ammo_red: {
        id: 'ammo_red', category: 'loot', lootType: 'ammo', rarity: 'red',
        name: 'Red Ammo', description: 'Experimental red ammo. Instantly kills any target.',
        sellValue: 1000000,
        ammoAmount: 1,
        damageMultiplier: 999999,
        instantKill: true,
    },

    // ─── GOODS ──────────────────────────────────────────────
    bent_watch: {
        id: 'bent_watch', category: 'loot', lootType: 'goods', rarity: 'white',
        name: 'Bent Watch', description: 'Damaged wristwatch scavenged from the ruins. Pure sellable goods.',
        sellValue: 60,
        size: 1,
        image: '/assets/items/coin.png',
    },
    signal_chip: {
        id: 'signal_chip', category: 'loot', lootType: 'goods', rarity: 'green',
        name: 'Signal Chip', description: 'Recovered communications chip with resale value but no direct use yet.',
        sellValue: 180,
        size: 1,
        image: '/assets/items/coin.png',
    },
    antique_coin: {
        id: 'antique_coin', category: 'loot', lootType: 'goods', rarity: 'blue',
        name: 'Antique Coin', description: 'Collector-grade old world coin. Valuable trade goods.',
        sellValue: 900,
        size: 1,
        image: '/assets/items/coin.png',
    },
    jade_idol: {
        id: 'jade_idol', category: 'loot', lootType: 'goods', rarity: 'purple',
        name: 'Jade Idol', description: 'A fragile ceremonial carving that currently serves only as loot to sell.',
        sellValue: 7000,
        size: 1,
        image: '/assets/items/coin.png',
    },
    vault_keycard: {
        id: 'vault_keycard', category: 'loot', lootType: 'goods', rarity: 'gold',
        name: 'Vault Keycard', description: 'Rare secured access card. For now it is simply high-value goods.',
        sellValue: 45000,
        size: 1,
        image: '/assets/items/coin.png',
    },
    quantum_core: {
        id: 'quantum_core', category: 'loot', lootType: 'goods', rarity: 'red',
        name: 'Quantum Core', description: 'Extremely valuable lab salvage with no implemented use beyond selling.',
        sellValue: 500000,
        size: 1,
        image: '/assets/items/coin.png',
    },

    // ─── ARMOR ──────────────────────────────────────────────
    cloth_vest: {
        id: 'cloth_vest', category: 'armor', rarity: 'white',
        name: 'Cloth Vest', description: 'Minimal torso protection.',
        sellValue: 100,
        size: 9,
        modifiers: { maxHp: 10, speed: 0 }
    },
    kevlar_weave: {
        id: 'kevlar_weave', category: 'armor', rarity: 'green',
        name: 'Kevlar Weave', description: 'Standard-issue ballistic protection.',
        sellValue: 500,
        size: 9,
        modifiers: { maxHp: 18, speed: 0 }
    },
    ranger_plate: {
        id: 'ranger_plate', category: 'armor', rarity: 'blue',
        name: 'Ranger Plate', description: 'Balanced combat vest.',
        sellValue: 8000,
        size: 9,
        modifiers: { maxHp: 28, speed: 0 }
    },
    warden_vest: {
        id: 'warden_vest', category: 'armor', rarity: 'purple',
        name: 'Warden Vest', description: 'Heavy-duty protection for high-threat zones.',
        sellValue: 50000,
        size: 12,
        modifiers: { maxHp: 40, speed: 0, shieldHp: 20, shieldRegen: 3 }
    },
    titan_rig: {
        id: 'titan_rig', category: 'armor', rarity: 'gold',
        name: 'Titan Rig', description: 'Heavy armor for frontline raids.',
        sellValue: 300000,
        size: 16,
        modifiers: { maxHp: 52, speed: 0, shieldHp: 35, shieldRegen: 4 }
    },
    bastion_plate: {
        id: 'bastion_plate', category: 'armor', rarity: 'red',
        name: 'Bastion Plate', description: 'Experimental exo-armor with maximum protection.',
        sellValue: 8000000,
        size: 24,
        modifiers: { maxHp: 72, speed: 0, shieldHp: 50, shieldRegen: 6 }
    },

    // ─── HELMETS ────────────────────────────────────────────
    scout_cap: {
        id: 'scout_cap', category: 'helmet', rarity: 'white',
        name: 'Scout Cap', description: 'Light head cover.',
        sellValue: 100,
        size: 4,
        modifiers: { maxHp: 6, speed: 0 }
    },
    recon_helmet: {
        id: 'recon_helmet', category: 'helmet', rarity: 'green',
        name: 'Recon Helmet', description: 'Standard issue tactical helmet.',
        sellValue: 500,
        size: 4,
        modifiers: { maxHp: 14, speed: 0 }
    },
    sentinel_helm: {
        id: 'sentinel_helm', category: 'helmet', rarity: 'blue',
        name: 'Sentinel Helm', description: 'Reinforced helmet with side protection.',
        sellValue: 8000,
        size: 4,
        modifiers: { maxHp: 20, speed: 0 }
    },
    eclipse_visor: {
        id: 'eclipse_visor', category: 'helmet', rarity: 'purple',
        name: 'Eclipse Visor', description: 'Enhanced visor with reinforced shell.',
        sellValue: 50000,
        size: 4,
        modifiers: { maxHp: 24, speed: 0, shieldHp: 12, shieldRegen: 2 }
    },
    fortress_mask: {
        id: 'fortress_mask', category: 'helmet', rarity: 'gold',
        name: 'Fortress Mask', description: 'Full-face tactical helmet with blast shielding.',
        sellValue: 300000,
        size: 4,
        modifiers: { maxHp: 36, speed: 0, shieldHp: 25, shieldRegen: 3 }
    },
    phantom_crown: {
        id: 'phantom_crown', category: 'helmet', rarity: 'red',
        name: 'Phantom Crown', description: 'Prototype adaptive helmet with integrated HUD.',
        sellValue: 8000000,
        size: 4,
        modifiers: { maxHp: 48, speed: 0, shieldHp: 35, shieldRegen: 4 }
    },

    // ─── SHOES ──────────────────────────────────────────────
    trail_shoes: {
        id: 'trail_shoes', category: 'shoes', rarity: 'white',
        name: 'Trail Shoes', description: 'Plain footwear for basic mobility.',
        sellValue: 100,
        size: 4,
        modifiers: { maxHp: 0, speed: 10 }
    },
    runner_boots: {
        id: 'runner_boots', category: 'shoes', rarity: 'green',
        name: 'Runner Boots', description: 'Reliable movement boost.',
        sellValue: 500,
        size: 4,
        modifiers: { maxHp: 0, speed: 20 }
    },
    phase_greaves: {
        id: 'phase_greaves', category: 'shoes', rarity: 'blue',
        name: 'Phase Greaves', description: 'Fast boots for quick disengages.',
        sellValue: 8000,
        size: 4,
        modifiers: { maxHp: 0, speed: 32 }
    },
    phantom_sprinters: {
        id: 'phantom_sprinters', category: 'shoes', rarity: 'purple',
        name: 'Phantom Sprinters', description: 'Ultra-light boots for rapid extraction.',
        sellValue: 50000,
        size: 4,
        modifiers: { maxHp: 0, speed: 44 }
    },
    blitz_treads: {
        id: 'blitz_treads', category: 'shoes', rarity: 'gold',
        name: 'Blitz Treads', description: 'High-performance boots with shock absorption.',
        sellValue: 300000,
        size: 4,
        modifiers: { maxHp: 0, speed: 56 }
    },
    warp_drivers: {
        id: 'warp_drivers', category: 'shoes', rarity: 'red',
        name: 'Warp Drivers', description: 'Experimental exo-boots that defy physics.',
        sellValue: 8000000,
        size: 4,
        modifiers: { maxHp: 0, speed: 70 }
    },

    // ─── BACKPACKS ──────────────────────────────────────────
    sling_pack: {
        id: 'sling_pack', category: 'backpack', rarity: 'white',
        name: 'Sling Pack', description: 'Small pack for short raids.',
        sellValue: 100,
        size: 4,
        modifiers: { carrySlots: 5 }
    },
    scout_pack: {
        id: 'scout_pack', category: 'backpack', rarity: 'green',
        name: 'Scout Pack', description: 'Light tactical backpack.',
        sellValue: 500,
        size: 4,
        modifiers: { carrySlots: 8 }
    },
    mule_pack: {
        id: 'mule_pack', category: 'backpack', rarity: 'blue',
        name: 'Mule Pack', description: 'Balanced field pack with extra room.',
        sellValue: 8000,
        size: 4,
        modifiers: { carrySlots: 12 }
    },
    siege_rucksack: {
        id: 'siege_rucksack', category: 'backpack', rarity: 'purple',
        name: 'Siege Rucksack', description: 'Heavy backpack for sustained looting.',
        sellValue: 50000,
        size: 4,
        modifiers: { carrySlots: 16 }
    },
    cargo_titan: {
        id: 'cargo_titan', category: 'backpack', rarity: 'gold',
        name: 'Cargo Titan', description: 'Massive backpack for elite operators.',
        sellValue: 300000,
        size: 9,
        modifiers: { carrySlots: 22 }
    },
    void_satchel: {
        id: 'void_satchel', category: 'backpack', rarity: 'red',
        name: 'Void Satchel', description: 'Prototype dimensional pack with absurd capacity.',
        sellValue: 8000000,
        size: 9,
        modifiers: { carrySlots: 30 }
    },

    // ─── ADDITIONAL ARMOR ──────────────────────────────────
    soft_armor: {
        id: 'soft_armor', category: 'armor', rarity: 'white',
        name: 'Soft Armor', description: 'Concealable ballistic vest. Minimal protection, maximum mobility.',
        sellValue: 100,
        size: 1,
        image: '/assets/dev/soft_armor.jpg',
        modifiers: { maxHp: 12, speed: 0 }
    },
    carrier_rig: {
        id: 'carrier_rig', category: 'armor', rarity: 'green',
        name: 'Carrier Rig', description: 'MOLLE-equipped plate carrier with Level III plates.',
        sellValue: 170,
        size: 1,
        image: '/assets/dev/carrier_rig.jpg',
        modifiers: { maxHp: 22, speed: 0 }
    },
    fort_armor: {
        id: 'fort_armor', category: 'armor', rarity: 'blue',
        name: 'Fort Defender', description: 'Full coverage assault vest with ceramic plates and neck guard.',
        sellValue: 250,
        size: 1,
        image: '/assets/dev/fort_armor.jpg',
        modifiers: { maxHp: 32, speed: 0 }
    },
    slick_armor: {
        id: 'slick_armor', category: 'armor', rarity: 'purple',
        name: 'Slick Plate', description: 'Ultra-thin Level IV plate carrier. High protection, low profile.',
        sellValue: 340,
        size: 1,
        image: '/assets/dev/slick_armor.jpg',
        modifiers: { maxHp: 45, speed: 0, shieldHp: 25, shieldRegen: 3.5 }
    },
    altyn_vest: {
        id: 'altyn_vest', category: 'armor', rarity: 'gold',
        name: 'Altyn Vest', description: 'Heavy assault armor rated for rifle threats. Built like a tank.',
        sellValue: 440000,
        size: 1,
        image: '/assets/dev/altyn_vest.jpg',
        modifiers: { maxHp: 118, speed: 0, shieldHp: 60, shieldRegen: 5 }
    },
    exo_suit: {
        id: 'exo_suit', category: 'armor', rarity: 'red',
        name: 'Exo Combat Suit', description: 'Powered exoskeleton with integrated ballistic protection. The future of warfare.',
        sellValue: 650,
        size: 1,
        image: '/assets/dev/exo_suit.jpg',
        modifiers: { maxHp: 108, speed: 0, shieldHp: 70, shieldRegen: 7 }
    },

    // ─── ADDITIONAL HELMETS ────────────────────────────────
    ssh68: {
        id: 'ssh68', category: 'helmet', rarity: 'white',
        name: 'SSH-68', description: 'Soviet steel helmet. Old but still stops shrapnel.',
        sellValue: 80,
        size: 1,
        image: '/assets/dev/ssh68.jpg',
        modifiers: { maxHp: 8, speed: 0 }
    },
    ops_core: {
        id: 'ops_core', category: 'helmet', rarity: 'green',
        name: 'Ops-Core FAST', description: 'High-cut ballistic helmet with NVG mount. Special ops standard.',
        sellValue: 160,
        size: 1,
        image: '/assets/dev/ops_core.jpg',
        modifiers: { maxHp: 16, speed: 0 }
    },
    altyn_helmet: {
        id: 'altyn_helmet', category: 'helmet', rarity: 'blue',
        name: 'Altyn Helmet', description: 'Heavy titanium helmet with face shield. Spetsnaz heritage.',
        sellValue: 230,
        size: 1,
        image: '/assets/dev/altyn_helmet.jpg',
        modifiers: { maxHp: 22, speed: 0 }
    },
    exfil_helmet: {
        id: 'exfil_helmet', category: 'helmet', rarity: 'purple',
        name: 'EXFIL Ballistic', description: 'Team Wendy EXFIL with SLAAP armor applique. Best in class.',
        sellValue: 280,
        size: 1,
        image: '/assets/dev/exfil_helmet.jpg',
        modifiers: { maxHp: 28, speed: 0, shieldHp: 15, shieldRegen: 2.5 }
    },
    rys_t: {
        id: 'rys_t', category: 'helmet', rarity: 'gold',
        name: 'Rys-T Helmet', description: 'Heavy combat helmet with full face shield. Stops rifle rounds.',
        sellValue: 400,
        size: 1,
        image: '/assets/dev/rys_t.jpg',
        modifiers: { maxHp: 40, speed: 0, shieldHp: 30, shieldRegen: 3.5 }
    },
    cyber_helm: {
        id: 'cyber_helm', category: 'helmet', rarity: 'red',
        name: 'Cyber Operative Helm', description: 'AI-assisted tactical helmet with threat detection HUD and reactive armor.',
        sellValue: 5800000,
        size: 1,
        image: '/assets/dev/cyber_helm.jpg',
        modifiers: { maxHp: 92, speed: 0, shieldHp: 55, shieldRegen: 5 }
    },

    // ─── ADDITIONAL SHOES ──────────────────────────────────
    combat_boots: {
        id: 'combat_boots', category: 'shoes', rarity: 'white',
        name: 'Combat Boots', description: 'Standard-issue leather boots. Sturdy and reliable.',
        sellValue: 70,
        size: 1,
        image: '/assets/dev/combat_boots.jpg',
        modifiers: { maxHp: 0, speed: 12 }
    },
    hiking_boots: {
        id: 'hiking_boots', category: 'shoes', rarity: 'green',
        name: 'Hiking Boots', description: 'Waterproof hiking boots with ankle support. Good all-terrain traction.',
        sellValue: 140,
        size: 1,
        image: '/assets/dev/hiking_boots.jpg',
        modifiers: { maxHp: 0, speed: 22 }
    },
    jump_boots: {
        id: 'jump_boots', category: 'shoes', rarity: 'blue',
        name: 'Jump Boots', description: 'Airborne-rated boots with reinforced sole. Built for drops.',
        sellValue: 220,
        size: 1,
        image: '/assets/dev/jump_boots.jpg',
        modifiers: { maxHp: 0, speed: 35 }
    },
    fast_greaves: {
        id: 'fast_greaves', category: 'shoes', rarity: 'purple',
        name: 'FAST Greaves', description: 'Lightweight carbon fiber leg armor. Speed and protection combined.',
        sellValue: 310,
        size: 1,
        image: '/assets/dev/fast_greaves.jpg',
        modifiers: { maxHp: 0, speed: 48 }
    },
    evas_sprinters: {
        id: 'evas_sprinters', category: 'shoes', rarity: 'gold',
        name: 'EVA Sprinters', description: 'Electric-assist running boots with hydraulic dampening.',
        sellValue: 400,
        size: 1,
        image: '/assets/dev/evas_sprinters.jpg',
        modifiers: { maxHp: 0, speed: 60 }
    },
    gravity_boots: {
        id: 'gravity_boots', category: 'shoes', rarity: 'red',
        name: 'Gravity Boots', description: 'Anti-gravity assist boots. Walk on walls, sprint on air.',
        sellValue: 5600000,
        size: 1,
        image: '/assets/dev/gravity_boots.jpg',
        modifiers: { maxHp: 0, speed: 78 }
    },

    // ─── ADDITIONAL BACKPACKS ──────────────────────────────
    duffel_bag: {
        id: 'duffel_bag', category: 'backpack', rarity: 'white',
        name: 'Duffel Bag', description: 'Canvas military duffel. Gets the job done.',
        sellValue: 85,
        size: 1,
        image: '/assets/dev/duffel_bag.jpg',
        modifiers: { carrySlots: 4 }
    },
    day_pack: {
        id: 'day_pack', category: 'backpack', rarity: 'green',
        name: 'Day Pack', description: 'Compact assault pack with hydration sleeve.',
        sellValue: 150,
        size: 1,
        image: '/assets/dev/day_pack.jpg',
        modifiers: { carrySlots: 6 }
    },
    alice_pack: {
        id: 'alice_pack', category: 'backpack', rarity: 'blue',
        name: 'ALICE Pack', description: 'All-purpose lightweight carrying equipment. Vietnam-proven design.',
        sellValue: 240,
        size: 1,
        image: '/assets/dev/alice_pack.jpg',
        modifiers: { carrySlots: 9 }
    },
    mystery_ranch: {
        id: 'mystery_ranch', category: 'backpack', rarity: 'purple',
        name: 'Mystery Ranch', description: 'Military assault pack with tri-zip access. Industry-leading load distribution.',
        sellValue: 330,
        size: 1,
        image: '/assets/dev/mystery_ranch.jpg',
        modifiers: { carrySlots: 12 }
    },
    parachute_pack: {
        id: 'parachute_pack', category: 'backpack', rarity: 'gold',
        name: 'Parachute Pack', description: 'HALO-rated pack with integrated reserve chute. Carry more, jump further.',
        sellValue: 420,
        size: 1,
        image: '/assets/dev/parachute_pack.jpg',
        modifiers: { carrySlots: 15 }
    },
    quantum_pack: {
        id: 'quantum_pack', category: 'backpack', rarity: 'red',
        name: 'Quantum Satchel', description: 'Dimensional compression pack. Physics-defying storage capacity.',
        sellValue: 5200000,
        size: 9,
        image: '/assets/dev/quantum_pack.jpg',
        modifiers: { carrySlots: 50 }
    },

    // ─── CONSUMABLES ────────────────────────────────────────
    field_bandage: {
        id: 'field_bandage', category: 'consumable', rarity: 'white',
        name: 'Field Bandage', description: 'Basic 20-use gauze wrap. Restores 1 HP per use at 1 HP/sec.',
        sellValue: 30,
        size: 1,
        healAmount: 20
    },
    med_kit: {
        id: 'med_kit', category: 'consumable', rarity: 'green',
        name: 'Med Kit', description: 'Standard 35-use first aid kit. Restores 1 HP per use at 1.5 HP/sec.',
        sellValue: 80,
        size: 1,
        healAmount: 35
    },
    stim_syringe: {
        id: 'stim_syringe', category: 'consumable', rarity: 'blue',
        name: 'Stim Syringe', description: 'Fast-acting 50-use combat stimulant. Restores 1 HP per use at 2 HP/sec.',
        sellValue: 200,
        size: 1,
        healAmount: 50
    },
    combat_medic_pack: {
        id: 'combat_medic_pack', category: 'consumable', rarity: 'purple',
        name: 'Combat Medic Pack', description: 'Advanced 70-use field surgical kit. Restores 1 HP per use at 3 HP/sec.',
        sellValue: 400,
        size: 1,
        healAmount: 70
    },
    regen_injector: {
        id: 'regen_injector', category: 'consumable', rarity: 'gold',
        name: 'Regen Injector', description: '100-use nanobot injector. Restores 1 HP per use at 4 HP/sec.',
        sellValue: 800,
        size: 1,
        healAmount: 100,
        regenPerSecond: 2,
        regenDuration: 15
    },
    nano_serum: {
        id: 'nano_serum', category: 'consumable', rarity: 'red',
        name: 'Nano Serum', description: 'Experimental nano-serum reserve. Restores 1 HP per use at 6 HP/sec.',
        sellValue: 5000,
        size: 1,
        healAmount: -1,  // -1 = full heal
        restoreEnergy: true
    }
};

export const STARTER_LOADOUT = { gunPrimary: 'g17', gunSecondary: null, armor: 'cloth_vest', helmet: 'scout_cap', shoes: 'trail_shoes', backpack: 'sling_pack' };
export const STARTER_STASH = Object.values(STARTER_LOADOUT).filter(Boolean).map((id) => ({ definitionId: id }));
const REQUIRED_LOADOUT_SLOTS = new Set();

// Crate tiers — each crate type draws from a weighted rarity pool
export const CRATE_TIERS = {
    supply: {
        label: 'Supply Crate',
        description: 'Common field supplies — mostly white and green gear.',
        pool: ['white', 'white', 'white', 'green', 'green', 'blue'],
        itemCount: { min: 2, max: 4 },
        color: '#8d6e63'
    },
    tactical: {
        label: 'Tactical Crate',
        description: 'Military-grade equipment — blue to purple quality.',
        pool: ['green', 'blue', 'blue', 'purple', 'purple', 'gold'],
        itemCount: { min: 2, max: 4 },
        color: '#5c6bc0'
    },
    elite: {
        label: 'Elite Crate',
        description: 'High-value cache — purple, gold, and rare red items.',
        pool: ['blue', 'purple', 'gold', 'gold', 'red', 'red'],
        itemCount: { min: 1, max: 3 },
        color: '#c62828'
    }
};

const LOOT_POOLS = {
    0: ['white', 'white', 'green', 'green', 'blue'],
    1: ['green', 'green', 'blue', 'blue', 'purple', 'gold'],
    2: ['blue', 'purple', 'purple', 'gold', 'gold', 'red']
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getApiCandidates() {
    const candidates = [];
    const push = (value) => {
        if (!value || candidates.includes(value)) return;
        candidates.push(value.replace(/\/$/, ''));
    };

    if (resolvedApiBase) push(resolvedApiBase);

    if (typeof window !== 'undefined' && window.location) {
        const queryApi = new URLSearchParams(window.location.search).get('api');
        if (queryApi) push(queryApi);

        if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
            push(window.location.origin + API_BASE);
            if (window.location.port !== '8765') {
                push(`${window.location.protocol}//${window.location.hostname}:8765${API_BASE}`);
            }
        }
    }

    push(`http://127.0.0.1:8765${API_BASE}`);
    push(`http://localhost:8765${API_BASE}`);
    push(API_BASE);
    return candidates;
}

export async function apiFetch(path, options = {}) {
    let lastError = null;
    for (const base of getApiCandidates()) {
        try {
            const response = await fetch(`${base}${path}`, {
                cache: 'no-store',
                headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
                ...options
            });
            const data = await response.json();
            if (!response.ok || data.ok === false) {
                throw new Error(data.message || 'Request failed.');
            }
            resolvedApiBase = base;
            return data;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('Request failed.');
}

function mergeDefinitionOverride(baseDefinition, overrideDefinition) {
    if (!baseDefinition || !overrideDefinition) return;

    const merged = {
        ...baseDefinition,
        ...clone(overrideDefinition),
    };

    if (baseDefinition.stats || overrideDefinition.stats) {
        merged.stats = {
            ...(baseDefinition.stats || {}),
            ...(overrideDefinition.stats || {}),
        };
    }

    if (baseDefinition.modifiers || overrideDefinition.modifiers) {
        merged.modifiers = {
            ...(baseDefinition.modifiers || {}),
            ...(overrideDefinition.modifiers || {}),
        };
    }

    Object.keys(baseDefinition).forEach((key) => delete baseDefinition[key]);
    Object.assign(baseDefinition, merged);
}

export async function loadRuntimeDevConfig() {
    try {
        const result = await apiFetch(`/dev-config?ts=${Date.now()}`);
        const configItems = result?.config?.items || {};
        const configPlayerLevelRewards = result?.config?.player_level_rewards || {};
        const configAchievements = result?.config?.achievements || {};
        for (const [definitionId, overrideDefinition] of Object.entries(configItems)) {
            if (!overrideDefinition || typeof overrideDefinition !== 'object') continue;
            const definitionCategory = overrideDefinition.category || ITEM_DEFS[definitionId]?.category || 'loot';
            if (!SUPPORTED_ITEM_CATEGORIES.has(definitionCategory)) continue;
            if (!ITEM_DEFS[definitionId]) {
                ITEM_DEFS[definitionId] = {
                    id: definitionId,
                    category: definitionCategory,
                    rarity: overrideDefinition.rarity || 'white',
                    name: overrideDefinition.name || definitionId,
                    description: overrideDefinition.description || '',
                    sellValue: Number(overrideDefinition.sellValue) || 0,
                    size: Math.max(1, Number(overrideDefinition.size) || 1),
                    stats: {},
                    modifiers: {},
                };
            }
            mergeDefinitionOverride(ITEM_DEFS[definitionId], overrideDefinition);
            ITEM_DEFS[definitionId].id = definitionId;
        }
        syncPlayerLevelRewardOverrides(configPlayerLevelRewards);
        syncDynamicDefinitionCaches();
        runtimeAchievements = configAchievements;
        return true;
    } catch (error) {
        console.warn('Failed to load runtime dev-config overrides:', error);
        return false;
    }
}

export function getItemDefinition(id) {
    return ITEM_DEFS[id] || null;
}

export function getItemValue(definitionId) {
    return ITEM_DEFS[definitionId]?.sellValue || 0;
}

export function formatCompactValue(value) {
    const numeric = Number(value) || 0;
    const abs = Math.abs(numeric);

    if (abs >= 10_000_000_000) {
        return `${(numeric / 1_000_000_000).toFixed(1)}B`;
    }
    if (abs >= 10_000_000) {
        return `${(numeric / 1_000_000).toFixed(1)}M`;
    }
    if (abs >= 100_000) {
        return `${(numeric / 1_000).toFixed(1)}k`;
    }
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

export function getBuyTradeTotal(definitionId, quantity = 1) {
    const amount = Math.max(1, Math.floor(Number(quantity) || 0));
    const buyTaxPercent = Math.min(1000, Math.max(1, Number(ITEM_DEFS[definitionId]?.buyMarketTaxPercent) || 10));
    return Math.ceil(getItemValue(definitionId) * amount * (1 + (buyTaxPercent / 100)));
}

export function getSellTradeTotal(definitionId, quantity = 1) {
    const amount = Math.max(1, Math.floor(Number(quantity) || 0));
    const sellTaxPercent = Math.min(99, Math.max(1, Number(ITEM_DEFS[definitionId]?.sellMarketTaxPercent) || 10));
    return Math.floor(getItemValue(definitionId) * amount * (1 - (sellTaxPercent / 100)));
}

export function getMinimumTradeQuantity(definitionId, mode = 'buy') {
    const value = getItemValue(definitionId);
    if (value <= 0) return Infinity;
    for (let quantity = 1; quantity <= 100000; quantity++) {
        const total = mode === 'sell'
            ? getSellTradeTotal(definitionId, quantity)
            : getBuyTradeTotal(definitionId, quantity);
        if (total >= MIN_TRADE_TOTAL) return quantity;
    }
    return Infinity;
}

export function isEquipmentCategory(category) {
    return ['gun', 'armor', 'helmet', 'shoes', 'backpack'].includes(category);
}

export function isLootCategory(category) {
    return category === 'loot';
}

export function isGoodsDefinition(definitionId) {
    return ITEM_DEFS[definitionId]?.category === 'loot' && ITEM_DEFS[definitionId]?.lootType === 'goods';
}

export function isAmmoDefinition(definitionId) {
    return definitionId in LEGACY_AMMO_AMOUNTS || ITEM_DEFS[definitionId]?.lootType === 'ammo';
}

export function isConsumableDefinition(definitionId) {
    return ITEM_DEFS[definitionId]?.category === 'consumable';
}

export function isStackableDefinition(definitionId) {
    return isAmmoDefinition(definitionId) || isConsumableDefinition(definitionId);
}

export function getAmmoAmountForDefinition(definitionId) {
    return LEGACY_AMMO_AMOUNTS[definitionId] || ITEM_DEFS[definitionId]?.ammoAmount || 0;
}

export function getAmmoAmountForEntry(entry) {
    if (!entry || !isAmmoDefinition(entry.definitionId)) return 0;
    return Math.max(1, Math.floor(Number(entry.quantity) || getAmmoAmountForDefinition(entry.definitionId) || 1));
}

export function getStackableAmountForEntry(entry) {
    if (!entry || !isStackableDefinition(entry.definitionId)) return 0;
    if (isAmmoDefinition(entry.definitionId)) {
        return getAmmoAmountForEntry(entry);
    }
    return Math.max(1, Math.floor(Number(entry.quantity) || 1));
}

export function getAmmoCountForProfile(profile, definitionId) {
    if (isFreeFallbackAmmo(definitionId)) {
        return 0;
    }
    const stashAmmo = profile?.stashAmmo;
    if (typeof stashAmmo === 'number') {
        return 0;
    }
    if (!stashAmmo || typeof stashAmmo !== 'object') {
        return 0;
    }
    return Math.max(0, Math.floor(Number(stashAmmo[definitionId]) || 0));
}

export function getStashAmmoMap(profile) {
    const ammoMap = {};
    for (const definitionId of AMMO_DEFINITION_IDS) {
        const count = getAmmoCountForProfile(profile, definitionId);
        if (count > 0) {
            ammoMap[definitionId] = count;
        }
    }
    return ammoMap;
}

export function getAmmoAmountForEntries(entries = []) {
    return entries.reduce((sum, entry) => sum + getAmmoAmountForEntry(entry), 0);
}

export function packAmmoAmount(definitionId, amount) {
    let remaining = Math.max(0, Math.floor(amount || 0));
    const packed = [];
    while (remaining > 0) {
        const quantity = Math.min(AMMO_PACK_LIMIT, remaining);
        packed.push({ definitionId, quantity });
        remaining -= quantity;
    }
    return packed;
}

export function packStackableAmount(definitionId, amount) {
    if (!isStackableDefinition(definitionId)) {
        return amount > 0 ? [{ definitionId }] : [];
    }
    let remaining = Math.max(0, Math.floor(amount || 0));
    const packed = [];
    while (remaining > 0) {
        const quantity = Math.min(AMMO_PACK_LIMIT, remaining);
        packed.push({ definitionId, quantity });
        remaining -= quantity;
    }
    return packed;
}

export function getTotalAmmoForProfile(profile) {
    return Object.values(getStashAmmoMap(profile)).reduce((sum, count) => sum + count, 0);
}

export function getRarityMeta(rarity) {
    return RARITY_META[rarity] || RARITY_META.white;
}

export function getCrateTierMeta(rarity) {
    const meta = getRarityMeta(rarity);
    return {
        key: rarity,
        label: `${meta.label} Crate`,
        color: meta.color,
    };
}

export function getLoadoutSlotCategory(slot) {
    return GUN_LOADOUT_SLOTS.includes(slot) ? 'gun' : slot;
}

export function getSlotLabel(slot) {
    const labels = {
        gun: 'Gun',
        gunPrimary: 'Gun 1',
        gunSecondary: 'Gun 2',
        armor: 'Armor',
        helmet: 'Helmet',
        shoes: 'Shoes',
        backpack: 'Backpack',
        consumable: 'Consumable',
        loot: 'Loot',
        goods: 'Goods',
        ammo: 'Ammo',
    };
    return labels[slot] || slot.charAt(0).toUpperCase() + slot.slice(1);
}

export function getItemCategoryLabel(itemOrDefinitionId) {
    const definition = typeof itemOrDefinitionId === 'string'
        ? ITEM_DEFS[itemOrDefinitionId]
        : ITEM_DEFS[itemOrDefinitionId?.definitionId] || itemOrDefinitionId;
    if (!definition) return getSlotLabel('loot');
    if (definition.lootType === 'ammo') return getSlotLabel('ammo');
    if (definition.lootType === 'goods') return getSlotLabel('goods');
    return getSlotLabel(definition.category);
}

export function getOwnedCounts(profile) {
    const counts = {};
    for (const entry of profile.stashItems || []) {
        counts[entry.definitionId] = (counts[entry.definitionId] || 0) + 1;
    }
    const stashAmmoMap = getStashAmmoMap(profile);
    for (const [definitionId, amount] of Object.entries(stashAmmoMap)) {
        counts[definitionId] = (counts[definitionId] || 0) + amount;
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

export function getItemImagePath(definitionId) {
    const definition = ITEM_DEFS[definitionId];
    if (typeof definition?.image === 'string' && definition.image.trim()) {
        return definition.image;
    }
    return `assets/items/${definitionId}.png`;
}

function defaultLoadout() {
    return { ...STARTER_LOADOUT };
}

function defaultStash() {
    return clone(STARTER_STASH);
}

function defaultSavedLoadouts() {
    return Array.from({ length: 5 }, () => null);
}

function getLegacyLoadoutValue(loadout, slot) {
    if (!loadout || typeof loadout !== 'object') return null;
    if (slot === 'gunPrimary') return loadout.gunPrimary || loadout.primaryGun || loadout.gun || null;
    if (slot === 'gunSecondary') return loadout.gunSecondary || loadout.secondaryGun || loadout.gun2 || null;
    return loadout[slot] || null;
}

function isLoadoutSlotMatch(slot, definitionId) {
    return ITEM_DEFS[definitionId]?.category === getLoadoutSlotCategory(slot);
}

const MAX_RAID_HISTORY = 100;
const PLAYER_LEVEL_REQUIREMENTS = [BASE_PLAYER_LEVEL_UP_EXP];
const PLAYER_LEVEL_TOTAL_EXP = [0];
export const PLAYER_LEVEL_REWARD_INTERVAL = 10;
const PLAYER_LEVEL_REWARD_OVERRIDES = {};

function syncPlayerLevelRewardOverrides(configRewards = {}) {
    Object.keys(PLAYER_LEVEL_REWARD_OVERRIDES).forEach((key) => delete PLAYER_LEVEL_REWARD_OVERRIDES[key]);
    if (!configRewards || typeof configRewards !== 'object') return;

    for (const [levelKey, rawReward] of Object.entries(configRewards)) {
        const normalizedLevel = Math.floor(Number(levelKey) || Number(rawReward?.level) || 0);
        if (!isValidPlayerLevelRewardLevel(normalizedLevel, { requireInterval: false })) continue;
        if (rawReward === false) {
            PLAYER_LEVEL_REWARD_OVERRIDES[normalizedLevel] = { level: normalizedLevel, enabled: false };
            continue;
        }
        const rewardConfig = (rawReward && typeof rawReward === 'object') ? rawReward : {};
        PLAYER_LEVEL_REWARD_OVERRIDES[normalizedLevel] = {
            level: normalizedLevel,
            enabled: rewardConfig.enabled !== false,
            type: rewardConfig.type === 'item' ? 'item' : 'coins',
            coins: Math.max(0, Math.floor(Number(rewardConfig.coins) || 0)),
            itemId: typeof rewardConfig.itemId === 'string' ? rewardConfig.itemId.trim() : '',
            quantity: Math.max(1, Math.floor(Number(rewardConfig.quantity) || 1)),
            label: typeof rewardConfig.label === 'string' ? rewardConfig.label.trim() : '',
            description: typeof rewardConfig.description === 'string' ? rewardConfig.description.trim() : '',
        };
    }
}

function isValidPlayerLevelRewardLevel(level, options = {}) {
    const normalizedLevel = Math.floor(Number(level) || 0);
    if (normalizedLevel <= 0 || normalizedLevel > MAX_PLAYER_LEVEL) return false;
    if (options.requireInterval === false) return true;
    return normalizedLevel % PLAYER_LEVEL_REWARD_INTERVAL === 0;
}

function normalizePlayerLevelRewardClaims(claims = []) {
    const uniqueClaims = new Set();
    for (const level of Array.isArray(claims) ? claims : []) {
        if (isValidPlayerLevelRewardLevel(level, { requireInterval: false })) {
            uniqueClaims.add(Math.floor(Number(level) || 0));
        }
    }
    return Array.from(uniqueClaims).sort((a, b) => a - b);
}

function createDefaultPlayerLevelReward(level) {
    const normalizedLevel = Math.floor(Number(level) || 0);
    if (!isValidPlayerLevelRewardLevel(normalizedLevel)) return null;
    const coins = Math.max(1000, normalizedLevel * 250);
    return {
        level: normalizedLevel,
        type: 'coins',
        coins,
        itemId: '',
        quantity: 0,
        label: `Lv. ${normalizedLevel} reward`,
        description: `Receive ${formatCompactValue(coins)} coins for reaching Lv. ${normalizedLevel}.`
    };
}

export function getPlayerLevelReward(level) {
    const normalizedLevel = Math.floor(Number(level) || 0);
    if (!isValidPlayerLevelRewardLevel(normalizedLevel, { requireInterval: false })) return null;
    const override = PLAYER_LEVEL_REWARD_OVERRIDES[normalizedLevel] || null;
    if (override && override.enabled === false) return null;

    const fallbackReward = createDefaultPlayerLevelReward(normalizedLevel);
    if (!fallbackReward && !override) return null;

    const itemId = override?.type === 'item' ? override.itemId : '';
    const hasValidItemReward = Boolean(itemId && ITEM_DEFS[itemId]);
    const rewardType = hasValidItemReward ? 'item' : 'coins';
    const quantity = rewardType === 'item'
        ? Math.max(1, Math.floor(Number(override?.quantity) || 1))
        : 0;

    const coins = override && override.coins > 0
        ? override.coins
        : (fallbackReward?.coins || 0);
    const itemName = rewardType === 'item' ? (ITEM_DEFS[itemId]?.name || itemId) : '';
    const defaultDescription = rewardType === 'item'
        ? `Receive ${itemName} x${quantity} for reaching Lv. ${normalizedLevel}.`
        : `Receive ${formatCompactValue(coins)} coins for reaching Lv. ${normalizedLevel}.`;
    return {
        level: normalizedLevel,
        type: rewardType,
        coins: rewardType === 'coins' ? coins : 0,
        itemId: rewardType === 'item' ? itemId : '',
        itemName,
        quantity,
        label: override?.label || fallbackReward?.label || `Lv. ${normalizedLevel} reward`,
        description: override?.description || (rewardType === 'coins' ? fallbackReward?.description : '') || defaultDescription
    };
}

function getAllPlayerLevelRewardLevels() {
    const levels = new Set();
    for (let level = PLAYER_LEVEL_REWARD_INTERVAL; level <= MAX_PLAYER_LEVEL; level += PLAYER_LEVEL_REWARD_INTERVAL) {
        levels.add(level);
    }
    Object.keys(PLAYER_LEVEL_REWARD_OVERRIDES).forEach((levelKey) => {
        const normalizedLevel = Math.floor(Number(levelKey) || 0);
        if (isValidPlayerLevelRewardLevel(normalizedLevel, { requireInterval: false })) {
            levels.add(normalizedLevel);
        }
    });
    return Array.from(levels).sort((a, b) => a - b);
}

export function getClaimedPlayerLevelRewardLevels(profile) {
    return normalizePlayerLevelRewardClaims(profile?.claimedPlayerLevelRewards);
}

export function getClaimablePlayerLevelRewards(profile) {
    const currentLevel = getPlayerLevelProgress(profile?.playerExp || 0).level;
    const claimed = new Set(getClaimedPlayerLevelRewardLevels(profile));
    const rewards = [];
    for (const level of getAllPlayerLevelRewardLevels()) {
        if (level > currentLevel) break;
        if (claimed.has(level)) continue;
        const reward = getPlayerLevelReward(level);
        if (reward) rewards.push(reward);
    }
    return rewards;
}

export function getNextClaimablePlayerLevelReward(profile) {
    return getClaimablePlayerLevelRewards(profile)[0] || null;
}

export function getNextPlayerLevelReward(profile) {
    const progress = getPlayerLevelProgress(profile?.playerExp || 0);
    const claimed = new Set(getClaimedPlayerLevelRewardLevels(profile));
    for (const level of getAllPlayerLevelRewardLevels()) {
        if (claimed.has(level)) continue;
        const reward = getPlayerLevelReward(level);
        if (reward) {
            return {
                ...reward,
                unlocked: level <= progress.level,
            };
        }
    }
    return null;
}

function ensurePlayerLevelCurve() {
    if (PLAYER_LEVEL_TOTAL_EXP.length > MAX_PLAYER_LEVEL) return;

    let lastRequirement = PLAYER_LEVEL_REQUIREMENTS[0];
    for (let level = PLAYER_LEVEL_TOTAL_EXP.length; level <= MAX_PLAYER_LEVEL; level += 1) {
        const previousLevel = level - 1;
        if (previousLevel > 0) {
            const scaledRequirement = Math.ceil(lastRequirement * 1.03);
            lastRequirement = Math.max(lastRequirement + 1, scaledRequirement);
            PLAYER_LEVEL_REQUIREMENTS[previousLevel] = lastRequirement;
        }

        const previousTotal = PLAYER_LEVEL_TOTAL_EXP[level - 1] || 0;
        const previousRequirement = PLAYER_LEVEL_REQUIREMENTS[level - 1] || 0;
        PLAYER_LEVEL_TOTAL_EXP[level] = previousTotal + previousRequirement;
    }
}

export function getPlayerLevelRequirement(level) {
    ensurePlayerLevelCurve();
    const normalizedLevel = Math.max(0, Math.floor(Number(level) || 0));
    if (normalizedLevel >= MAX_PLAYER_LEVEL) return 0;
    return PLAYER_LEVEL_REQUIREMENTS[normalizedLevel] || 0;
}

export function getMaxPlayerExp() {
    ensurePlayerLevelCurve();
    return PLAYER_LEVEL_TOTAL_EXP[MAX_PLAYER_LEVEL] || 0;
}

function normalizePlayerExp(value) {
    const numeric = Math.max(0, Math.floor(Number(value) || 0));
    return Math.min(getMaxPlayerExp(), numeric);
}

export function getPlayerLevelProgress(totalExp = 0) {
    ensurePlayerLevelCurve();
    const normalizedExp = normalizePlayerExp(totalExp);

    let low = 0;
    let high = MAX_PLAYER_LEVEL;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if ((PLAYER_LEVEL_TOTAL_EXP[mid] || 0) <= normalizedExp) low = mid;
        else high = mid - 1;
    }

    const level = Math.min(MAX_PLAYER_LEVEL, low);
    const isMaxLevel = level >= MAX_PLAYER_LEVEL;
    const levelStartExp = PLAYER_LEVEL_TOTAL_EXP[level] || 0;
    const nextLevelExp = isMaxLevel ? 0 : (PLAYER_LEVEL_REQUIREMENTS[level] || 0);
    const currentLevelExp = isMaxLevel ? 0 : Math.max(0, normalizedExp - levelStartExp);
    const expToNext = isMaxLevel ? 0 : Math.max(0, nextLevelExp - currentLevelExp);

    return {
        level,
        totalExp: normalizedExp,
        currentLevelExp,
        nextLevelExp,
        levelStartExp,
        levelEndExp: isMaxLevel ? levelStartExp : levelStartExp + nextLevelExp,
        expToNext,
        isMaxLevel,
        progressRatio: isMaxLevel || nextLevelExp <= 0 ? 1 : Math.max(0, Math.min(1, currentLevelExp / nextLevelExp)),
    };
}

export function getExpRewardForRunSummary(summary = {}) {
    return Math.max(0, Math.floor(Number(summary?.kills) || 0));
}

const ELO_DIFFICULTY_K = { easy: 0, advanced: 5, hell: 12, chaos: 30 };
export const ELO_KILL_BONUS_MULT = { easy: 0, advanced: 1, hell: 2, chaos: 4 };
const PER_KILL_K = 8;

/**
 * Compute ELO gain for a single kill based on killer vs victim ELO difference.
 * Higher-ELO victims yield more; lower-ELO victims yield less. Minimum 1.
 */
export function computePerKillElo(killerElo = 1000, victimElo = 1000) {
    const expected = 1 / (1 + Math.pow(10, (victimElo - killerElo) / 400));
    return Math.max(1, Math.round(PER_KILL_K * (1 - expected)));
}

/**
 * Compute a death-penalty multiplier based on who killed you.
 * Dying to a lower-ELO opponent → scale > 1 (more loss).
 * Dying to a higher-ELO opponent → scale < 1 (less loss).
 * Returns 1.0 when no killer ELO is available.
 */
export function computeDeathPenaltyScale(myElo = 1000, killerElo = null) {
    if (killerElo == null) return 1.0;
    const expected = 1 / (1 + Math.pow(10, (killerElo - myElo) / 400));
    return Math.max(0.5, Math.min(1.5, 0.5 + expected));
}

export function computeEloChange(difficulty = 'advanced', extracted = false, eloKillBonus = 0, deathPenaltyScale = 1.0) {
    if (difficulty === 'easy') return 0;
    const K = ELO_DIFFICULTY_K[difficulty] || ELO_DIFFICULTY_K.advanced;
    const mult = ELO_KILL_BONUS_MULT[difficulty] || 0;
    const adjustedKillBonus = eloKillBonus * mult;
    if (extracted) return K + adjustedKillBonus;
    return -(K - Math.max(0, adjustedKillBonus));
}

function applyEloChange(profile, change) {
    if (!profile) return;
    profile.elo = Math.max(0, Math.round((profile.elo || 1000) + change));
}

function awardProfileExp(profile, amount = 0) {
    if (!profile) return getPlayerLevelProgress(0);
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    profile.playerExp = normalizePlayerExp((profile.playerExp || 0) + gain);
    return getPlayerLevelProgress(profile.playerExp);
}

export function createDefaultProfile(username = 'Guest Operative', isGuest = false) {
    return {
        username,
        isGuest,
        password: '',
        coins: 0,
        playerExp: 0,
        elo: 1000,
        claimedPlayerLevelRewards: [],
        loadout: defaultLoadout(),
        stashItems: defaultStash(),
        stashAmmo: {},
        backpackItems: [],
        safeboxItems: [],
        savedLoadouts: defaultSavedLoadouts(),
        extractedRuns: [],
        raidHistory: [],
        stats: { totalRuns: 0, totalExtractions: 0, totalKills: 0, totalCoinsEarned: 0, totalMarketTrades: 0 },
        pinnedAchievements: []
    };
}

function normalizePersistentEntry(entry) {
    if (!entry) return [];
    const definitionId = entry.definitionId || entry;
    if (isAmmoDefinition(definitionId)) {
        if (isFreeFallbackAmmo(definitionId)) return [];
        return packAmmoAmount(definitionId, getAmmoAmountForEntry({ definitionId, quantity: entry.quantity }));
    }
    if (isConsumableDefinition(definitionId)) {
        return packStackableAmount(definitionId, getStackableAmountForEntry({ definitionId, quantity: entry.quantity }));
    }
    if (!isSupportedItemDefinition(ITEM_DEFS[definitionId])) return [];
    return [{ definitionId }];
}

function normalizePersistentEntries(entries = [], maxSpace = Infinity) {
    const normalized = [];
    let usedSpace = 0;
    for (const entry of entries) {
        const expandedEntries = normalizePersistentEntry(entry);
        for (const normalizedEntry of expandedEntries) {
            const entrySpace = getEntrySpaceUsed(normalizedEntry);
            if (usedSpace + entrySpace > maxSpace) {
                return normalized;
            }
            normalized.push(normalizedEntry);
            usedSpace += entrySpace;
        }
    }
    return normalized;
}

function normalizeSavedLoadoutSnapshot(snapshot, slotIndex = 0) {
    if (!snapshot || typeof snapshot !== 'object') return null;

    const normalizedLoadout = {};
    for (const slot of LOADOUT_SLOTS) {
        const candidate = getLegacyLoadoutValue(snapshot.loadout, slot);
        if (isLoadoutSlotMatch(slot, candidate)) {
            normalizedLoadout[slot] = candidate;
        } else {
            normalizedLoadout[slot] = REQUIRED_LOADOUT_SLOTS.has(slot) ? STARTER_LOADOUT[slot] : null;
        }
    }

    return {
        slotIndex,
        name: typeof snapshot.name === 'string' && snapshot.name.trim()
            ? snapshot.name.trim()
            : `Loadout ${slotIndex + 1}`,
        loadout: normalizedLoadout,
        backpackItems: normalizePersistentEntries(snapshot.backpackItems || []),
        safeboxItems: normalizePersistentEntries(snapshot.safeboxItems || [], SAFEBOX_CAPACITY),
        updatedAt: snapshot.updatedAt || new Date().toISOString(),
    };
}

function normalizeSavedLoadouts(savedLoadouts) {
    const slots = defaultSavedLoadouts();
    for (let index = 0; index < slots.length; index += 1) {
        slots[index] = normalizeSavedLoadoutSnapshot(savedLoadouts?.[index], index);
    }
    return slots;
}

function captureRaidLoadoutSnapshot(profile, slotIndex = null) {
    const resolvedSlot = Number.isInteger(slotIndex) ? slotIndex : -1;
    return {
        slotIndex: resolvedSlot,
        name: resolvedSlot >= 0 ? `Loadout ${resolvedSlot + 1}` : 'Current Loadout',
        loadout: { ...(profile?.loadout || {}) },
        backpackItems: normalizePersistentEntries(profile?.backpackItems || []),
        safeboxItems: normalizePersistentEntries(profile?.safeboxItems || [], SAFEBOX_CAPACITY),
        updatedAt: new Date().toISOString(),
    };
}

function getLegacyAmmoFromStashEntries(entries = []) {
    const ammoMap = {};
    for (const entry of entries) {
        if (!isAmmoDefinition(entry.definitionId)) continue;
        const definitionId = ITEM_DEFS[entry.definitionId] ? entry.definitionId : 'ammo_white';
        ammoMap[definitionId] = (ammoMap[definitionId] || 0) + getAmmoAmountForEntry(entry);
    }
    return ammoMap;
}

function normalizeStashAmmo(stashAmmo, legacyEntries = []) {
    const normalized = {};
    if (stashAmmo && typeof stashAmmo === 'object') {
        for (const definitionId of AMMO_DEFINITION_IDS) {
            if (isFreeFallbackAmmo(definitionId)) continue;
            const count = Math.max(0, Math.floor(Number(stashAmmo[definitionId]) || 0));
            if (count > 0) {
                normalized[definitionId] = count;
            }
        }
    }

    const legacyAmmo = getLegacyAmmoFromStashEntries(legacyEntries);
    for (const [definitionId, count] of Object.entries(legacyAmmo)) {
        if (isFreeFallbackAmmo(definitionId)) continue;
        normalized[definitionId] = (normalized[definitionId] || 0) + count;
    }
    return normalized;
}

function addAmmoToProfile(profile, definitionId, amount) {
    if (!isAmmoDefinition(definitionId) || isFreeFallbackAmmo(definitionId)) return;
    const nextAmount = Math.max(0, Math.floor(Number(amount) || 0));
    const current = getAmmoCountForProfile(profile, definitionId);
    profile.stashAmmo = { ...getStashAmmoMap(profile), [definitionId]: current + nextAmount };
}

function addRewardItemToProfile(profile, definitionId, amount = 1) {
    if (!profile || !ITEM_DEFS[definitionId]) return;
    const quantity = Math.max(1, Math.floor(Number(amount) || 1));
    if (isAmmoDefinition(definitionId)) {
        addAmmoToProfile(profile, definitionId, quantity);
        return;
    }
    const stash = Array.isArray(profile.stashItems) ? profile.stashItems : [];
    profile.stashItems = stash;
    for (let index = 0; index < quantity; index += 1) {
        stash.push({ definitionId });
    }
}

function removeAmmoFromProfile(profile, definitionId, amount) {
    if (!isAmmoDefinition(definitionId) || isFreeFallbackAmmo(definitionId)) return;
    const nextMap = { ...getStashAmmoMap(profile) };
    const current = nextMap[definitionId] || 0;
    const remaining = Math.max(0, current - Math.max(0, Math.floor(Number(amount) || 0)));
    if (remaining > 0) {
        nextMap[definitionId] = remaining;
    } else {
        delete nextMap[definitionId];
    }
    profile.stashAmmo = nextMap;
}

function removeOneDefinitionFromStash(profile, definitionId) {
    const stash = profile.stashItems || [];
    const index = stash.findIndex((item) => item.definitionId === definitionId);
    if (index !== -1) {
        stash.splice(index, 1);
        return true;
    }
    return false;
}

function rollLoss(probability) {
    return Math.random() < probability;
}

function isMarketLockedAmmo(definitionId) {
    return definitionId === 'ammo_white';
}

function isFreeFallbackAmmo(definitionId) {
    return definitionId === 'ammo_white';
}

export function calculateDeathLosses(profile, difficulty = 'advanced', randomFn = Math.random) {
    if (!profile || difficulty === 'easy') {
        return [];
    }

    const equippedDefinitions = LOADOUT_SLOTS.reduce((entries, slot) => {
        const definitionId = profile.loadout?.[slot];
        if (!definitionId || !ITEM_DEFS[definitionId]) return entries;
        entries.push({ slot, definitionId });
        return entries;
    }, []);

    if (difficulty === 'hell' || difficulty === 'chaos') {
        return equippedDefinitions.map(({ definitionId }) => definitionId);
    }

    const losses = [];
    for (const gunEntry of equippedDefinitions.filter((entry) => GUN_LOADOUT_SLOTS.includes(entry.slot))) {
        losses.push(gunEntry.definitionId);
    }

    for (const entry of equippedDefinitions) {
        if (GUN_LOADOUT_SLOTS.includes(entry.slot)) continue;
        if (randomFn() < 0.15) {
            losses.push(entry.definitionId);
        }
    }

    return losses;
}

export function calculateSafeboxDeathLosses(safeboxItems, difficulty = 'advanced', randomFn = Math.random) {
    if (difficulty !== 'chaos' || !Array.isArray(safeboxItems) || !safeboxItems.length) {
        return [];
    }
    return safeboxItems.reduce((lossIndices, item, index) => {
        if (!item?.definitionId || !ITEM_DEFS[item.definitionId]) return lossIndices;
        if (randomFn() < 0.5) lossIndices.push(index);
        return lossIndices;
    }, []);
}

function applyDeathLosses(profile, difficulty = 'advanced', precomputedLosses = null) {
    if (!profile) return [];

    const losses = Array.isArray(precomputedLosses)
        ? precomputedLosses.filter((definitionId) => ITEM_DEFS[definitionId])
        : calculateDeathLosses(profile, difficulty);

    profile.backpackItems = [];

    for (const definitionId of losses) {
        removeOneDefinitionFromStash(profile, definitionId);
    }

    return losses;
}

function normalizeLoadout(loadout, stashItems) {
    const counts = {};
    for (const item of stashItems) counts[item.definitionId] = (counts[item.definitionId] || 0) + 1;

    const next = {};
    for (const slot of LOADOUT_SLOTS) {
        const candidate = getLegacyLoadoutValue(loadout, slot);
        const fallback = STARTER_LOADOUT[slot];
        const hasCandidate = isLoadoutSlotMatch(slot, candidate) && counts[candidate] > 0;
        next[slot] = hasCandidate ? candidate : (REQUIRED_LOADOUT_SLOTS.has(slot) ? fallback : null);
        if (next[slot] && !counts[next[slot]]) {
            stashItems.push({ definitionId: next[slot] });
            counts[next[slot]] = 1;
        }
        if (next[slot]) {
            counts[next[slot]] = Math.max(0, (counts[next[slot]] || 0) - 1);
        }
    }
    return next;
}

function toNonNegativeInteger(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
}

function toNumberOrFallback(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRaidHistoryEntry(entry, options = {}) {
    if (!entry || typeof entry !== 'object') return null;

    const legacyExtraction = Boolean(options.legacyExtraction);
    const difficulty = String(entry.difficulty || 'advanced');
    const extractedSuccess = entry.status
        ? entry.status === 'extracted'
        : (legacyExtraction ? true : Boolean(entry.extractedSuccess));
    const legacyKills = toNonNegativeInteger(entry.kills);
    const explicitAiEnemyKills = entry.aiEnemyKills == null ? null : toNonNegativeInteger(entry.aiEnemyKills);
    const operatorKills = entry.operatorKills == null
        ? Math.max(0, legacyKills - (explicitAiEnemyKills || 0))
        : toNonNegativeInteger(entry.operatorKills);
    const aiEnemyKills = entry.aiEnemyKills == null
        ? (legacyExtraction ? legacyKills : Math.max(0, legacyKills - operatorKills))
        : toNonNegativeInteger(entry.aiEnemyKills);
    const valueExtracted = Math.max(0, toNumberOrFallback(entry.valueExtracted, extractedSuccess ? toNumberOrFallback(entry.estimatedValue, 0) : 0));
    const lostValue = Math.max(0, toNumberOrFallback(entry.lostValue, 0));
    const netValue = entry.netValue == null
        ? (extractedSuccess ? valueExtracted - lostValue : -lostValue)
        : toNumberOrFallback(entry.netValue, 0);
    const createdAt = entry.createdAt || new Date().toISOString();

    return {
        ...clone(entry),
        id: entry.id || `${Date.parse(createdAt) || Date.now()}-${Math.floor(Math.random() * 10000)}`,
        createdAt,
        difficulty,
        status: extractedSuccess ? 'extracted' : 'dead',
        extractedSuccess,
        operatorKills,
        aiEnemyKills,
        kills: operatorKills + aiEnemyKills,
        valueExtracted,
        lostValue,
        netValue,
    };
}

function normalizeRaidHistory(history = [], extractedRuns = []) {
    const sourceEntries = Array.isArray(history) && history.length
        ? history
        : (Array.isArray(extractedRuns) ? extractedRuns.map((entry) => normalizeRaidHistoryEntry(entry, { legacyExtraction: true })) : []);

    return sourceEntries
        .map((entry) => normalizeRaidHistoryEntry(entry))
        .filter(Boolean)
        .slice(0, MAX_RAID_HISTORY);
}

export function normalizeProfile(profile, fallbackName = 'Guest Operative', isGuest = false) {
    const base = createDefaultProfile(fallbackName, isGuest);
    const rawStashItems = Array.isArray(profile?.stashItems) && profile.stashItems.length
        ? profile.stashItems
        : defaultStash();
    const stashItems = rawStashItems.filter((entry) => ITEM_DEFS[entry.definitionId] && !isAmmoDefinition(entry.definitionId));
    const stashAmmo = normalizeStashAmmo(profile?.stashAmmo, rawStashItems.filter((entry) => isAmmoDefinition(entry.definitionId)));
    const backpackItems = Array.isArray(profile?.backpackItems)
        ? normalizePersistentEntries(profile.backpackItems)
        : [];
    const safeboxItems = Array.isArray(profile?.safeboxItems)
        ? normalizePersistentEntries(profile.safeboxItems, SAFEBOX_CAPACITY)
        : [];

    return {
        ...base,
        ...profile,
        isGuest,
        playerExp: normalizePlayerExp(profile?.playerExp),
        elo: Math.max(0, Math.round(Number(profile?.elo) || base.elo)),
        claimedPlayerLevelRewards: normalizePlayerLevelRewardClaims(profile?.claimedPlayerLevelRewards),
        stashItems,
        stashAmmo,
        backpackItems,
        safeboxItems,
        savedLoadouts: normalizeSavedLoadouts(profile?.savedLoadouts),
        loadout: normalizeLoadout(profile?.loadout, stashItems),
        extractedRuns: Array.isArray(profile?.extractedRuns) ? profile.extractedRuns : [],
        raidHistory: normalizeRaidHistory(profile?.raidHistory, profile?.extractedRuns),
        stats: { ...base.stats, ...(profile?.stats || {}) }
    };
}

export function summarizeProfile(profile) {
    const lastRun = profile.extractedRuns[0] || null;
    const progress = getPlayerLevelProgress(profile?.playerExp || 0);
    return {
        coins: profile.coins,
        playerLevel: progress.level,
        playerExp: progress.totalExp,
        pendingPlayerLevelRewards: getClaimablePlayerLevelRewards(profile).length,
        extractedRuns: profile.extractedRuns.length,
        lastExtractItemCount: lastRun?.items?.length || 0,
        loadoutNames: LOADOUT_SLOTS.map((slot) => ITEM_DEFS[profile.loadout[slot]]?.name || 'Empty')
    };
}

export function getProfileInventoryValue(profile) {
    const sumEntryValues = (entries = []) => entries.reduce((sum, entry) => {
        const definition = ITEM_DEFS[entry.definitionId];
        if (!definition) return sum;
        if (isStackableDefinition(entry.definitionId)) {
            return sum + (definition.sellValue * getStackableAmountForEntry(entry));
        }
        return sum + definition.sellValue;
    }, 0);

    const stashAmmoValue = Object.entries(getStashAmmoMap(profile)).reduce((sum, [definitionId, count]) => {
        const definition = ITEM_DEFS[definitionId];
        return sum + ((definition?.sellValue || 0) * count);
    }, 0);

    return (profile?.coins || 0)
        + sumEntryValues(profile?.stashItems || [])
        + stashAmmoValue
        + sumEntryValues(profile?.backpackItems || [])
        + sumEntryValues(profile?.safeboxItems || []);
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
    const stashAmmoMap = getStashAmmoMap(profile);
    for (const [definitionId, amount] of Object.entries(stashAmmoMap)) {
        const definition = ITEM_DEFS[definitionId];
        if (!definition || amount <= 0) continue;
        summary.items += amount;
        summary[definition.rarity] += amount;
    }
    return summary;
}

export function getSafeboxSummary(profile) {
    return {
        used: getEntriesSpaceUsed(profile.safeboxItems || []),
        capacity: SAFEBOX_CAPACITY,
    };
}

export function createLootItem(definitionId, options = {}) {
    const definition = ITEM_DEFS[definitionId];
    if (!isSupportedItemDefinition(definition)) return null;
    const quantity = isStackableDefinition(definitionId)
        ? Math.max(1, Math.min(AMMO_PACK_LIMIT, Math.floor(Number(options.quantity) || 1)))
        : null;
    return {
        id: `${definitionId}-${Math.floor(Math.random() * 1000000000)}`,
        definitionId,
        name: quantity ? `${definition.name} x${quantity}` : definition.name,
        category: definition.category,
        rarity: definition.rarity,
        sellValue: quantity ? definition.sellValue * quantity : definition.sellValue,
        size: definition.size || 1,
        description: quantity ? `${definition.name} pack containing ${quantity} round${quantity === 1 ? '' : 's'}.` : definition.description,
        quantity: quantity || undefined,
        stats: clone(definition.stats || {}),
        modifiers: clone(definition.modifiers || {})
    };
}

export function createPersistentEntryFromLootItem(item) {
    if (!item?.definitionId || !ITEM_DEFS[item.definitionId]) return null;
    if (isAmmoDefinition(item.definitionId)) {
        if (isFreeFallbackAmmo(item.definitionId)) return null;
        return { definitionId: item.definitionId, quantity: getAmmoAmountForEntry(item) };
    }
    if (isConsumableDefinition(item.definitionId)) {
        return { definitionId: item.definitionId, quantity: getStackableAmountForEntry(item) };
    }
    return { definitionId: item.definitionId };
}

export function getEntrySpaceUsed(entry) {
    const definitionId = entry?.definitionId || entry;
    return Math.max(1, Number(ITEM_DEFS[definitionId]?.size) || 1);
}

export function getEntriesSpaceUsed(entries = []) {
    return (entries || []).reduce((sum, entry) => sum + getEntrySpaceUsed(entry), 0);
}

export function createLootItemsForCrateTier(tierKey) {
    const tier = CRATE_TIERS[tierKey];
    if (!tier) return createLootItemsForZone(0, 3);
    const itemIds = Object.keys(ITEM_DEFS).filter((id) => isSupportedItemDefinition(ITEM_DEFS[id]));
    const count = tier.itemCount.min + Math.floor(Math.random() * (tier.itemCount.max - tier.itemCount.min + 1));
    const items = [];
    for (let i = 0; i < count; i++) {
        const rarity = tier.pool[Math.floor(Math.random() * tier.pool.length)];
        const candidates = itemIds.filter((id) => ITEM_DEFS[id].rarity === rarity);
        const picked = candidates[Math.floor(Math.random() * candidates.length)] || itemIds[0];
        items.push(createLootItem(picked));
    }
    return items.filter(Boolean);
}

function pickWeighted(items) {
    const total = items.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * total;
    for (const entry of items) {
        roll -= entry.weight;
        if (roll <= 0) return entry.value;
    }
    return items[items.length - 1]?.value;
}

function getCrateItemCount(crateRarity) {
    switch (crateRarity) {
        case 'white': return { min: 2, max: 4 };
        case 'green': return { min: 2, max: 4 };
        case 'blue': return { min: 2, max: 4 };
        case 'purple': return { min: 2, max: 4 };
        case 'gold': return { min: 1, max: 3 };
        case 'red': return { min: 1, max: 2 };
        default: return { min: 2, max: 4 };
    }
}

function getCrateDropRarity(crateRarity) {
    if (crateRarity === 'red') {
        return pickWeighted([
            { value: 'red', weight: 0.9 },
            { value: 'gold', weight: 0.1 }
        ]);
    }

    const baseIndex = CRATE_RARITY_ORDER.indexOf(crateRarity);
    if (baseIndex === -1) return crateRarity;

    const weighted = [{ value: crateRarity, weight: 0.88 }];
    if (CRATE_RARITY_ORDER[baseIndex + 1]) {
        weighted.push({ value: CRATE_RARITY_ORDER[baseIndex + 1], weight: 0.1 });
    }
    if (CRATE_RARITY_ORDER[baseIndex + 2]) {
        weighted.push({ value: CRATE_RARITY_ORDER[baseIndex + 2], weight: 0.02 });
    }
    return pickWeighted(weighted);
}

export function createLootItemsForCrateRarity(crateRarity) {
    const countRange = getCrateItemCount(crateRarity);
    const count = countRange.min + Math.floor(Math.random() * (countRange.max - countRange.min + 1));
    const itemIds = Object.keys(ITEM_DEFS).filter((id) => isSupportedItemDefinition(ITEM_DEFS[id]) && ITEM_DEFS[id].lootType !== 'ammo');
    const items = [];

    for (let i = 0; i < count; i++) {
        const rarity = getCrateDropRarity(crateRarity);
        const candidates = itemIds.filter((id) => ITEM_DEFS[id].rarity === rarity);
        const picked = candidates[Math.floor(Math.random() * candidates.length)] || itemIds[0];
        items.push(createLootItem(picked));
    }

    return items.filter(Boolean);
}

export function createLootItemsForZone(zone, count) {
    const pool = LOOT_POOLS[zone] || LOOT_POOLS[0];
    const itemIds = Object.keys(ITEM_DEFS).filter((id) => isSupportedItemDefinition(ITEM_DEFS[id]) && ITEM_DEFS[id].lootType !== 'ammo');
    const items = [];
    for (let i = 0; i < count; i++) {
        const rarity = pool[Math.floor(Math.random() * pool.length)];
        const candidates = itemIds.filter((id) => ITEM_DEFS[id].rarity === rarity);
        const picked = candidates[Math.floor(Math.random() * candidates.length)] || itemIds[0];
        items.push(createLootItem(picked));
    }
    return items.filter(Boolean);
}

function createInventoryPool() {
    return { equipment: {}, ammo: {}, consumables: {} };
}

function addDefinitionAmount(poolSection, definitionId, amount) {
    const quantity = Math.max(0, Math.floor(Number(amount) || 0));
    if (!definitionId || quantity <= 0) return;
    poolSection[definitionId] = (poolSection[definitionId] || 0) + quantity;
}

function addEntryToInventoryPool(pool, entry) {
    const definitionId = entry?.definitionId || entry;
    if (!ITEM_DEFS[definitionId]) return;
    if (isAmmoDefinition(definitionId)) {
        addDefinitionAmount(pool.ammo, definitionId, getAmmoAmountForEntry(entry));
        return;
    }
    if (isConsumableDefinition(definitionId)) {
        addDefinitionAmount(pool.consumables, definitionId, getStackableAmountForEntry(entry));
        return;
    }
    addDefinitionAmount(pool.equipment, definitionId, 1);
}

function buildProfileInventoryPool(profile) {
    const pool = createInventoryPool();
    for (const entry of profile?.stashItems || []) addEntryToInventoryPool(pool, entry);
    for (const [definitionId, amount] of Object.entries(getStashAmmoMap(profile))) {
        addDefinitionAmount(pool.ammo, definitionId, amount);
    }
    for (const entry of profile?.backpackItems || []) addEntryToInventoryPool(pool, entry);
    for (const entry of profile?.safeboxItems || []) addEntryToInventoryPool(pool, entry);
    return pool;
}

function buildSnapshotRequirementPool(snapshot) {
    const pool = createInventoryPool();
    for (const slot of LOADOUT_SLOTS) {
        const definitionId = snapshot?.loadout?.[slot];
        if (isLoadoutSlotMatch(slot, definitionId)) {
            addDefinitionAmount(pool.equipment, definitionId, 1);
        }
    }
    for (const entry of snapshot?.backpackItems || []) addEntryToInventoryPool(pool, entry);
    for (const entry of snapshot?.safeboxItems || []) addEntryToInventoryPool(pool, entry);
    return pool;
}

function buildMissingRequirementList(profile, snapshot) {
    const available = buildProfileInventoryPool(profile);
    const required = buildSnapshotRequirementPool(snapshot);
    const missing = [];

    const pushMissing = (definitionId, quantity) => {
        const amount = Math.max(0, Math.floor(Number(quantity) || 0));
        if (amount <= 0 || !ITEM_DEFS[definitionId]) return;
        missing.push({
            definitionId,
            quantity: amount,
            totalCost: getBuyTradeTotal(definitionId, amount),
        });
    };

    for (const [definitionId, quantity] of Object.entries(required.equipment)) {
        pushMissing(definitionId, quantity - (available.equipment[definitionId] || 0));
    }
    for (const [definitionId, quantity] of Object.entries(required.ammo)) {
        pushMissing(definitionId, quantity - (available.ammo[definitionId] || 0));
    }
    for (const [definitionId, quantity] of Object.entries(required.consumables)) {
        pushMissing(definitionId, quantity - (available.consumables[definitionId] || 0));
    }

    return missing;
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
            this.activeUsername = result.profile.username;
            localStorage.setItem(ACTIVE_USER_KEY, this.activeUsername);
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

    async fetchLeaderboard() {
        const username = this.activeUsername || '';
        const result = await apiFetch(`/leaderboard?username=${encodeURIComponent(username)}&ts=${Date.now()}`);
        return result;
    }

    async pushAiRoster(entries) {
        if (!Array.isArray(entries) || !entries.length) return;
        return apiFetch('/ai-roster', {
            method: 'POST',
            body: JSON.stringify({ entries }),
        });
    }

    getCurrentRaidLoadoutSnapshot() {
        return captureRaidLoadoutSnapshot(this.currentProfile);
    }

    getSavedLoadoutSnapshot(slotIndex) {
        const index = Math.max(0, Math.min(4, Math.floor(Number(slotIndex) || 0)));
        return clone(this.currentProfile.savedLoadouts?.[index] || null);
    }

    async saveLoadoutPreset(slotIndex) {
        const index = Math.max(0, Math.min(4, Math.floor(Number(slotIndex) || 0)));
        const snapshot = captureRaidLoadoutSnapshot(this.currentProfile, index);
        this.currentProfile.savedLoadouts[index] = snapshot;
        return this.saveCurrentProfile();
    }

    getRaidLoadoutPreparationPreview(slotIndex = null) {
        const snapshot = slotIndex == null || slotIndex < 0
            ? captureRaidLoadoutSnapshot(this.currentProfile)
            : this.getSavedLoadoutSnapshot(slotIndex);

        if (!snapshot) {
            return { snapshot: null, missingEntries: [], totalCost: 0 };
        }

        const missingEntries = buildMissingRequirementList(this.currentProfile, snapshot);
        return {
            snapshot,
            missingEntries,
            totalCost: missingEntries.reduce((sum, entry) => sum + entry.totalCost, 0),
        };
    }

    _restorePreparedEntriesToInventory(entries = []) {
        for (const entry of entries) {
            if (isAmmoDefinition(entry.definitionId)) {
                addAmmoToProfile(this.currentProfile, entry.definitionId, getAmmoAmountForEntry(entry));
            } else if (isConsumableDefinition(entry.definitionId)) {
                const amount = getStackableAmountForEntry(entry);
                for (let i = 0; i < amount; i += 1) {
                    this.currentProfile.stashItems.push({ definitionId: entry.definitionId });
                }
            } else if (ITEM_DEFS[entry.definitionId]) {
                this.currentProfile.stashItems.push({ definitionId: entry.definitionId });
            }
        }
    }

    _consumePreparedEntryFromInventory(entry) {
        if (isAmmoDefinition(entry.definitionId)) {
            removeAmmoFromProfile(this.currentProfile, entry.definitionId, getAmmoAmountForEntry(entry));
            return;
        }
        const amount = isConsumableDefinition(entry.definitionId)
            ? getStackableAmountForEntry(entry)
            : 1;
        for (let i = 0; i < amount; i += 1) {
            removeOneDefinitionFromStash(this.currentProfile, entry.definitionId);
        }
    }

    _purchaseLoadoutMissingEntries(missingEntries = []) {
        const totalCost = missingEntries.reduce((sum, entry) => sum + entry.totalCost, 0);
        if (this.currentProfile.coins < totalCost) {
            throw new Error('Not enough coins to buy the selected loadout.');
        }

        this.currentProfile.coins -= totalCost;
        for (const entry of missingEntries) {
            if (isAmmoDefinition(entry.definitionId)) {
                addAmmoToProfile(this.currentProfile, entry.definitionId, entry.quantity);
            } else {
                for (let i = 0; i < entry.quantity; i += 1) {
                    this.currentProfile.stashItems.push({ definitionId: entry.definitionId });
                }
            }
            this.currentProfile.stats.totalMarketTrades += entry.quantity;
        }
        return totalCost;
    }

    async applyRaidLoadoutSelection(slotIndex = null, options = {}) {
        const { autoBuyMissing = false } = options;
        const preview = this.getRaidLoadoutPreparationPreview(slotIndex);
        if (!preview.snapshot) {
            throw new Error('Saved loadout slot is empty.');
        }
        if (preview.totalCost > 0 && !autoBuyMissing) {
            throw new Error('Missing items required for this loadout.');
        }

        this._restorePreparedEntriesToInventory(this.currentProfile.backpackItems || []);
        this._restorePreparedEntriesToInventory(this.currentProfile.safeboxItems || []);
        this.currentProfile.backpackItems = [];
        this.currentProfile.safeboxItems = [];

        if (preview.totalCost > 0) {
            this._purchaseLoadoutMissingEntries(preview.missingEntries);
        }

        this.currentProfile.loadout = { ...(preview.snapshot.loadout || {}) };
        this.currentProfile.backpackItems = normalizePersistentEntries(preview.snapshot.backpackItems || []);
        this.currentProfile.safeboxItems = normalizePersistentEntries(preview.snapshot.safeboxItems || [], SAFEBOX_CAPACITY);

        for (const entry of this.currentProfile.backpackItems) {
            this._consumePreparedEntryFromInventory(entry);
        }
        for (const entry of this.currentProfile.safeboxItems) {
            this._consumePreparedEntryFromInventory(entry);
        }

        await this.saveCurrentProfile();
        return {
            profile: this.getCurrentProfile(),
            snapshot: clone(preview.snapshot),
            missingEntries: clone(preview.missingEntries),
            totalCost: preview.totalCost,
        };
    }

    async authenticate(username, password) {
        const result = await apiFetch('/auth', {
            method: 'POST',
            body: JSON.stringify({
                username,
                password,
                profile: createDefaultProfile(username, false)
            })
        });
        this.activeUsername = result.profile.username;
        localStorage.setItem(ACTIVE_USER_KEY, this.activeUsername);
        this.currentProfile = normalizeProfile(result.profile, this.activeUsername, false);
        return { ok: true, created: Boolean(result.created), profile: this.getCurrentProfile() };
    }

    async login(username, password) {
        const result = await apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        this.activeUsername = result.profile.username;
        localStorage.setItem(ACTIVE_USER_KEY, this.activeUsername);
        this.currentProfile = normalizeProfile(result.profile, this.activeUsername, false);
        return { ok: true, profile: this.getCurrentProfile() };
    }

    async signUp(username, password) {
        const result = await apiFetch('/signup', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        this.activeUsername = result.profile.username;
        localStorage.setItem(ACTIVE_USER_KEY, this.activeUsername);
        this.currentProfile = normalizeProfile(result.profile, this.activeUsername, false);
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

    async claimNextPlayerLevelReward() {
        const reward = getNextClaimablePlayerLevelReward(this.currentProfile);
        if (!reward) {
            throw new Error('No player level reward is available to claim.');
        }

        const claimedLevels = new Set(getClaimedPlayerLevelRewardLevels(this.currentProfile));
        claimedLevels.add(reward.level);
        this.currentProfile.claimedPlayerLevelRewards = Array.from(claimedLevels).sort((a, b) => a - b);
        if (reward.type === 'item' && reward.itemId) {
            addRewardItemToProfile(this.currentProfile, reward.itemId, reward.quantity || 1);
        } else {
            this.currentProfile.coins += reward.coins;
            this.currentProfile.stats.totalCoinsEarned += reward.coins;
        }

        const profile = await this.saveCurrentProfile();
        return { profile, reward };
    }

    async updateLoadout(slot, definitionId) {
        const isGunCategoryRequest = slot === 'gun';
        if (!LOADOUT_SLOTS.includes(slot) && !isGunCategoryRequest) return this.getCurrentProfile();

        const resolveGunSlot = () => {
            const emptySlot = GUN_LOADOUT_SLOTS.find((gunSlot) => !this.currentProfile.loadout?.[gunSlot]);
            if (emptySlot) return emptySlot;
            return GUN_LOADOUT_SLOTS.reduce((lowestValueSlot, gunSlot) => {
                const currentValue = ITEM_DEFS[this.currentProfile.loadout?.[gunSlot]]?.sellValue || 0;
                const lowestValue = ITEM_DEFS[this.currentProfile.loadout?.[lowestValueSlot]]?.sellValue || 0;
                return currentValue < lowestValue ? gunSlot : lowestValueSlot;
            }, GUN_LOADOUT_SLOTS[0]);
        };

        const targetSlot = isGunCategoryRequest ? resolveGunSlot() : slot;
        if (definitionId == null) {
            this.currentProfile.loadout[targetSlot] = null;
            return this.saveCurrentProfile();
        }
        const definition = ITEM_DEFS[definitionId];
        if (!definition || definition.category !== getLoadoutSlotCategory(targetSlot)) return this.getCurrentProfile();
        const owned = (this.currentProfile.stashItems || []).some((item) => item.definitionId === definitionId);
        if (!owned) return this.getCurrentProfile();
        this.currentProfile.loadout[targetSlot] = definitionId;
        return this.saveCurrentProfile();
    }

    async recordExtraction(summary) {
        const runSummary = {
            id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            createdAt: new Date().toISOString(),
            ...clone(summary)
        };
        for (const item of runSummary.items || []) {
            if (isAmmoDefinition(item.definitionId)) {
                if (isFreeFallbackAmmo(item.definitionId)) continue;
                addAmmoToProfile(this.currentProfile, item.definitionId, getAmmoAmountForEntry(item));
            } else if (isConsumableDefinition(item.definitionId)) {
                const amount = getStackableAmountForEntry(item);
                for (let i = 0; i < amount; i++) {
                    this.currentProfile.stashItems.push({ definitionId: item.definitionId });
                }
            } else if (ITEM_DEFS[item.definitionId]) {
                this.currentProfile.stashItems.push({ definitionId: item.definitionId });
            }
        }
        this.currentProfile.extractedRuns.unshift(runSummary);
        this.currentProfile.extractedRuns = this.currentProfile.extractedRuns.slice(0, 20);
        this._recordRaidHistory(runSummary, 'extracted');
        this.currentProfile.stats.totalRuns += 1;
        this.currentProfile.stats.totalExtractions += 1;
        this.currentProfile.stats.totalKills += runSummary.kills || 0;
        awardProfileExp(this.currentProfile, getExpRewardForRunSummary(runSummary));
        applyEloChange(this.currentProfile, computeEloChange(runSummary.difficulty, true, runSummary.eloKillBonus || 0));
        return this.saveCurrentProfile();
    }

    _recordRaidHistory(summary, status = 'dead') {
        const entry = normalizeRaidHistoryEntry({
            ...clone(summary),
            status,
        });
        if (!entry) return;
        this.currentProfile.raidHistory = Array.isArray(this.currentProfile.raidHistory)
            ? this.currentProfile.raidHistory
            : [];
        this.currentProfile.raidHistory.unshift(entry);
        this.currentProfile.raidHistory = this.currentProfile.raidHistory.slice(0, MAX_RAID_HISTORY);
    }

    async applyRaidOutcome(result) {
        const difficulty = result?.difficulty || 'advanced';
        this.currentProfile.backpackItems = [];
        this.currentProfile.safeboxItems = normalizePersistentEntries(result?.safeboxItems || [], SAFEBOX_CAPACITY);

        if (result?.status === 'extracted') {
            return this.recordExtraction({
                ...result.summary,
                items: Array.isArray(result.summary?.items) ? result.summary.items : []
            });
        }

        if (result?.status === 'dead') {
            this.currentProfile.stats.totalRuns += 1;
            this.currentProfile.stats.totalKills += Number(result?.summary?.kills) || 0;
            awardProfileExp(this.currentProfile, getExpRewardForRunSummary(result?.summary));
            applyEloChange(this.currentProfile, computeEloChange(difficulty, false, result?.summary?.eloKillBonus || 0, result?.summary?.deathPenaltyScale || 1.0));
            this.currentProfile.backpackItems = [];
            applyDeathLosses(this.currentProfile, difficulty, result?.summary?.deathLosses);
            this._recordRaidHistory({
                ...clone(result.summary || {}),
                items: Array.isArray(result?.summary?.items) ? result.summary.items : []
            }, 'dead');
        }

        return this.saveCurrentProfile();
    }

    async moveItemToSafebox(definitionId, quantity = 1) {
        const amount = Math.max(1, Math.floor(Number(quantity) || 1));
        const currentUsedSpace = getEntriesSpaceUsed(this.currentProfile.safeboxItems || []);

        if (isConsumableDefinition(definitionId)) {
            throw new Error('Consumables cannot be stored in the safebox.');
        }

        if (isAmmoDefinition(definitionId)) {
            if (isFreeFallbackAmmo(definitionId)) {
                throw new Error('Gray ammo is free and unlimited, so it cannot be stored.');
            }
            const availableAmmo = getAmmoCountForProfile(this.currentProfile, definitionId);
            if (amount > availableAmmo) {
                throw new Error(`You only have ${availableAmmo} ${ITEM_DEFS[definitionId].name}.`);
            }
            const requiredSlots = Math.ceil(amount / AMMO_PACK_LIMIT);
            const requiredSpace = requiredSlots * getEntrySpaceUsed({ definitionId });
            if (currentUsedSpace + requiredSpace > SAFEBOX_CAPACITY) {
                throw new Error('Safebox does not have enough space for that ammo.');
            }
            removeAmmoFromProfile(this.currentProfile, definitionId, amount);
            this.currentProfile.safeboxItems.push(...packAmmoAmount(definitionId, amount));
            return this.saveCurrentProfile();
        }

        if (currentUsedSpace + getEntrySpaceUsed({ definitionId }) > SAFEBOX_CAPACITY) {
            throw new Error('Safebox is full.');
        }

        const stash = this.currentProfile.stashItems || [];
        const ownedCount = stash.filter((item) => item.definitionId === definitionId).length;
        const equipped = Object.values(this.currentProfile.loadout).includes(definitionId);
        const movableCount = Math.max(0, ownedCount - (equipped ? 1 : 0));
        if (movableCount <= 0) {
            throw new Error('No movable copy available.');
        }

        const index = stash.findIndex((item) => item.definitionId === definitionId);
        if (index === -1) {
            throw new Error('Item not found in inventory.');
        }

        stash.splice(index, 1);
        this.currentProfile.safeboxItems.push({ definitionId });
        return this.saveCurrentProfile();
    }

    async moveItemToBackpack(definitionId, capacity, quantity = 1) {
        const amount = Math.max(1, Math.floor(Number(quantity) || 1));
        const currentUsedSpace = getEntriesSpaceUsed(this.currentProfile.backpackItems || []);

        if (isConsumableDefinition(definitionId)) {
            const stash = this.currentProfile.stashItems || [];
            const ownedCount = stash.filter((item) => item.definitionId === definitionId).length;
            if (amount > ownedCount) {
                throw new Error(`You only have ${ownedCount} ${ITEM_DEFS[definitionId].name}.`);
            }
            const requiredSlots = Math.ceil(amount / AMMO_PACK_LIMIT);
            const requiredSpace = requiredSlots * getEntrySpaceUsed({ definitionId });
            if (currentUsedSpace + requiredSpace > capacity) {
                throw new Error('Backpack does not have enough space for those consumables.');
            }
            for (let i = 0; i < amount; i++) {
                const index = stash.findIndex((item) => item.definitionId === definitionId);
                if (index === -1) throw new Error('Item not found in inventory.');
                stash.splice(index, 1);
            }
            this.currentProfile.backpackItems.push(...packStackableAmount(definitionId, amount));
            return this.saveCurrentProfile();
        }

        if (isAmmoDefinition(definitionId)) {
            if (isFreeFallbackAmmo(definitionId)) {
                throw new Error('Gray ammo is free and unlimited, so it cannot be stored.');
            }
            const availableAmmo = getAmmoCountForProfile(this.currentProfile, definitionId);
            if (amount > availableAmmo) {
                throw new Error(`You only have ${availableAmmo} ${ITEM_DEFS[definitionId].name}.`);
            }
            const requiredSlots = Math.ceil(amount / AMMO_PACK_LIMIT);
            const requiredSpace = requiredSlots * getEntrySpaceUsed({ definitionId });
            if (currentUsedSpace + requiredSpace > capacity) {
                throw new Error('Backpack does not have enough space for that ammo.');
            }
            removeAmmoFromProfile(this.currentProfile, definitionId, amount);
            this.currentProfile.backpackItems.push(...packAmmoAmount(definitionId, amount));
            return this.saveCurrentProfile();
        }

        if (currentUsedSpace + getEntrySpaceUsed({ definitionId }) > capacity) {
            throw new Error('Backpack is full.');
        }

        const stash = this.currentProfile.stashItems || [];
        const ownedCount = stash.filter((item) => item.definitionId === definitionId).length;
        const equipped = Object.values(this.currentProfile.loadout).includes(definitionId);
        const movableCount = Math.max(0, ownedCount - (equipped ? 1 : 0));
        if (movableCount <= 0) {
            throw new Error('No movable copy available.');
        }

        const index = stash.findIndex((item) => item.definitionId === definitionId);
        if (index === -1) {
            throw new Error('Item not found in inventory.');
        }

        stash.splice(index, 1);
        this.currentProfile.backpackItems.push({ definitionId });
        return this.saveCurrentProfile();
    }

    async moveBackpackItemToStash(definitionId, entryIndex = null) {
        const backpack = this.currentProfile.backpackItems || [];
        const resolvedIndex = entryIndex == null
            ? backpack.findIndex((item) => item.definitionId === definitionId)
            : Number(entryIndex);
        if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0 || resolvedIndex >= backpack.length) {
            throw new Error('Item not found in backpack.');
        }

        const [entry] = backpack.splice(resolvedIndex, 1);
        if (isAmmoDefinition(entry.definitionId)) {
            addAmmoToProfile(this.currentProfile, entry.definitionId, getAmmoAmountForEntry(entry));
        } else if (isConsumableDefinition(entry.definitionId)) {
            const amount = getStackableAmountForEntry(entry);
            for (let i = 0; i < amount; i++) {
                this.currentProfile.stashItems.push({ definitionId: entry.definitionId });
            }
        } else {
            this.currentProfile.stashItems.push({ definitionId: entry.definitionId });
        }
        return this.saveCurrentProfile();
    }

    async moveSafeboxItemToStash(definitionId, entryIndex = null) {
        const safebox = this.currentProfile.safeboxItems || [];
        const resolvedIndex = entryIndex == null
            ? safebox.findIndex((item) => item.definitionId === definitionId)
            : Number(entryIndex);
        if (!Number.isInteger(resolvedIndex) || resolvedIndex < 0 || resolvedIndex >= safebox.length) {
            throw new Error('Item not found in safebox.');
        }

        const [entry] = safebox.splice(resolvedIndex, 1);
        if (isAmmoDefinition(entry.definitionId)) {
            addAmmoToProfile(this.currentProfile, entry.definitionId, getAmmoAmountForEntry(entry));
        } else if (isConsumableDefinition(entry.definitionId)) {
            const amount = getStackableAmountForEntry(entry);
            for (let i = 0; i < amount; i++) {
                this.currentProfile.stashItems.push({ definitionId: entry.definitionId });
            }
        } else {
            this.currentProfile.stashItems.push({ definitionId: entry.definitionId });
        }
        return this.saveCurrentProfile();
    }

    async buyItem(definitionId, quantity = 1) {
        const definition = ITEM_DEFS[definitionId];
        if (!definition) throw new Error('Item not found.');
        if (isMarketLockedAmmo(definitionId)) throw new Error('Gray ammo cannot be traded in the market.');
        const amount = Math.max(1, Math.floor(Number(quantity) || 0));
        const totalCost = getBuyTradeTotal(definitionId, amount);
        if (totalCost < MIN_TRADE_TOTAL) throw new Error(`Trades must be at least ${MIN_TRADE_TOTAL} coins.`);
        if (this.currentProfile.coins < totalCost) throw new Error('Not enough coins.');
        this.currentProfile.coins -= totalCost;
        if (isAmmoDefinition(definitionId)) {
            addAmmoToProfile(this.currentProfile, definitionId, amount);
        } else {
            for (let i = 0; i < amount; i++) {
                this.currentProfile.stashItems.push({ definitionId });
            }
        }
        this.currentProfile.stats.totalMarketTrades += amount;
        return this.saveCurrentProfile();
    }

    async sellItem(definitionId, quantity = 1) {
        const definition = ITEM_DEFS[definitionId];
        if (!definition) throw new Error('Item not found.');
        if (isMarketLockedAmmo(definitionId)) throw new Error('Gray ammo cannot be traded in the market.');
        const stash = this.currentProfile.stashItems || [];
        const ownedCount = isAmmoDefinition(definitionId)
            ? getAmmoCountForProfile(this.currentProfile, definitionId)
            : stash.filter((item) => item.definitionId === definitionId).length;
        const equipped = Object.values(this.currentProfile.loadout).includes(definitionId);
        if (ownedCount <= 0) throw new Error('You do not own this item.');
        const amount = Math.max(1, Math.floor(Number(quantity) || 0));
        const sellableCount = isAmmoDefinition(definitionId) ? ownedCount : (equipped ? ownedCount - 1 : ownedCount);
        if (sellableCount <= 0) throw new Error('Equip another item first.');
        if (amount > sellableCount) throw new Error(`You can sell at most ${sellableCount}.`);
        const totalValue = getSellTradeTotal(definitionId, amount);
        if (totalValue < MIN_TRADE_TOTAL) throw new Error(`Trades must be at least ${MIN_TRADE_TOTAL} coins.`);
        if (isAmmoDefinition(definitionId)) {
            removeAmmoFromProfile(this.currentProfile, definitionId, amount);
        } else {
            for (let i = 0; i < amount; i++) {
                const index = stash.findIndex((item) => item.definitionId === definitionId);
                if (index === -1) throw new Error('You do not own this item.');
                stash.splice(index, 1);
            }
        }
        this.currentProfile.coins += totalValue;
        this.currentProfile.stats.totalCoinsEarned += totalValue;
        this.currentProfile.stats.totalMarketTrades += amount;
        return this.saveCurrentProfile();
    }

    async addCoins(amount = 0) {
        const coins = Math.max(0, Math.floor(Number(amount) || 0));
        this.currentProfile.coins += coins;
        return this.saveCurrentProfile();
    }
}
