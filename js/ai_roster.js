// ============================================================
// ai_roster.js — 91 persistent AI operator accounts
// Server-driven: stats fetched from server, cached in memory
// ============================================================

import { apiFetch } from './profile.js';

const ROSTER = [
    { id: 'r01', name: 'Ghost-11',    level: 'lv1', type: 'fighter'  },
    { id: 'r02', name: 'Brick-4',     level: 'lv1', type: 'fighter'  },
    { id: 'r03', name: 'Anvil-9',     level: 'lv1', type: 'fighter'  },
    { id: 'r04', name: 'Badger-6',    level: 'lv1', type: 'fighter'  },
    { id: 'r05', name: 'Hound-12',    level: 'lv1', type: 'fighter'  },
    { id: 'r06', name: 'Ember-3',     level: 'lv1', type: 'fighter'  },
    { id: 'r07', name: 'Magpie-5',    level: 'lv1', type: 'searcher' },
    { id: 'r08', name: 'Rook-14',     level: 'lv1', type: 'searcher' },
    { id: 'r09', name: 'Ferret-2',    level: 'lv1', type: 'searcher' },
    { id: 'r10', name: 'Cricket-8',   level: 'lv1', type: 'searcher' },
    { id: 'r11', name: 'Pebble-17',   level: 'lv1', type: 'searcher' },
    { id: 'r12', name: 'Sprout-10',   level: 'lv1', type: 'searcher' },
    { id: 'r13', name: 'Rabbit-7',    level: 'lv1', type: 'runner'   },
    { id: 'r14', name: 'Flicker-16',  level: 'lv1', type: 'runner'   },
    { id: 'r15', name: 'Wisp-1',      level: 'lv1', type: 'runner'   },
    { id: 'r16', name: 'Dart-13',     level: 'lv1', type: 'runner'   },
    { id: 'r17', name: 'Swift-20',    level: 'lv1', type: 'runner'   },
    { id: 'r18', name: 'Viper-9',     level: 'lv2', type: 'fighter'  },
    { id: 'r19', name: 'Raven-2',     level: 'lv2', type: 'fighter'  },
    { id: 'r20', name: 'Mako-7',      level: 'lv2', type: 'fighter'  },
    { id: 'r21', name: 'Warden-1',    level: 'lv2', type: 'fighter'  },
    { id: 'r22', name: 'Titan-15',    level: 'lv2', type: 'fighter'  },
    { id: 'r23', name: 'Storm-22',    level: 'lv2', type: 'fighter'  },
    { id: 'r24', name: 'Blitz-12',    level: 'lv2', type: 'fighter'  },
    { id: 'r25', name: 'Atlas-4',     level: 'lv2', type: 'searcher' },
    { id: 'r26', name: 'Cipher-8',    level: 'lv2', type: 'searcher' },
    { id: 'r27', name: 'Echo-6',      level: 'lv2', type: 'searcher' },
    { id: 'r28', name: 'Nomad-18',    level: 'lv2', type: 'searcher' },
    { id: 'r29', name: 'Lynx-25',     level: 'lv2', type: 'searcher' },
    { id: 'r30', name: 'Pilgrim-21',  level: 'lv2', type: 'searcher' },
    { id: 'r31', name: 'Falcon-5',    level: 'lv2', type: 'runner'   },
    { id: 'r32', name: 'Nova-3',      level: 'lv2', type: 'runner'   },
    { id: 'r33', name: 'Drift-17',    level: 'lv2', type: 'runner'   },
    { id: 'r34', name: 'Zephyr-11',   level: 'lv2', type: 'runner'   },
    { id: 'r35', name: 'Shade-28',    level: 'lv2', type: 'runner'   },
    { id: 'r36', name: 'Breeze-19',   level: 'lv2', type: 'runner'   },
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
    { id: 'r42', name: 'Specter-18',  level: 'lv3', type: 'searcher' },
    { id: 'r43', name: 'Orion-15',    level: 'lv3', type: 'searcher' },
    { id: 'r44', name: 'Jackal-29',   level: 'lv3', type: 'searcher' },
    { id: 'r57', name: 'Sable-37',    level: 'lv3', type: 'searcher' },
    { id: 'r58', name: 'Mirage-38',   level: 'lv3', type: 'searcher' },
    { id: 'r59', name: 'Crypt-39',    level: 'lv3', type: 'searcher' },
    { id: 'r60', name: 'Argus-40',    level: 'lv3', type: 'searcher' },
    { id: 'r61', name: 'Nexus-41',    level: 'lv3', type: 'searcher' },
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
    { id: 'r79', name: 'Spectre-59',  level: 'lv4', type: 'searcher' },
    { id: 'r80', name: 'Revenant-60', level: 'lv4', type: 'searcher' },
    { id: 'r81', name: 'Enigma-61',   level: 'lv4', type: 'searcher' },
    { id: 'r82', name: 'Phantom-X',   level: 'lv4', type: 'searcher' },
    { id: 'r83', name: 'Oracle-62',   level: 'lv4', type: 'searcher' },
    { id: 'r84', name: 'Wraith-X',    level: 'lv4', type: 'searcher' },
    { id: 'r85', name: 'Eclipse-63',  level: 'lv4', type: 'runner'   },
    { id: 'r86', name: 'Tempest-64',  level: 'lv4', type: 'runner'   },
    { id: 'r87', name: 'Mirage-X',    level: 'lv4', type: 'runner'   },
    { id: 'r88', name: 'Blitz-X',     level: 'lv4', type: 'runner'   },
    { id: 'r89', name: 'Strider-65',  level: 'lv4', type: 'runner'   },
    { id: 'r90', name: 'Neon-66',     level: 'lv4', type: 'runner'   },
    { id: 'r91', name: 'Quicksilver-67', level: 'lv4', type: 'runner' },
    { id: 'r99', name: 'BOSS', level: 'boss', type: 'fighter' },
];

let _statsCache = null;
let _fetchPromise = null;

function defaultStats() {
    return { raids: 0, kills: 0, deaths: 0, extractions: 0, elo: 1000 };
}

async function _fetchFromServer() {
    if (_fetchPromise) return _fetchPromise;
    _fetchPromise = (async () => {
        try {
            const result = await apiFetch('/ai-roster');
            _statsCache = result.roster || {};
        } catch {
            _statsCache = {};
        }
        _fetchPromise = null;
        return _statsCache;
    })();
    return _fetchPromise;
}

export function prefetchRoster() {
    _fetchFromServer();
}

export function getRoster() {
    const statsMap = _statsCache || {};
    return ROSTER.map((entry) => {
        const key = _toKey(entry.name);
        const s = statsMap[key] || {};
        return {
            ...entry,
            stats: {
                ...defaultStats(),
                raids: s.totalRuns || 0,
                kills: s.totalKills || 0,
                deaths: s.totalDeaths || 0,
                extractions: s.totalExtractions || 0,
                elo: s.elo || 1000,
            },
        };
    });
}

export function getRosterEntry(id) {
    const roster = getRoster();
    return roster.find((e) => e.id === id) || null;
}

export function pickRosterForRaid(difficulty, count) {
    const allowedLevels = {
        easy:     ['lv1'],
        advanced: ['lv1', 'lv2'],
        hell:     ['lv1', 'lv2', 'lv3', 'lv4'],
        chaos:    ['lv2', 'lv3', 'lv4'],
    };
    const levels = allowedLevels[difficulty] || allowedLevels.advanced;
    const eligible = getRoster().filter((e) => levels.includes(e.level));

    for (let i = eligible.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }

    return eligible.slice(0, Math.min(count, eligible.length));
}

const _STAT_KEY_MAP = { raids: 'totalRuns', kills: 'totalKills', deaths: 'totalDeaths', extractions: 'totalExtractions' };

function _toKey(name) {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function _pushBatchToServer(updates) {
    if (!updates || !updates.length) return;
    apiFetch('/ai-roster/batch', {
        method: 'POST',
        body: JSON.stringify({ updates }),
    }).catch((e) => console.warn('Roster batch update failed:', e));
}

export function incrementRosterStat(id, key, amount = 1) {
    const entry = ROSTER.find((e) => e.id === id);
    if (!entry) return;
    const serverKey = _STAT_KEY_MAP[key];
    if (!serverKey) return;
    _pushBatchToServer([{ username: entry.name, [serverKey]: amount, isBoss: entry.level === 'boss' }]);
}

export function batchUpdateRosterStats(updates) {
    if (!updates?.length) return;
    const formatted = updates.map(({ id, key, amount = 1 }) => {
        const entry = ROSTER.find((e) => e.id === id);
        if (!entry) return null;
        const serverKey = _STAT_KEY_MAP[key];
        if (!serverKey) return null;
        return { username: entry.name, [serverKey]: amount, isBoss: entry.level === 'boss' };
    }).filter(Boolean);
    if (!formatted.length) return;
    _pushBatchToServer(formatted);
}

export function applyRosterEloChanges(outcomes, difficulty, computeEloChange) {
    if (!outcomes?.length) return;
    const eloUpdates = [];
    for (const { rosterId, extracted, eloKillBonus, deathPenaltyScale, botElo } of outcomes) {
        const entry = ROSTER.find((e) => e.id === rosterId);
        if (!entry) continue;
        const change = computeEloChange(difficulty, extracted, eloKillBonus || 0, deathPenaltyScale || 1.0, botElo ?? 1000);
        const newElo = Math.max(0, Math.round((botElo ?? 1000) + change));
        eloUpdates.push({ username: entry.name, elo: newElo, isBoss: entry.level === 'boss' });
    }
    if (!eloUpdates.length) return;
    _pushBatchToServer(eloUpdates);
}

export function getRosterLeaderboardEntries() {
    const statsMap = _statsCache || {};
    return ROSTER.map((entry) => {
        const key = _toKey(entry.name);
        const s = statsMap[key] || {};
        return {
            username: entry.name,
            elo: s.elo ?? 1000,
            totalRuns: s.totalRuns ?? 0,
            totalExtractions: s.totalExtractions ?? 0,
            totalKills: s.totalKills ?? 0,
            isAI: true,
            isBoss: entry.level === 'boss',
        };
    });
}

export function resetRosterStats() {
    apiFetch('/ai-roster', {
        method: 'POST',
        body: JSON.stringify({ clear: true }),
    }).catch((e) => console.warn('Roster reset failed:', e));
    _statsCache = {};
}

export function invalidateRosterCache() {
    _statsCache = null;
    _fetchPromise = null;
}