// ============================================================
// ai_roster.js — 91 persistent AI operator accounts
// ============================================================

const STORAGE_KEY = 'sdcio_ai_roster_stats_v1';

/**
 * The 49 fixed AI operator accounts.
 * Each has a permanent id, name, level, and type.
 * Stats are persisted separately in localStorage.
 */
const ROSTER = [
    // ── lv1 fighters (6) ──
    { id: 'r01', name: 'Ghost-11',    level: 'lv1', type: 'fighter'  },
    { id: 'r02', name: 'Brick-4',     level: 'lv1', type: 'fighter'  },
    { id: 'r03', name: 'Anvil-9',     level: 'lv1', type: 'fighter'  },
    { id: 'r04', name: 'Badger-6',    level: 'lv1', type: 'fighter'  },
    { id: 'r05', name: 'Hound-12',    level: 'lv1', type: 'fighter'  },
    { id: 'r06', name: 'Ember-3',     level: 'lv1', type: 'fighter'  },

    // ── lv1 searchers (6) ──
    { id: 'r07', name: 'Magpie-5',    level: 'lv1', type: 'searcher' },
    { id: 'r08', name: 'Rook-14',     level: 'lv1', type: 'searcher' },
    { id: 'r09', name: 'Ferret-2',    level: 'lv1', type: 'searcher' },
    { id: 'r10', name: 'Cricket-8',   level: 'lv1', type: 'searcher' },
    { id: 'r11', name: 'Pebble-17',   level: 'lv1', type: 'searcher' },
    { id: 'r12', name: 'Sprout-10',   level: 'lv1', type: 'searcher' },

    // ── lv1 runners (5) ──
    { id: 'r13', name: 'Rabbit-7',    level: 'lv1', type: 'runner'   },
    { id: 'r14', name: 'Flicker-16',  level: 'lv1', type: 'runner'   },
    { id: 'r15', name: 'Wisp-1',      level: 'lv1', type: 'runner'   },
    { id: 'r16', name: 'Dart-13',     level: 'lv1', type: 'runner'   },
    { id: 'r17', name: 'Swift-20',    level: 'lv1', type: 'runner'   },

    // ── lv2 fighters (7) ──
    { id: 'r18', name: 'Viper-9',     level: 'lv2', type: 'fighter'  },
    { id: 'r19', name: 'Raven-2',     level: 'lv2', type: 'fighter'  },
    { id: 'r20', name: 'Mako-7',      level: 'lv2', type: 'fighter'  },
    { id: 'r21', name: 'Warden-1',    level: 'lv2', type: 'fighter'  },
    { id: 'r22', name: 'Titan-15',    level: 'lv2', type: 'fighter'  },
    { id: 'r23', name: 'Storm-22',    level: 'lv2', type: 'fighter'  },
    { id: 'r24', name: 'Blitz-12',    level: 'lv2', type: 'fighter'  },

    // ── lv2 searchers (6) ──
    { id: 'r25', name: 'Atlas-4',     level: 'lv2', type: 'searcher' },
    { id: 'r26', name: 'Cipher-8',    level: 'lv2', type: 'searcher' },
    { id: 'r27', name: 'Echo-6',      level: 'lv2', type: 'searcher' },
    { id: 'r28', name: 'Nomad-18',    level: 'lv2', type: 'searcher' },
    { id: 'r29', name: 'Lynx-25',     level: 'lv2', type: 'searcher' },
    { id: 'r30', name: 'Pilgrim-21',  level: 'lv2', type: 'searcher' },

    // ── lv2 runners (6) ──
    { id: 'r31', name: 'Falcon-5',    level: 'lv2', type: 'runner'   },
    { id: 'r32', name: 'Nova-3',      level: 'lv2', type: 'runner'   },
    { id: 'r33', name: 'Drift-17',    level: 'lv2', type: 'runner'   },
    { id: 'r34', name: 'Zephyr-11',   level: 'lv2', type: 'runner'   },
    { id: 'r35', name: 'Shade-28',    level: 'lv2', type: 'runner'   },
    { id: 'r36', name: 'Breeze-19',   level: 'lv2', type: 'runner'   },

    // ── lv3 fighters (12) ──
    { id: 'r37', name: 'Reaper-10',   level: 'lv3', type: 'fighter'  },
    { id: 'r38', name: 'Phantom-13',  level: 'lv3', type: 'fighter'  },
    { id: 'r39', name: 'Mantis-14',   level: 'lv3', type: 'fighter'  },
    { id: 'r40', name: 'Cerberus-30', level: 'lv3', type: 'fighter'  },
    { id: 'r41', name: 'Apex-26',     level: 'lv3', type: 'fighter'  },
    { id: 'r50', name: 'Hydra-31',    level: 'lv3', type: 'fighter'  },
    { id: 'r51', name: 'Vulcan-32',   level: 'lv3', type: 'fighter'  },
    { id: 'r52', name: 'Onslaught-33',level: 'lv3', type: 'fighter'  },
    { id: 'r53', name: 'Havoc-34',    level: 'lv3', type: 'fighter'  },
    { id: 'r54', name: 'Fury-35',     level: 'lv3', type: 'fighter'  },
    { id: 'r55', name: 'Titan-X',     level: 'lv3', type: 'fighter'  },
    { id: 'r56', name: 'Warpath-36',  level: 'lv3', type: 'fighter'  },

    // ── lv3 searchers (8) ──
    { id: 'r42', name: 'Specter-18',  level: 'lv3', type: 'searcher' },
    { id: 'r43', name: 'Orion-15',    level: 'lv3', type: 'searcher' },
    { id: 'r44', name: 'Jackal-29',   level: 'lv3', type: 'searcher' },
    { id: 'r57', name: 'Sable-37',    level: 'lv3', type: 'searcher' },
    { id: 'r58', name: 'Mirage-38',   level: 'lv3', type: 'searcher' },
    { id: 'r59', name: 'Crypt-39',    level: 'lv3', type: 'searcher' },
    { id: 'r60', name: 'Argus-40',    level: 'lv3', type: 'searcher' },
    { id: 'r61', name: 'Nexus-41',    level: 'lv3', type: 'searcher' },

    // ── lv3 runners (10) ──
    { id: 'r45', name: 'Valkyrie-19', level: 'lv3', type: 'runner'   },
    { id: 'r46', name: 'Ion-20',      level: 'lv3', type: 'runner'   },
    { id: 'r47', name: 'Aegis-16',    level: 'lv3', type: 'runner'   },
    { id: 'r48', name: 'Wraith-27',   level: 'lv3', type: 'runner'   },
    { id: 'r49', name: 'Comet-24',    level: 'lv3', type: 'runner'   },
    { id: 'r62', name: 'Mercury-42',  level: 'lv3', type: 'runner'   },
    { id: 'r63', name: 'Bolt-43',     level: 'lv3', type: 'runner'   },
    { id: 'r64', name: 'Pulse-44',    level: 'lv3', type: 'runner'   },
    { id: 'r65', name: 'Streak-45',   level: 'lv3', type: 'runner'   },
    { id: 'r66', name: 'Glint-46',    level: 'lv3', type: 'runner'   },

    // ── lv4 fighters (12) ──
    { id: 'r67', name: 'Oblivion-47', level: 'lv4', type: 'fighter'  },
    { id: 'r68', name: 'Ragnarok-48', level: 'lv4', type: 'fighter'  },
    { id: 'r69', name: 'Desolator-49',level: 'lv4', type: 'fighter'  },
    { id: 'r70', name: 'Inferno-50',  level: 'lv4', type: 'fighter'  },
    { id: 'r71', name: 'Tyrant-51',   level: 'lv4', type: 'fighter'  },
    { id: 'r72', name: 'Dreadnought-52', level: 'lv4', type: 'fighter' },
    { id: 'r73', name: 'Warlord-53',  level: 'lv4', type: 'fighter'  },
    { id: 'r74', name: 'Juggernaut-54', level: 'lv4', type: 'fighter' },
    { id: 'r75', name: 'Overlord-55', level: 'lv4', type: 'fighter'  },
    { id: 'r76', name: 'Executioner-56', level: 'lv4', type: 'fighter' },
    { id: 'r77', name: 'Annihilator-57', level: 'lv4', type: 'fighter' },
    { id: 'r78', name: 'Colossus-58', level: 'lv4', type: 'fighter'  },

    // ── lv4 searchers (6) ──
    { id: 'r79', name: 'Spectre-59',  level: 'lv4', type: 'searcher' },
    { id: 'r80', name: 'Revenant-60', level: 'lv4', type: 'searcher' },
    { id: 'r81', name: 'Enigma-61',   level: 'lv4', type: 'searcher' },
    { id: 'r82', name: 'Phantom-X',   level: 'lv4', type: 'searcher' },
    { id: 'r83', name: 'Oracle-62',   level: 'lv4', type: 'searcher' },
    { id: 'r84', name: 'Wraith-X',    level: 'lv4', type: 'searcher' },

    // ── lv4 runners (7) ──
    { id: 'r85', name: 'Eclipse-63',  level: 'lv4', type: 'runner'   },
    { id: 'r86', name: 'Tempest-64',  level: 'lv4', type: 'runner'   },
    { id: 'r87', name: 'Mirage-X',    level: 'lv4', type: 'runner'   },
    { id: 'r88', name: 'Blitz-X',     level: 'lv4', type: 'runner'   },
    { id: 'r89', name: 'Strider-65',  level: 'lv4', type: 'runner'   },
    { id: 'r90', name: 'Neon-66',     level: 'lv4', type: 'runner'   },
    { id: 'r91', name: 'Quicksilver-67', level: 'lv4', type: 'runner' },

    // ── boss ──
    { id: 'r99', name: 'BOSS', level: 'boss', type: 'fighter' },
];

// ── Stats persistence ──

function loadStats() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function saveStats(statsMap) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(statsMap));
    } catch { /* quota exceeded — silently skip */ }
}

function defaultStats() {
    return { raids: 0, kills: 0, deaths: 0, extractions: 0, elo: 1000 };
}

/**
 * Get the full roster with current stats merged in.
 * Returns Array<{ id, name, level, type, stats }>.
 */
export function getRoster() {
    const statsMap = loadStats();
    return ROSTER.map((entry) => ({
        ...entry,
        stats: { ...defaultStats(), ...(statsMap[entry.id] || {}) },
    }));
}

/**
 * Get a single roster entry by id (with stats).
 */
export function getRosterEntry(id) {
    const entry = ROSTER.find((e) => e.id === id);
    if (!entry) return null;
    const statsMap = loadStats();
    return { ...entry, stats: { ...defaultStats(), ...(statsMap[entry.id] || {}) } };
}

/**
 * Increment a stat for a roster operator.
 * @param {string} id  Roster id (e.g. 'r01')
 * @param {string} key Stat key (raids | kills | deaths | extractions)
 * @param {number} amount Amount to add (default 1)
 */
export function incrementRosterStat(id, key, amount = 1) {
    const statsMap = loadStats();
    if (!statsMap[id]) statsMap[id] = defaultStats();
    statsMap[id][key] = (statsMap[id][key] || 0) + amount;
    saveStats(statsMap);
}

/**
 * Batch-increment stats for multiple operators.
 * @param {Array<{id, key, amount}>} updates
 */
export function batchUpdateRosterStats(updates) {
    const statsMap = loadStats();
    for (const { id, key, amount = 1 } of updates) {
        if (!statsMap[id]) statsMap[id] = defaultStats();
        statsMap[id][key] = (statsMap[id][key] || 0) + amount;
    }
    saveStats(statsMap);
}

/**
 * Pick `count` roster entries eligible for the given difficulty.
 * Difficulty gates which levels can appear:
 *   easy     → lv1
 *   advanced → lv1, lv2
 *   hell     → lv1, lv2, lv3
 *   chaos    → lv2, lv3
 * Returns a shuffled subset of the matching roster entries (with stats).
 */
export function pickRosterForRaid(difficulty, count) {
    const allowedLevels = {
        easy:     ['lv1'],
        advanced: ['lv1', 'lv2'],
        hell:     ['lv1', 'lv2', 'lv3', 'lv4'],
        chaos:    ['lv2', 'lv3', 'lv4'],
    };
    const levels = allowedLevels[difficulty] || allowedLevels.advanced;
    const eligible = getRoster().filter((e) => levels.includes(e.level));

    // Shuffle (Fisher-Yates)
    for (let i = eligible.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }

    return eligible.slice(0, Math.min(count, eligible.length));
}

/**
 * Apply ELO changes for AI operators that participated in a raid.
 * @param {Array<{rosterId, extracted, eloKillBonus, deathPenaltyScale}>} outcomes — one entry per bot
 * @param {string} difficulty — raid difficulty
 * @param {function} computeEloChange — imported ELO compute function from profile.js
 */
export function applyRosterEloChanges(outcomes, difficulty, computeEloChange) {
    if (!outcomes?.length || typeof computeEloChange !== 'function') return;
    const statsMap = loadStats();
    for (const { rosterId, extracted, eloKillBonus, deathPenaltyScale } of outcomes) {
        if (!rosterId) continue;
        if (!statsMap[rosterId]) statsMap[rosterId] = defaultStats();
        const change = computeEloChange(difficulty, extracted, eloKillBonus || 0, deathPenaltyScale || 1.0);
        statsMap[rosterId].elo = Math.max(0, Math.round((statsMap[rosterId].elo ?? 1000) + change));
    }
    saveStats(statsMap);
}

/**
 * Get all roster entries formatted for the server leaderboard.
 * Returns Array<{ username, elo, totalRuns, totalExtractions, totalKills, isAI }>.
 */
export function getRosterLeaderboardEntries() {
    const statsMap = loadStats();
    return ROSTER.map((entry) => {
        const s = { ...defaultStats(), ...(statsMap[entry.id] || {}) };
        return {
            username: entry.name,
            elo: s.elo ?? 1000,
            totalRuns: s.raids,
            totalExtractions: s.extractions,
            totalKills: s.kills,
            isAI: true,
            isBoss: entry.level === 'boss',
        };
    });
}

/**
 * Reset all roster stats.
 */
export function resetRosterStats() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
