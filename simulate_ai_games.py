"""
simulate_ai_games.py — Simulate 100 games per difficulty for AI operators.
Run with: python simulate_ai_games.py
"""

import json
import random
from pathlib import Path

# ── Roster (mirrors js/ai_roster.js ROSTER) ──────────────────────────────────
ROSTER = [
    {"id": "r01", "name": "Ghost-11",    "level": "lv1", "type": "fighter"},
    {"id": "r02", "name": "Brick-4",     "level": "lv1", "type": "fighter"},
    {"id": "r03", "name": "Anvil-9",     "level": "lv1", "type": "fighter"},
    {"id": "r04", "name": "Badger-6",    "level": "lv1", "type": "fighter"},
    {"id": "r05", "name": "Hound-12",    "level": "lv1", "type": "fighter"},
    {"id": "r06", "name": "Ember-3",     "level": "lv1", "type": "fighter"},
    {"id": "r07", "name": "Magpie-5",    "level": "lv1", "type": "searcher"},
    {"id": "r08", "name": "Rook-14",     "level": "lv1", "type": "searcher"},
    {"id": "r09", "name": "Ferret-2",    "level": "lv1", "type": "searcher"},
    {"id": "r10", "name": "Cricket-8",   "level": "lv1", "type": "searcher"},
    {"id": "r11", "name": "Pebble-17",   "level": "lv1", "type": "searcher"},
    {"id": "r12", "name": "Sprout-10",   "level": "lv1", "type": "searcher"},
    {"id": "r13", "name": "Rabbit-7",    "level": "lv1", "type": "runner"},
    {"id": "r14", "name": "Flicker-16",  "level": "lv1", "type": "runner"},
    {"id": "r15", "name": "Wisp-1",      "level": "lv1", "type": "runner"},
    {"id": "r16", "name": "Dart-13",     "level": "lv1", "type": "runner"},
    {"id": "r17", "name": "Swift-20",    "level": "lv1", "type": "runner"},
    {"id": "r18", "name": "Viper-9",     "level": "lv2", "type": "fighter"},
    {"id": "r19", "name": "Raven-2",     "level": "lv2", "type": "fighter"},
    {"id": "r20", "name": "Mako-7",      "level": "lv2", "type": "fighter"},
    {"id": "r21", "name": "Warden-1",    "level": "lv2", "type": "fighter"},
    {"id": "r22", "name": "Titan-15",    "level": "lv2", "type": "fighter"},
    {"id": "r23", "name": "Storm-22",    "level": "lv2", "type": "fighter"},
    {"id": "r24", "name": "Blitz-12",    "level": "lv2", "type": "fighter"},
    {"id": "r25", "name": "Atlas-4",     "level": "lv2", "type": "searcher"},
    {"id": "r26", "name": "Cipher-8",    "level": "lv2", "type": "searcher"},
    {"id": "r27", "name": "Echo-6",      "level": "lv2", "type": "searcher"},
    {"id": "r28", "name": "Nomad-18",    "level": "lv2", "type": "searcher"},
    {"id": "r29", "name": "Lynx-25",     "level": "lv2", "type": "searcher"},
    {"id": "r30", "name": "Pilgrim-21",  "level": "lv2", "type": "searcher"},
    {"id": "r31", "name": "Falcon-5",    "level": "lv2", "type": "runner"},
    {"id": "r32", "name": "Nova-3",      "level": "lv2", "type": "runner"},
    {"id": "r33", "name": "Drift-17",    "level": "lv2", "type": "runner"},
    {"id": "r34", "name": "Zephyr-11",   "level": "lv2", "type": "runner"},
    {"id": "r35", "name": "Shade-28",    "level": "lv2", "type": "runner"},
    {"id": "r36", "name": "Breeze-19",   "level": "lv2", "type": "runner"},
    {"id": "r37", "name": "Reaper-10",   "level": "lv3", "type": "fighter"},
    {"id": "r38", "name": "Phantom-13",  "level": "lv3", "type": "fighter"},
    {"id": "r39", "name": "Mantis-14",   "level": "lv3", "type": "fighter"},
    {"id": "r40", "name": "Cerberus-30", "level": "lv3", "type": "fighter"},
    {"id": "r41", "name": "Apex-26",     "level": "lv3", "type": "fighter"},
    {"id": "r50", "name": "Hydra-31",    "level": "lv3", "type": "fighter"},
    {"id": "r51", "name": "Vulcan-32",   "level": "lv3", "type": "fighter"},
    {"id": "r52", "name": "Onslaught-33","level": "lv3", "type": "fighter"},
    {"id": "r53", "name": "Havoc-34",    "level": "lv3", "type": "fighter"},
    {"id": "r54", "name": "Fury-35",     "level": "lv3", "type": "fighter"},
    {"id": "r55", "name": "Titan-X",     "level": "lv3", "type": "fighter"},
    {"id": "r56", "name": "Warpath-36",  "level": "lv3", "type": "fighter"},
    {"id": "r42", "name": "Specter-18",  "level": "lv3", "type": "searcher"},
    {"id": "r43", "name": "Orion-15",    "level": "lv3", "type": "searcher"},
    {"id": "r44", "name": "Jackal-29",   "level": "lv3", "type": "searcher"},
    {"id": "r57", "name": "Sable-37",    "level": "lv3", "type": "searcher"},
    {"id": "r58", "name": "Mirage-38",   "level": "lv3", "type": "searcher"},
    {"id": "r59", "name": "Crypt-39",    "level": "lv3", "type": "searcher"},
    {"id": "r60", "name": "Argus-40",    "level": "lv3", "type": "searcher"},
    {"id": "r61", "name": "Nexus-41",    "level": "lv3", "type": "searcher"},
    {"id": "r45", "name": "Valkyrie-19", "level": "lv3", "type": "runner"},
    {"id": "r46", "name": "Ion-20",      "level": "lv3", "type": "runner"},
    {"id": "r47", "name": "Aegis-16",    "level": "lv3", "type": "runner"},
    {"id": "r48", "name": "Wraith-27",   "level": "lv3", "type": "runner"},
    {"id": "r49", "name": "Comet-24",   "level": "lv3", "type": "runner"},
    {"id": "r62", "name": "Mercury-42", "level": "lv3", "type": "runner"},
    {"id": "r63", "name": "Bolt-43",     "level": "lv3", "type": "runner"},
    {"id": "r64", "name": "Pulse-44",    "level": "lv3", "type": "runner"},
    {"id": "r65", "name": "Streak-45",   "level": "lv3", "type": "runner"},
    {"id": "r66", "name": "Glint-46",    "level": "lv3", "type": "runner"},
    {"id": "r67", "name": "Oblivion-47", "level": "lv4", "type": "fighter"},
    {"id": "r68", "name": "Ragnarok-48", "level": "lv4", "type": "fighter"},
    {"id": "r69", "name": "Desolator-49","level": "lv4", "type": "fighter"},
    {"id": "r70", "name": "Inferno-50",  "level": "lv4", "type": "fighter"},
    {"id": "r71", "name": "Tyrant-51",   "level": "lv4", "type": "fighter"},
    {"id": "r72", "name": "Dreadnought-52","level": "lv4", "type": "fighter"},
    {"id": "r73", "name": "Warlord-53",  "level": "lv4", "type": "fighter"},
    {"id": "r74", "name": "Juggernaut-54","level": "lv4", "type": "fighter"},
    {"id": "r75", "name": "Overlord-55", "level": "lv4", "type": "fighter"},
    {"id": "r76", "name": "Executioner-56","level": "lv4", "type": "fighter"},
    {"id": "r77", "name": "Annihilator-57","level": "lv4", "type": "fighter"},
    {"id": "r78", "name": "Colossus-58", "level": "lv4", "type": "fighter"},
    {"id": "r79", "name": "Spectre-59",  "level": "lv4", "type": "searcher"},
    {"id": "r80", "name": "Revenant-60", "level": "lv4", "type": "searcher"},
    {"id": "r81", "name": "Enigma-61",   "level": "lv4", "type": "searcher"},
    {"id": "r82", "name": "Phantom-X",   "level": "lv4", "type": "searcher"},
    {"id": "r83", "name": "Oracle-62",   "level": "lv4", "type": "searcher"},
    {"id": "r84", "name": "Wraith-X",    "level": "lv4", "type": "searcher"},
    {"id": "r85", "name": "Eclipse-63",  "level": "lv4", "type": "runner"},
    {"id": "r86", "name": "Tempest-64",  "level": "lv4", "type": "runner"},
    {"id": "r87", "name": "Mirage-X",    "level": "lv4", "type": "runner"},
    {"id": "r88", "name": "Blitz-X",     "level": "lv4", "type": "runner"},
    {"id": "r89", "name": "Strider-65",  "level": "lv4", "type": "runner"},
    {"id": "r90", "name": "Neon-66",     "level": "lv4", "type": "runner"},
    {"id": "r91", "name": "Quicksilver-67","level": "lv4", "type": "runner"},
    {"id": "r99", "name": "BOSS",        "level": "boss", "type": "fighter"},
]

# ── ELO constants (mirrors js/profile.js) ────────────────────────────────────
ELO_DIFFICULTY_K = {"easy": 0, "advanced": 5, "hell": 12, "chaos": 30}

def get_loss_multiplier(elo):
    if elo <= 900:   return 1 / 3
    if elo <= 1200: return 1 / 2
    if elo <= 1800: return 1.0
    if elo <= 2100: return 2.0
    if elo <= 2400: return 3.0
    return 5.0

def get_gain_multiplier(elo):
    if elo <= 900:   return 3.0
    if elo <= 1200: return 2.0
    return 1.0

def compute_elo_change(difficulty, extracted, elo_kill_bonus, death_penalty_scale, player_elo):
    if difficulty == "easy":
        return 0
    K = ELO_DIFFICULTY_K.get(difficulty, 5)
    gain_mult = get_gain_multiplier(player_elo)
    if extracted:
        return round((K + elo_kill_bonus) * gain_mult)
    net_loss = max(0, K - elo_kill_bonus)
    return round(-net_loss * death_penalty_scale)

def compute_death_penalty_scale(my_elo, killer_elo=None):
    return get_loss_multiplier(my_elo)

# ── Difficulty settings (mirrors js/game.js) ──────────────────────────────────
DIFFICULTY_LEVELS = {
    "easy":     ["lv1"],
    "advanced": ["lv1", "lv2"],
    "hell":     ["lv1", "lv2", "lv3", "lv4"],
    "chaos":    ["lv2", "lv3", "lv4"],
}

OPERATOR_COUNTS = {
    "easy":     (16, 19),
    "advanced": (16, 19),
    "hell":     (16, 19),
    "chaos":    (36, 39),
}

# ── Simulation ────────────────────────────────────────────────────────────────
def default_stats():
    return {"raids": 0, "kills": 0, "deaths": 0, "extractions": 0, "elo": 1000}

def simulate_game(difficulty, stats_map):
    low, high = OPERATOR_COUNTS[difficulty]
    count = random.randint(low, high)
    levels = DIFFICULTY_LEVELS.get(difficulty, ["lv1", "lv2"])

    eligible = [e for e in ROSTER if e["level"] in levels]
    participants = random.sample(eligible, min(count, len(eligible)))

    # Boss spawns with probability on top of regular count (chaos: 30%, hell: 5%)
    if difficulty == "chaos" and random.random() < 0.30:
        boss_entry = next((e for e in ROSTER if e["level"] == "boss"), None)
        if boss_entry and boss_entry not in participants:
            participants = participants + [boss_entry]
    elif difficulty == "hell" and random.random() < 0.05:
        boss_entry = next((e for e in ROSTER if e["level"] == "boss"), None)
        if boss_entry and boss_entry not in participants:
            participants = participants + [boss_entry]

    for op in participants:
        op_id = op["id"]
        if op_id not in stats_map:
            stats_map[op_id] = default_stats()

        s = stats_map[op_id]
        s["raids"] += 1

        extracted = random.random() < 0.5

        kills = 0
        if extracted:
            kills = random.randint(0, 3)
            elo_kill_bonus = kills * 2
            elo_change = compute_elo_change(difficulty, True, elo_kill_bonus, 1.0, s["elo"])
            s["elo"] = max(0, s["elo"] + elo_change)
            s["extractions"] += 1
            s["kills"] += kills
        else:
            kills = random.randint(0, 1)
            elo_kill_bonus = kills * 2
            death_scale = compute_death_penalty_scale(s["elo"])
            elo_change = compute_elo_change(difficulty, False, elo_kill_bonus, death_scale, s["elo"])
            s["elo"] = max(0, s["elo"] + elo_change)
            s["deaths"] += 1
            s["kills"] += kills

def run_simulations(games_per_difficulty=100):
    stats_map = {}

    for difficulty in ["easy", "advanced", "hell", "chaos"]:
        print(f"Simulating {games_per_difficulty} {difficulty} games...")
        for i in range(games_per_difficulty):
            simulate_game(difficulty, stats_map)

    return stats_map

def stats_map_to_leaderboard_format(stats_map):
    entries = []
    for op in ROSTER:
        op_id = op["id"]
        s = stats_map.get(op_id, default_stats())
        entries.append({
            "username": op["name"],
            "elo": s["elo"],
            "totalRuns": s["raids"],
            "totalExtractions": s["extractions"],
            "totalKills": s["kills"],
            "totalDeaths": s["deaths"],
            "isAI": True,
            "isBoss": op["level"] == "boss",
        })
    return entries

def stats_map_to_server_format(stats_map):
    return [dict(entry, coins=10000) for entry in stats_map_to_leaderboard_format(stats_map)]

if __name__ == "__main__":
    random.seed(42)
    stats_map = run_simulations(100)

    output = {
        "ai_roster_stats_v1": stats_map,
        "leaderboard": stats_map_to_leaderboard_format(stats_map),
        "server_entries": stats_map_to_server_format(stats_map),
    }

    out_path = Path(__file__).parent / "data" / "simulated_ai_stats.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, indent=2), encoding="utf-8")

    print(f"\nResults written to {out_path}")
    print(f"Total operators updated: {len(stats_map)}")

    top10 = sorted(output["leaderboard"], key=lambda e: -e["elo"])[:10]
    print("\nTop 10 by ELO:")
    for i, e in enumerate(top10, 1):
        print(f"  {i}. {e['username']} — ELO: {e['elo']}, Raids: {e['totalRuns']}, Extractions: {e['totalExtractions']}, Kills: {e['totalKills']}")