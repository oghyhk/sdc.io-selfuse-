from __future__ import annotations

import datetime
import json
import math
import re
import time
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import RLock
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / 'data' / 'users.json'
DATA_FILE_BACKUP = ROOT / 'data' / 'users.json.runtime.bak'
DEV_CONFIG_FILE = ROOT / 'data' / 'dev-config.json'
HOST = '0.0.0.0'
PORT = 8765
USERNAME_PATTERN = re.compile(r'^(?:[A-Za-z0-9]|❤(?:️)?)+$')
STORE_LOCK = RLock()

# Cached dev-config — loaded lazily, refreshed on conflict
_cached_dev_config: dict | None = None
_cached_dev_config_mtime: float = 0.0


def _load_dev_config_cached() -> dict:
    global _cached_dev_config, _cached_dev_config_mtime
    try:
        mtime = DEV_CONFIG_FILE.stat().st_mtime
    except OSError:
        mtime = 0
    if _cached_dev_config is None or mtime != _cached_dev_config_mtime:
        try:
            _cached_dev_config = json.loads(DEV_CONFIG_FILE.read_text(encoding='utf-8'))
            _cached_dev_config_mtime = mtime
        except (FileNotFoundError, json.JSONDecodeError):
            _cached_dev_config = {}
    return _cached_dev_config


# White starter loadout (must match STARTER_LOADOUT in profile.js)
_STARTER_LOADOUT = {
    'gunPrimary': 'g17',
    'gunSecondary': None,
    'armor': 'cloth_vest',
    'helmet': 'scout_cap',
    'shoes': 'trail_shoes',
    'backpack': 'sling_pack',
}


def _get_starter_inventory() -> list[dict]:
    """Return 3x white/green/blue equipment items for new players (equipment categories only)."""
    config = _load_dev_config_cached()
    items = config.get('items', {})
    EQUIP_CATS = {'gun', 'armor', 'helmet', 'shoes', 'backpack'}
    starter = []
    for rarity in ('white', 'green', 'blue'):
        for iid, it in items.items():
            if it.get('rarity') == rarity and it.get('category') in EQUIP_CATS:
                for _ in range(3):
                    starter.append({'definitionId': iid})
    return starter


def _default_store() -> dict:
    return {'users': {}, '_version': 0}


def _ensure_store_file() -> None:
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)


def _load_store_file(path: Path) -> dict:
    store = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(store, dict):
        raise ValueError('store must be a dict')
    users = store.get('users')
    if not isinstance(users, dict):
        raise ValueError('store.users must be a dict')
    return store


def _atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f'{path.name}.{uuid.uuid4().hex}.tmp')
    tmp_path.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    tmp_path.replace(path)


def read_store() -> dict:
    with STORE_LOCK:
        _ensure_store_file()
        if not DATA_FILE.exists():
            store = _default_store()
            _atomic_write_json(DATA_FILE, store)
            _atomic_write_json(DATA_FILE_BACKUP, store)
            return store
        try:
            return _load_store_file(DATA_FILE)
        except (json.JSONDecodeError, OSError, ValueError):
            if DATA_FILE_BACKUP.exists():
                try:
                    return _load_store_file(DATA_FILE_BACKUP)
                except (json.JSONDecodeError, OSError, ValueError):
                    pass
            raise RuntimeError(
                f'Both primary store ({DATA_FILE}) and backup ({DATA_FILE_BACKUP}) are unreadable. '
                'Cannot safely load or write user data without risking total data loss. '
                'Restore from git history or a known-good backup before resuming.'
            )


def write_store(store: dict) -> None:
    if not isinstance(store, dict):
        raise ValueError('store must be a dict')
    if 'users' not in store:
        raise ValueError('store must have users key')
    # Prevent wiping users with empty dict
    if not isinstance(store.get('users'), dict):
        raise ValueError('store.users must be a dict')
    with STORE_LOCK:
        store['_version'] = store.get('_version', 0) + 1
        _atomic_write_json(DATA_FILE, store)
        _atomic_write_json(DATA_FILE_BACKUP, store)


def normalize_username_key(username: str) -> str:
    return username.casefold()


HELL_REGEN_MS = 5 * 3600 * 1000   # 5 hours
CHAOS_REGEN_MS = 23 * 3600 * 1000  # 23 hours


def apply_chance_regen(user: dict) -> bool:
    """Process time-based chance regen on the server. Returns True if anything changed."""
    now_ms = int(time.time() * 1000)
    changed = False
    for diff, regen_ms, default_max in (('hell', HELL_REGEN_MS, 12), ('chaos', CHAOS_REGEN_MS, 3)):
        chance_key = f'{diff}Chances'
        max_key = f'{diff}ChanceMax'
        regen_key = f'{diff}ChanceRegenAt'
        max_val = user.get(max_key, default_max)
        current = user.get(chance_key, max_val)
        if current >= max_val:
            if user.get(regen_key, 0) != 0:
                user[regen_key] = 0
                changed = True
            continue
        regen_at = user.get(regen_key, 0) or 0
        if regen_at == 0:
            user[regen_key] = now_ms + regen_ms
            changed = True
            continue
        # Process every full regen interval that has elapsed
        while now_ms >= regen_at and current < max_val:
            current += 1
            regen_at += regen_ms
            changed = True
        user[chance_key] = current
        user[regen_key] = 0 if current >= max_val else regen_at
    return changed


def is_valid_username(username: str) -> bool:
    return bool(USERNAME_PATTERN.fullmatch(username))


def normalize_ai_username(display_name: str) -> str:
    base = display_name.lower().replace('-', '').replace('_', '').replace(' ', '')
    return f'ai_{base}'


def get_ai_users(users: dict) -> dict:
    return {k: v for k, v in users.items() if v.get('isAI', False)}


def get_user_record(users: dict, username: str) -> tuple[str | None, dict | None]:
    normalized = normalize_username_key(username)
    if normalized in users:
        return normalized, users[normalized]

    for key, user in users.items():
        stored_name = str(user.get('username', key))
        if normalize_username_key(stored_name) == normalized or normalize_username_key(key) == normalized:
            return key, user

    return None, None


def build_profile(username: str, password: str, source_profile: dict | None = None, *, is_ai: bool = False) -> dict:
    source_profile = source_profile or {}
    source_stats = source_profile.get('stats') or {}

    # New players get 100k coins + 3x white/green/blue items unless source_profile overrides
    is_new_player = not source_profile
    starter_inventory = _get_starter_inventory() if is_new_player else []
    # Consumables: med_kit x4999 (stash) + field_bandage x9999 (stash) + field_bandage x999 (backpack)
    starter_consumables = [
        {'definitionId': 'med_kit', 'quantity': 4999},
        {'definitionId': 'field_bandage', 'quantity': 9999},
    ] if is_new_player else []
    starter_backpack = [
        {'definitionId': 'field_bandage', 'quantity': 999},
    ] if is_new_player else []

    return {
        'username': username,
        'isGuest': source_profile.get('isGuest', False),
        'isAI': is_ai,
        'coins': source_profile.get('coins', 100_000 if is_new_player else 0),
        'playerExp': source_profile.get('playerExp', 0),
        'elo': source_profile.get('elo', 1000),
        'claimedPlayerLevelRewards': source_profile.get('claimedPlayerLevelRewards', []),
        'loadout': source_profile.get('loadout', dict(_STARTER_LOADOUT) if is_new_player else {}),
        'stashItems': source_profile.get('stashItems', starter_inventory + starter_consumables),
        'stashAmmo': source_profile.get('stashAmmo', {}),
        'backpackItems': source_profile.get('backpackItems', starter_backpack),
        'safeboxItems': source_profile.get('safeboxItems', []),
        'savedLoadouts': source_profile.get('savedLoadouts', []),
        'extractedRuns': source_profile.get('extractedRuns', []),
        'raidHistory': source_profile.get('raidHistory', []),
        'avatarDataUrl': source_profile.get('avatarDataUrl', ''),
        'pinnedAchievements': source_profile.get('pinnedAchievements', []),
        'unlockedAchievements': source_profile.get('unlockedAchievements', ['welcome']),
        'hasCompletedTutorial': source_profile.get('hasCompletedTutorial', False),
        'hellChances': source_profile.get('hellChances', 12),
        'hellChanceMax': source_profile.get('hellChanceMax', 12),
        'hellChanceRegenAt': source_profile.get('hellChanceRegenAt', 0),
        'chaosChances': source_profile.get('chaosChances', 3),
        'chaosChanceMax': source_profile.get('chaosChanceMax', 3),
        'chaosChanceRegenAt': source_profile.get('chaosChanceRegenAt', 0),
        'stats': {
            'totalRuns': source_stats.get('totalRuns', 0),
            'totalExtractions': source_stats.get('totalExtractions', 0),
            'totalKills': source_stats.get('totalKills', 0),
            'totalDeaths': source_stats.get('totalDeaths', 0),
            'totalCoinsEarned': source_stats.get('totalCoinsEarned', 0),
            'totalMarketTrades': source_stats.get('totalMarketTrades', 0),
        },
        'password': password,
    }


LEGACY_AMMO_AMOUNTS = {
    'ammo_white': 1,
    'ammo_green': 2,
    'ammo_blue': 5,
    'ammo_purple': 10,
    'ammo_gold': 100,
    'ammo_red': 25000,
}

MIN_TRADE_TOTAL = 10
AMMO_PACK_LIMIT = 999
SAFEBOX_CAPACITY = 4
BASE_PLAYER_LEVEL_UP_EXP = 10
MAX_PLAYER_LEVEL = 9999
PLAYER_LEVEL_REWARD_INTERVAL = 10
LOADOUT_SLOTS = ('gunPrimary', 'gunSecondary', 'armor', 'helmet', 'shoes', 'backpack')
GUN_LOADOUT_SLOTS = ('gunPrimary', 'gunSecondary')
LOADOUT_SLOT_CATEGORIES = {
    'gunPrimary': 'gun',
    'gunSecondary': 'gun',
    'armor': 'armor',
    'helmet': 'helmet',
    'shoes': 'shoes',
    'backpack': 'backpack',
}
PLAYER_LEVEL_REQUIREMENTS = [BASE_PLAYER_LEVEL_UP_EXP]
PLAYER_LEVEL_TOTAL_EXP = [0]


def _safe_profile(profile: dict, store: dict) -> dict:
    safe = {k: v for k, v in profile.items() if k != 'password'}
    safe['_clientVersion'] = store.get('_version', 0)
    return safe


def _get_item_defs() -> dict:
    config = _load_dev_config_cached()
    items = config.get('items', {})
    return items if isinstance(items, dict) else {}


def _get_player_level_reward_overrides() -> dict:
    config = _load_dev_config_cached()
    rewards = config.get('player_level_rewards', {})
    return rewards if isinstance(rewards, dict) else {}


def _get_item_def(definition_id: str) -> dict | None:
    return _get_item_defs().get(definition_id)


def _get_loadout_slot_category(slot: str) -> str | None:
    return LOADOUT_SLOT_CATEGORIES.get(slot)


def _is_ammo_definition(definition_id: str) -> bool:
    item_def = _get_item_def(definition_id)
    return definition_id in LEGACY_AMMO_AMOUNTS or bool(item_def and item_def.get('lootType') == 'ammo')


def _is_consumable_definition(definition_id: str) -> bool:
    item_def = _get_item_def(definition_id)
    return bool(item_def and item_def.get('category') == 'consumable')


def _is_stackable_definition(definition_id: str) -> bool:
    return _is_ammo_definition(definition_id) or _is_consumable_definition(definition_id)


def _is_free_fallback_ammo(definition_id: str) -> bool:
    return definition_id == 'ammo_white'


def _is_market_locked_ammo(definition_id: str) -> bool:
    return definition_id == 'ammo_white'


def _get_item_value(definition_id: str) -> int:
    item_def = _get_item_def(definition_id) or {}
    return max(0, int(item_def.get('sellValue', 0) or 0))


def _get_buy_trade_total(definition_id: str, quantity: int = 1) -> int:
    item_def = _get_item_def(definition_id) or {}
    amount = max(1, int(quantity or 1))
    buy_tax_percent = min(1000, max(1, int(item_def.get('buyMarketTaxPercent', 10) or 10)))
    return math.ceil(_get_item_value(definition_id) * amount * (1 + (buy_tax_percent / 100)))


def _get_sell_trade_total(definition_id: str, quantity: int = 1) -> int:
    item_def = _get_item_def(definition_id) or {}
    amount = max(1, int(quantity or 1))
    sell_tax_percent = min(99, max(1, int(item_def.get('sellMarketTaxPercent', 10) or 10)))
    return math.floor(_get_item_value(definition_id) * amount * (1 - (sell_tax_percent / 100)))


def _get_entry_space_used(entry: dict | str | None) -> int:
    definition_id = entry.get('definitionId') if isinstance(entry, dict) else entry
    item_def = _get_item_def(definition_id) or {}
    return max(1, int(item_def.get('size', 1) or 1))


def _get_entries_space_used(entries: list[dict] | None) -> int:
    return sum(_get_entry_space_used(entry) for entry in (entries or []))


def _get_backpack_capacity(profile: dict) -> int:
    loadout = profile.get('loadout') or {}
    capacity = 10
    for slot in LOADOUT_SLOTS:
        definition_id = loadout.get(slot)
        item_def = _get_item_def(definition_id) or {}
        modifiers = item_def.get('modifiers') or {}
        capacity += max(0, int(modifiers.get('carrySlots', 0) or 0))
    return capacity


def _get_entry_amount(entry: dict, definition_id: str) -> int:
    if _is_ammo_definition(definition_id):
        base = LEGACY_AMMO_AMOUNTS.get(definition_id) or (_get_item_def(definition_id) or {}).get('ammoAmount') or 1
        return max(1, int(entry.get('quantity', base) or base))
    if _is_consumable_definition(definition_id):
        return max(1, int(entry.get('quantity', 1) or 1))
    return 1


def _pack_stackable_amount(definition_id: str, amount: int) -> list[dict]:
    if not _is_stackable_definition(definition_id):
        return [{'definitionId': definition_id}] if amount > 0 else []
    remaining = max(0, int(amount or 0))
    packed = []
    while remaining > 0:
        quantity = min(AMMO_PACK_LIMIT, remaining)
        packed.append({'definitionId': definition_id, 'quantity': quantity})
        remaining -= quantity
    return packed


def _get_stash_items(profile: dict) -> list[dict]:
    stash_items = profile.get('stashItems') or []
    if not isinstance(stash_items, list):
        stash_items = []
    profile['stashItems'] = stash_items
    return stash_items


def _get_stash_ammo(profile: dict) -> dict:
    stash_ammo = profile.get('stashAmmo') or {}
    if not isinstance(stash_ammo, dict):
        stash_ammo = {}
    profile['stashAmmo'] = stash_ammo
    return stash_ammo


def _get_container(profile: dict, key: str) -> list[dict]:
    entries = profile.get(key) or []
    if not isinstance(entries, list):
        entries = []
    profile[key] = entries
    return entries


def _get_ammo_count(profile: dict, definition_id: str) -> int:
    if _is_free_fallback_ammo(definition_id):
        return 0
    stash_ammo = _get_stash_ammo(profile)
    return max(0, int(stash_ammo.get(definition_id, 0) or 0))


def _add_ammo_to_profile(profile: dict, definition_id: str, amount: int) -> None:
    if not _is_ammo_definition(definition_id) or _is_free_fallback_ammo(definition_id):
        return
    stash_ammo = _get_stash_ammo(profile)
    next_amount = _get_ammo_count(profile, definition_id) + max(0, int(amount or 0))
    if next_amount > 0:
        stash_ammo[definition_id] = next_amount
    else:
        stash_ammo.pop(definition_id, None)


def _remove_ammo_from_profile(profile: dict, definition_id: str, amount: int) -> None:
    if not _is_ammo_definition(definition_id) or _is_free_fallback_ammo(definition_id):
        return
    current = _get_ammo_count(profile, definition_id)
    removal = max(0, int(amount or 0))
    if removal > current:
        raise ValueError('Not enough ammo.')
    stash_ammo = _get_stash_ammo(profile)
    remaining = current - removal
    if remaining > 0:
        stash_ammo[definition_id] = remaining
    else:
        stash_ammo.pop(definition_id, None)


def _add_item_to_stash(profile: dict, definition_id: str, amount: int = 1) -> None:
    quantity = max(1, int(amount or 1))
    if not _get_item_def(definition_id):
        raise ValueError('Item not found.')
    if _is_ammo_definition(definition_id):
        _add_ammo_to_profile(profile, definition_id, quantity)
        return
    stash_items = _get_stash_items(profile)
    for _ in range(quantity):
        stash_items.append({'definitionId': definition_id})


def _remove_single_stash_copy(profile: dict, definition_id: str) -> None:
    stash_items = _get_stash_items(profile)
    for index, entry in enumerate(stash_items):
        if entry.get('definitionId') == definition_id:
            stash_items.pop(index)
            return
    raise ValueError('Item not found in inventory.')


def _get_owned_stash_count(profile: dict, definition_id: str) -> int:
    stash_items = _get_stash_items(profile)
    return sum(1 for entry in stash_items if entry.get('definitionId') == definition_id)


def _get_equipped_count(profile: dict, definition_id: str) -> int:
    loadout = profile.get('loadout') or {}
    return sum(1 for slot in LOADOUT_SLOTS if loadout.get(slot) == definition_id)


def _ensure_profile_stats(profile: dict) -> dict:
    stats = profile.get('stats') or {}
    if not isinstance(stats, dict):
        stats = {}
    profile['stats'] = stats
    stats.setdefault('totalRuns', 0)
    stats.setdefault('totalExtractions', 0)
    stats.setdefault('totalKills', 0)
    stats.setdefault('totalDeaths', 0)
    stats.setdefault('totalCoinsEarned', 0)
    stats.setdefault('totalMarketTrades', 0)
    return stats


def _resolve_gun_slot(profile: dict) -> str:
    loadout = profile.get('loadout') or {}
    for gun_slot in GUN_LOADOUT_SLOTS:
        if not loadout.get(gun_slot):
            return gun_slot
    def item_value(slot: str) -> int:
        return _get_item_value(loadout.get(slot))
    return min(GUN_LOADOUT_SLOTS, key=item_value)


def _normalize_positive_int(value, default: int = 1) -> int:
    return max(1, int(value or default))


def _normalize_non_negative_int(value, default: int = 0) -> int:
    return max(0, int(value or default))


def _normalize_player_exp(total_exp: int = 0) -> int:
    return max(0, int(total_exp or 0))


def _ensure_player_level_curve() -> None:
    if len(PLAYER_LEVEL_TOTAL_EXP) > MAX_PLAYER_LEVEL:
        return
    last_requirement = PLAYER_LEVEL_REQUIREMENTS[0]
    for level in range(len(PLAYER_LEVEL_TOTAL_EXP), MAX_PLAYER_LEVEL + 1):
        previous_level = level - 1
        if previous_level > 0:
            scaled_requirement = math.ceil(last_requirement * 1.03)
            last_requirement = max(last_requirement + 1, scaled_requirement)
            if previous_level >= len(PLAYER_LEVEL_REQUIREMENTS):
                PLAYER_LEVEL_REQUIREMENTS.extend([0] * (previous_level - len(PLAYER_LEVEL_REQUIREMENTS) + 1))
            PLAYER_LEVEL_REQUIREMENTS[previous_level] = last_requirement
        previous_total = PLAYER_LEVEL_TOTAL_EXP[level - 1] if level - 1 < len(PLAYER_LEVEL_TOTAL_EXP) else 0
        previous_requirement = PLAYER_LEVEL_REQUIREMENTS[level - 1] if level - 1 < len(PLAYER_LEVEL_REQUIREMENTS) else 0
        PLAYER_LEVEL_TOTAL_EXP.append(previous_total + previous_requirement)


def _get_player_level(progress_exp: int = 0) -> int:
    _ensure_player_level_curve()
    normalized_exp = _normalize_player_exp(progress_exp)
    low = 0
    high = MAX_PLAYER_LEVEL
    while low < high:
        mid = math.ceil((low + high) / 2)
        if (PLAYER_LEVEL_TOTAL_EXP[mid] if mid < len(PLAYER_LEVEL_TOTAL_EXP) else 0) <= normalized_exp:
            low = mid
        else:
            high = mid - 1
    return min(MAX_PLAYER_LEVEL, low)


def _is_valid_player_level_reward_level(level: int, *, require_interval: bool = True) -> bool:
    normalized_level = int(level or 0)
    if normalized_level <= 0 or normalized_level > MAX_PLAYER_LEVEL:
        return False
    if not require_interval:
        return True
    return normalized_level % PLAYER_LEVEL_REWARD_INTERVAL == 0


def _normalize_player_level_reward_claims(claims) -> list[int]:
    unique_claims = set()
    for level in claims if isinstance(claims, list) else []:
        normalized_level = int(level or 0)
        if _is_valid_player_level_reward_level(normalized_level, require_interval=False):
            unique_claims.add(normalized_level)
    return sorted(unique_claims)


def _create_default_player_level_reward(level: int) -> dict | None:
    normalized_level = int(level or 0)
    if not _is_valid_player_level_reward_level(normalized_level):
        return None
    coins = max(1000, normalized_level * 250)
    return {
        'level': normalized_level,
        'type': 'coins',
        'coins': coins,
        'itemId': '',
        'itemName': '',
        'quantity': 0,
    }


def _get_player_level_reward(level: int) -> dict | None:
    normalized_level = int(level or 0)
    if not _is_valid_player_level_reward_level(normalized_level, require_interval=False):
        return None
    overrides = _get_player_level_reward_overrides()
    override = overrides.get(str(normalized_level)) or overrides.get(normalized_level)
    if isinstance(override, dict) and override.get('enabled') is False:
        return None
    fallback_reward = _create_default_player_level_reward(normalized_level)
    if not fallback_reward and not isinstance(override, dict):
        return None
    item_id = str((override or {}).get('itemId', '') or '').strip() if isinstance(override, dict) else ''
    has_valid_item_reward = bool(item_id and _get_item_def(item_id))
    reward_type = 'item' if isinstance(override, dict) and override.get('type') == 'item' and has_valid_item_reward else 'coins'
    quantity = max(1, int((override or {}).get('quantity', 1) or 1)) if reward_type == 'item' else 0
    coins = max(0, int((override or {}).get('coins', 0) or 0)) if reward_type == 'coins' and isinstance(override, dict) else 0
    if reward_type == 'coins' and coins <= 0:
        coins = fallback_reward['coins'] if fallback_reward else 0
    return {
        'level': normalized_level,
        'type': reward_type,
        'coins': coins if reward_type == 'coins' else 0,
        'itemId': item_id if reward_type == 'item' else '',
        'itemName': (_get_item_def(item_id) or {}).get('name', item_id) if reward_type == 'item' else '',
        'quantity': quantity,
    }


def _get_all_player_level_reward_levels() -> list[int]:
    levels = set(range(PLAYER_LEVEL_REWARD_INTERVAL, MAX_PLAYER_LEVEL + 1, PLAYER_LEVEL_REWARD_INTERVAL))
    for level_key in _get_player_level_reward_overrides().keys():
        normalized_level = int(level_key or 0)
        if _is_valid_player_level_reward_level(normalized_level, require_interval=False):
            levels.add(normalized_level)
    return sorted(levels)


def _get_next_claimable_player_level_reward(profile: dict) -> dict | None:
    current_level = _get_player_level(profile.get('playerExp', 0))
    claimed = set(_normalize_player_level_reward_claims(profile.get('claimedPlayerLevelRewards')))
    for level in _get_all_player_level_reward_levels():
        if level > current_level:
            break
        if level in claimed:
            continue
        reward = _get_player_level_reward(level)
        if reward:
            return reward
    return None


def _get_exp_reward_for_run_summary(summary: dict | None = None) -> int:
    return max(0, int((summary or {}).get('kills', 0) or 0))


class ApiHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        if self.path.startswith('/api/'):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
        super().end_headers()

    def _send_json(self, payload: dict, status: int = HTTPStatus.OK) -> None:
        data = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read_json_body(self) -> dict:
        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length) if length else b'{}'
        if not raw:
            return {}
        return json.loads(raw.decode('utf-8'))

    def log_message(self, format: str, *args):
        super().log_message(format, *args)

    def do_OPTIONS(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith('/api/'):
            self.send_response(HTTPStatus.NO_CONTENT)
            self.end_headers()
            return
        self.send_error(HTTPStatus.NOT_FOUND, 'Endpoint not found.')

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/profile':
            params = parse_qs(parsed.query)
            username = (params.get('username') or [''])[0]
            store = read_store()
            _, user = get_user_record(store.get('users', {}), username)
            if not user:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            safe_user = {k: v for k, v in user.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
            return
        if parsed.path == '/api/health':
            self._send_json({'ok': True})
            return
        if parsed.path == '/api/check-active-raid':
            params = parse_qs(parsed.query)
            username = (params.get('username') or [''])[0]
            store = read_store()
            users = store.get('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            raid = user.get('activeRaid')
            if not raid:
                self._send_json({'ok': True, 'active': False})
                return
            # Check if a raid outcome was already recorded for this raid
            raid_started = raid.get('startedAt', 0)
            history = user.get('raidHistory') or []
            for entry in history[-5:]:
                entry_ts = entry.get('timestamp', 0)
                # If a history entry was recorded after the raid started, it's already completed
                if entry_ts and entry_ts >= raid_started:
                    # Clear stale activeRaid marker
                    user['activeRaid'] = None
                    users[existing_key] = user
                    write_store(store)
                    self._send_json({'ok': True, 'active': False})
                    return
            elapsed = int(time.time() * 1000) - raid_started
            AFK_TIMEOUT_MS = 120_000  # 2 minutes
            expired = elapsed >= AFK_TIMEOUT_MS
            self._send_json({
                'ok': True,
                'active': True,
                'expired': expired,
                'difficulty': raid.get('difficulty', 'advanced'),
                'elapsed': elapsed,
            })
            return
        if parsed.path == '/api/dev-config':
            try:
                config = json.loads(DEV_CONFIG_FILE.read_text(encoding='utf-8'))
                self._send_json({'ok': True, 'config': config})
            except (FileNotFoundError, json.JSONDecodeError) as e:
                self._send_json({'ok': False, 'message': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path == '/api/leaderboard':
            store = read_store()
            users = store.get('users', {})
            entries = []
            params = parse_qs(parsed.query)
            requesting_username = (params.get('username') or [''])[0]
            norm_requesting = normalize_username_key(requesting_username) if requesting_username else None
            player_entry = None
            for _key, user in users.items():
                username = user.get('username', _key)
                elo = int(user.get('elo', 1000))
                stats = user.get('stats') or {}
                entry = {
                    'username': username,
                    'elo': elo,
                    'totalRuns': stats.get('totalRuns', 0),
                    'totalExtractions': stats.get('totalExtractions', 0),
                    'totalKills': stats.get('totalKills', 0),
                    'isAI': user.get('isAI', False),
                    'isBoss': bool(user.get('isBoss', False)),
                }
                if norm_requesting and normalize_username_key(username) == norm_requesting:
                    player_entry = entry
                entries.append(entry)
            entries.sort(key=lambda e: -e['elo'])
            for i, entry in enumerate(entries):
                entry['rank'] = i + 1
            top_entries = entries[:100]
            self._send_json({
                'ok': True,
                'leaderboard': top_entries,
                'total': len(entries),
                'player': player_entry,
            })
            return

        if parsed.path == '/api/ai-roster':
            store = read_store()
            users = store.get('users', {})
            old_ai_roster = store.get('aiRoster', {})
            migrated = 0
            if old_ai_roster and not get_ai_users(users):
                for key, ai_data in old_ai_roster.items():
                    display_name = ai_data.get('username', key)
                    user_key = normalize_username_key(normalize_ai_username(display_name))
                    users[user_key] = build_profile(
                        display_name,
                        f'ai_{user_key}',
                        {
                            'elo': ai_data.get('elo', 1000),
                            'stats': {
                                'totalRuns': ai_data.get('totalRuns', 0),
                                'totalExtractions': ai_data.get('totalExtractions', 0),
                                'totalKills': ai_data.get('totalKills', 0),
                            },
                            'totalDeaths': ai_data.get('totalDeaths', 0),
                        },
                        is_ai=True,
                    )
                    users[user_key]['isBoss'] = ai_data.get('isBoss', False)
                    migrated += 1
                store['users'] = users
                store['aiRoster'] = {}
                write_store(store)
            ai_users = get_ai_users(users)
            self._send_json({'ok': True, 'roster': ai_users, 'migrated': migrated})
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            body = self._read_json_body()
        except json.JSONDecodeError:
            self._send_json({'ok': False, 'message': 'Invalid JSON body.'}, HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == '/api/ai-roster':
            if self.command == 'GET':
                store = read_store()
                users = store.get('users', {})
                old_ai_roster = store.get('aiRoster', {})
                migrated = 0
                if old_ai_roster and not get_ai_users(users):
                    for key, ai_data in old_ai_roster.items():
                        display_name = ai_data.get('username', key)
                        user_key = normalize_username_key(normalize_ai_username(display_name))
                        users[user_key] = build_profile(
                            display_name,
                            f'ai_{user_key}',
                            {
                                'elo': ai_data.get('elo', 1000),
                                'stats': {
                                    'totalRuns': ai_data.get('totalRuns', 0),
                                    'totalExtractions': ai_data.get('totalExtractions', 0),
                                    'totalKills': ai_data.get('totalKills', 0),
                                },
                                'totalDeaths': ai_data.get('totalDeaths', 0),
                            },
                            is_ai=True,
                        )
                        users[user_key]['isBoss'] = ai_data.get('isBoss', False)
                        migrated += 1
                    store['users'] = users
                    store['aiRoster'] = {}
                    write_store(store)
                ai_users = get_ai_users(users)
                self._send_json({'ok': True, 'roster': ai_users, 'migrated': migrated})
                return
            if body.get('clear'):
                store = read_store()
                users = store.get('users', {})
                ai_keys = [k for k, v in users.items() if v.get('isAI', False)]
                for k in ai_keys:
                    del users[k]
                store['users'] = users
                write_store(store)
                self._send_json({'ok': True, 'cleared': len(ai_keys)})
                return
            roster_entries = body.get('entries')
            if not isinstance(roster_entries, list):
                self._send_json({'ok': False, 'message': 'Invalid entries.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.get('users', {})
            saved = 0
            for entry in roster_entries:
                if not isinstance(entry, dict):
                    continue
                display_name = str(entry.get('username', '')).strip()
                if not display_name:
                    continue
                user_key = normalize_username_key(normalize_ai_username(display_name))
                existing = users.get(user_key, {})
                current_stats = existing.get('stats', {})
                users[user_key] = build_profile(
                    display_name,
                    f'ai_{user_key}',
                    {
                        'elo': entry.get('elo', existing.get('elo', 1000)),
                        'coins': entry.get('coins', existing.get('coins', 10000)),
                        'stats': {
                            'totalRuns': entry.get('totalRuns', current_stats.get('totalRuns', 0)),
                            'totalExtractions': entry.get('totalExtractions', current_stats.get('totalExtractions', 0)),
                            'totalKills': entry.get('totalKills', current_stats.get('totalKills', 0)),
                            'totalCoinsEarned': entry.get('totalCoinsEarned', current_stats.get('totalCoinsEarned', 0)),
                            'totalMarketTrades': entry.get('totalMarketTrades', current_stats.get('totalMarketTrades', 0)),
                        },
                    },
                    is_ai=True,
                )
                users[user_key]['isBoss'] = bool(entry.get('isBoss', False))
                saved += 1
            store['users'] = users
            write_store(store)
            self._send_json({'ok': True, 'saved': saved})
            return

        if parsed.path == '/api/ai-roster/batch':
            updates = body.get('updates')
            if not isinstance(updates, list):
                self._send_json({'ok': False, 'message': 'Invalid updates list.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.get('users', {})
            saved = 0
            for upd in updates:
                if not isinstance(upd, dict):
                    continue
                display_name = str(upd.get('username', '')).strip()
                if not display_name:
                    continue
                user_key = normalize_username_key(normalize_ai_username(display_name))
                if user_key not in users or not users[user_key].get('isAI', False):
                    continue
                entry = users[user_key]
                if 'elo' in upd:
                    entry['elo'] = max(0, int(upd['elo']))
                if 'totalRuns' in upd:
                    entry['stats']['totalRuns'] = max(0, int(entry['stats'].get('totalRuns', 0) + upd['totalRuns']))
                if 'totalExtractions' in upd:
                    entry['stats']['totalExtractions'] = max(0, int(entry['stats'].get('totalExtractions', 0) + upd['totalExtractions']))
                if 'totalKills' in upd:
                    entry['stats']['totalKills'] = max(0, int(entry['stats'].get('totalKills', 0) + upd['totalKills']))
                if 'totalDeaths' in upd:
                    entry['stats']['totalDeaths'] = max(0, int(entry['stats'].get('totalDeaths', 0) + upd['totalDeaths']))
                if 'coins' in upd:
                    entry['coins'] = max(0, int(entry.get('coins', 0) + upd['coins']))
                users[user_key] = entry
                saved += 1
            store['users'] = users
            write_store(store)
            self._send_json({'ok': True, 'saved': saved})
            return

        if parsed.path == '/api/auth':
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            if not username or not password:
                self._send_json({'ok': False, 'message': 'Username and password are required.'}, HTTPStatus.BAD_REQUEST)
                return
            if not is_valid_username(username):
                self._send_json({'ok': False, 'message': 'Username may contain only English letters, numbers, and the red heart emoji.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            canonical_key = normalize_username_key(username)
            existing_key, user = get_user_record(users, username)
            if user:
                if user.get('password') != password:
                    self._send_json({'ok': False, 'message': 'Invalid password.'}, HTTPStatus.UNAUTHORIZED)
                    return
                self._send_json({'ok': True, 'created': False, 'profile': _safe_profile(user, store)})
                return

            profile = build_profile(username, password)
            users[canonical_key] = profile
            write_store(store)
            self._send_json({'ok': True, 'created': True, 'profile': _safe_profile(profile, store)}, HTTPStatus.CREATED)
            return

        if parsed.path == '/api/signup':
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            if not username or not password:
                self._send_json({'ok': False, 'message': 'Username and password are required.'}, HTTPStatus.BAD_REQUEST)
                return
            if not is_valid_username(username):
                self._send_json({'ok': False, 'message': 'Username may contain only English letters, numbers, and the red heart emoji.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            canonical_key = normalize_username_key(username)
            _, existing_user = get_user_record(users, username)
            if existing_user:
                self._send_json({'ok': False, 'message': 'Username already exists.'}, HTTPStatus.CONFLICT)
                return
            profile = build_profile(username, password)
            users[canonical_key] = profile
            write_store(store)
            self._send_json({'ok': True, 'profile': _safe_profile(profile, store)})
            return

        if parsed.path == '/api/login':
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            store = read_store()
            users_dict = store.get('users', {})
            existing_key, user = get_user_record(users_dict, username)
            if not user or user.get('password') != password:
                self._send_json({'ok': False, 'message': 'Invalid username or password.'}, HTTPStatus.UNAUTHORIZED)
                return
            if apply_chance_regen(user) and existing_key:
                users_dict[existing_key] = user
                write_store(store)
            self._send_json({'ok': True, 'profile': _safe_profile(user, store)})
            return

        if parsed.path == '/api/profile-action':
            username = str(body.get('username', '')).strip()
            action = str(body.get('action', '')).strip()
            client_version = body.get('_clientVersion')
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            apply_chance_regen(user)
            if client_version is not None and store.get('_version', 0) != client_version:
                self._send_json({
                    'ok': False,
                    'message': 'Conflict: profile was modified by another session. Please reload and try again.',
                    '_conflictVersion': store.get('_version', 0),
                }, HTTPStatus.CONFLICT)
                return

            profile = dict(user)
            extra_payload = {}

            try:
                if action == 'update-loadout':
                    slot = str(body.get('slot', '')).strip()
                    target_slot = _resolve_gun_slot(profile) if slot == 'gun' else slot
                    if target_slot not in LOADOUT_SLOTS:
                        raise ValueError('Invalid loadout slot.')
                    definition_id = body.get('definitionId')
                    loadout = profile.get('loadout') or {}
                    profile['loadout'] = loadout
                    if definition_id is None:
                        loadout[target_slot] = None
                    else:
                        definition_id = str(definition_id).strip()
                        item_def = _get_item_def(definition_id)
                        if not item_def:
                            raise ValueError('Item not found.')
                        if item_def.get('category') != _get_loadout_slot_category(target_slot):
                            raise ValueError('Item cannot be equipped in that slot.')
                        if _get_owned_stash_count(profile, definition_id) <= 0:
                            raise ValueError('You do not own this item.')
                        loadout[target_slot] = definition_id

                elif action == 'claim-player-level-reward':
                    reward = _get_next_claimable_player_level_reward(profile)
                    if not reward:
                        raise ValueError('No player level reward is available to claim.')
                    claimed_levels = set(_normalize_player_level_reward_claims(profile.get('claimedPlayerLevelRewards')))
                    claimed_levels.add(reward['level'])
                    profile['claimedPlayerLevelRewards'] = sorted(claimed_levels)
                    stats = _ensure_profile_stats(profile)
                    if reward['type'] == 'item' and reward['itemId']:
                        _add_item_to_stash(profile, reward['itemId'], reward['quantity'])
                    else:
                        profile['coins'] = _normalize_non_negative_int(profile.get('coins', 0)) + reward['coins']
                        stats['totalCoinsEarned'] = _normalize_non_negative_int(stats.get('totalCoinsEarned', 0)) + reward['coins']
                    extra_payload['reward'] = reward

                elif action == 'move-item-to-safebox':
                    definition_id = str(body.get('definitionId', '')).strip()
                    amount = _normalize_positive_int(body.get('quantity'), 1)
                    if not _get_item_def(definition_id):
                        raise ValueError('Item not found.')
                    safebox = _get_container(profile, 'safeboxItems')
                    current_used_space = _get_entries_space_used(safebox)
                    if _is_consumable_definition(definition_id):
                        raise ValueError('Consumables cannot be stored in the safebox.')
                    if _is_ammo_definition(definition_id):
                        if _is_free_fallback_ammo(definition_id):
                            raise ValueError('Gray ammo is free and unlimited, so it cannot be stored.')
                        available_ammo = _get_ammo_count(profile, definition_id)
                        if amount > available_ammo:
                            raise ValueError(f'You only have {available_ammo} {_get_item_def(definition_id).get("name", definition_id)}.')
                        required_slots = math.ceil(amount / AMMO_PACK_LIMIT)
                        required_space = required_slots * _get_entry_space_used(definition_id)
                        if current_used_space + required_space > SAFEBOX_CAPACITY:
                            raise ValueError('Safebox does not have enough space for that ammo.')
                        _remove_ammo_from_profile(profile, definition_id, amount)
                        safebox.extend(_pack_stackable_amount(definition_id, amount))
                    else:
                        if current_used_space + _get_entry_space_used(definition_id) > SAFEBOX_CAPACITY:
                            raise ValueError('Safebox is full.')
                        owned_count = _get_owned_stash_count(profile, definition_id)
                        movable_count = max(0, owned_count - _get_equipped_count(profile, definition_id))
                        if movable_count <= 0:
                            raise ValueError('No movable copy available.')
                        _remove_single_stash_copy(profile, definition_id)
                        safebox.append({'definitionId': definition_id})

                elif action == 'move-item-to-backpack':
                    definition_id = str(body.get('definitionId', '')).strip()
                    amount = _normalize_positive_int(body.get('quantity'), 1)
                    if not _get_item_def(definition_id):
                        raise ValueError('Item not found.')
                    backpack = _get_container(profile, 'backpackItems')
                    current_used_space = _get_entries_space_used(backpack)
                    capacity = _get_backpack_capacity(profile)
                    if _is_consumable_definition(definition_id):
                        owned_count = _get_owned_stash_count(profile, definition_id)
                        if amount > owned_count:
                            raise ValueError(f'You only have {owned_count} {_get_item_def(definition_id).get("name", definition_id)}.')
                        required_slots = math.ceil(amount / AMMO_PACK_LIMIT)
                        required_space = required_slots * _get_entry_space_used(definition_id)
                        if current_used_space + required_space > capacity:
                            raise ValueError('Backpack does not have enough space for those consumables.')
                        for _ in range(amount):
                            _remove_single_stash_copy(profile, definition_id)
                        backpack.extend(_pack_stackable_amount(definition_id, amount))
                    elif _is_ammo_definition(definition_id):
                        if _is_free_fallback_ammo(definition_id):
                            raise ValueError('Gray ammo is free and unlimited, so it cannot be stored.')
                        available_ammo = _get_ammo_count(profile, definition_id)
                        if amount > available_ammo:
                            raise ValueError(f'You only have {available_ammo} {_get_item_def(definition_id).get("name", definition_id)}.')
                        required_slots = math.ceil(amount / AMMO_PACK_LIMIT)
                        required_space = required_slots * _get_entry_space_used(definition_id)
                        if current_used_space + required_space > capacity:
                            raise ValueError('Backpack does not have enough space for that ammo.')
                        _remove_ammo_from_profile(profile, definition_id, amount)
                        backpack.extend(_pack_stackable_amount(definition_id, amount))
                    else:
                        if current_used_space + _get_entry_space_used(definition_id) > capacity:
                            raise ValueError('Backpack is full.')
                        owned_count = _get_owned_stash_count(profile, definition_id)
                        movable_count = max(0, owned_count - _get_equipped_count(profile, definition_id))
                        if movable_count <= 0:
                            raise ValueError('No movable copy available.')
                        _remove_single_stash_copy(profile, definition_id)
                        backpack.append({'definitionId': definition_id})

                elif action in ('move-backpack-item-to-stash', 'move-safebox-item-to-stash'):
                    container_key = 'backpackItems' if action == 'move-backpack-item-to-stash' else 'safeboxItems'
                    definition_id = str(body.get('definitionId', '')).strip()
                    container = _get_container(profile, container_key)
                    entry_index = body.get('entryIndex')
                    if entry_index is None:
                        resolved_index = next((index for index, entry in enumerate(container) if entry.get('definitionId') == definition_id), -1)
                    else:
                        resolved_index = int(entry_index)
                    if resolved_index < 0 or resolved_index >= len(container):
                        raise ValueError(f'Item not found in {"backpack" if container_key == "backpackItems" else "safebox"}.')
                    entry = container.pop(resolved_index)
                    definition_id = entry.get('definitionId')
                    if not _get_item_def(definition_id):
                        raise ValueError('Item not found.')
                    _add_item_to_stash(profile, definition_id, _get_entry_amount(entry, definition_id))

                elif action == 'buy-item':
                    definition_id = str(body.get('definitionId', '')).strip()
                    amount = _normalize_positive_int(body.get('quantity'), 1)
                    if not _get_item_def(definition_id):
                        raise ValueError('Item not found.')
                    if _is_market_locked_ammo(definition_id):
                        raise ValueError('Gray ammo cannot be traded in the market.')
                    total_cost = _get_buy_trade_total(definition_id, amount)
                    if total_cost < MIN_TRADE_TOTAL:
                        raise ValueError(f'Trades must be at least {MIN_TRADE_TOTAL} coins.')
                    coins = _normalize_non_negative_int(profile.get('coins', 0))
                    if coins < total_cost:
                        raise ValueError('Not enough coins.')
                    profile['coins'] = coins - total_cost
                    _add_item_to_stash(profile, definition_id, amount)
                    stats = _ensure_profile_stats(profile)
                    stats['totalMarketTrades'] = _normalize_non_negative_int(stats.get('totalMarketTrades', 0)) + amount

                elif action == 'sell-item':
                    definition_id = str(body.get('definitionId', '')).strip()
                    amount = _normalize_positive_int(body.get('quantity'), 1)
                    if not _get_item_def(definition_id):
                        raise ValueError('Item not found.')
                    if _is_market_locked_ammo(definition_id):
                        raise ValueError('Gray ammo cannot be traded in the market.')
                    owned_count = _get_ammo_count(profile, definition_id) if _is_ammo_definition(definition_id) else _get_owned_stash_count(profile, definition_id)
                    equipped_count = _get_equipped_count(profile, definition_id)
                    if owned_count <= 0:
                        raise ValueError('You do not own this item.')
                    sellable_count = owned_count if _is_ammo_definition(definition_id) else max(0, owned_count - equipped_count)
                    if sellable_count <= 0:
                        raise ValueError('Equip another item first.')
                    if amount > sellable_count:
                        raise ValueError(f'You can sell at most {sellable_count}.')
                    total_value = _get_sell_trade_total(definition_id, amount)
                    if total_value < MIN_TRADE_TOTAL:
                        raise ValueError(f'Trades must be at least {MIN_TRADE_TOTAL} coins.')
                    if _is_ammo_definition(definition_id):
                        _remove_ammo_from_profile(profile, definition_id, amount)
                    else:
                        for _ in range(amount):
                            _remove_single_stash_copy(profile, definition_id)
                    profile['coins'] = _normalize_non_negative_int(profile.get('coins', 0)) + total_value
                    stats = _ensure_profile_stats(profile)
                    stats['totalCoinsEarned'] = _normalize_non_negative_int(stats.get('totalCoinsEarned', 0)) + total_value
                    stats['totalMarketTrades'] = _normalize_non_negative_int(stats.get('totalMarketTrades', 0)) + amount

                elif action == 'redeem-code':
                    code = str(body.get('code', '')).strip()
                    granted = 0
                    if code == 'oghyhk':
                        granted = 10000
                    elif code == '2598':
                        granted = _normalize_non_negative_int(body.get('amount'), 0)
                    else:
                        raise ValueError('Invalid redeem code.')
                    profile['coins'] = _normalize_non_negative_int(profile.get('coins', 0)) + granted
                    stats = _ensure_profile_stats(profile)
                    stats['totalCoinsEarned'] = _normalize_non_negative_int(stats.get('totalCoinsEarned', 0)) + granted
                    extra_payload['coinsGranted'] = granted

                else:
                    self._send_json({'ok': False, 'message': 'Invalid profile action.'}, HTTPStatus.BAD_REQUEST)
                    return

            except ValueError as error:
                self._send_json({'ok': False, 'message': str(error)}, HTTPStatus.BAD_REQUEST)
                return

            users[existing_key] = profile
            write_store(store)
            self._send_json({'ok': True, 'profile': _safe_profile(profile, store), **extra_payload})
            return

        if parsed.path == '/api/save-profile':
            username = str(body.get('username', '')).strip()
            profile = body.get('profile') or {}
            client_version = body.get('_clientVersion')
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            apply_chance_regen(user)
            if client_version is not None and store.get('_version', 0) != client_version:
                self._send_json({
                    'ok': False,
                    'message': 'Conflict: profile was modified by another session. Please reload and try again.',
                    '_conflictVersion': store.get('_version', 0),
                }, HTTPStatus.CONFLICT)
                return
            # Protect server-authoritative fields from client manipulation
            SERVER_FIELDS = {
                'coins', 'elo', 'playerExp',
                'hellChances', 'hellChanceMax', 'hellChanceRegenAt',
                'chaosChances', 'chaosChanceMax', 'chaosChanceRegenAt',
                'loadout',
                'stashItems', 'stashAmmo', 'backpackItems', 'safeboxItems',
                'claimedPlayerLevelRewards',
                'extractedRuns', 'raidHistory', 'stats',
                'activeRaid',
            }
            # Safe merge: start from server data, overlay client changes
            # This prevents client from wiping fields it doesn't send
            merged = dict(user)
            for key, val in profile.items():
                if key in ('password', 'username'):
                    continue
                if key in SERVER_FIELDS:
                    continue  # server-authoritative, never accept client value
                if key == 'hasCompletedTutorial':
                    # Can only go false→true
                    if val or not user.get('hasCompletedTutorial'):
                        merged[key] = val
                    continue
                # For list fields, keep the larger list (server has full data, client may have partial)
                if key in ('stashItems', 'backpackItems', 'safeboxItems', 'savedLoadouts',
                           'extractedRuns', 'raidHistory', 'pinnedAchievements', 'unlockedAchievements',
                           'claimedPlayerLevelRewards'):
                    server_list = user.get(key) or []
                    client_list = val if isinstance(val, list) else []
                    if len(client_list) >= len(server_list):
                        merged[key] = client_list
                    # else: keep server's larger list
                    continue
                # Other fields: accept client value
                merged[key] = val
            merged['password'] = user.get('password', '')
            merged['username'] = user.get('username', username)
            profile = merged
            users[existing_key] = profile
            write_store(store)
            safe_user = {k: v for k, v in profile.items() if k != 'password'}
            safe_user['_clientVersion'] = store.get('_version', 0)
            self._send_json({'ok': True, 'profile': safe_user})
            return

        if parsed.path == '/api/raid-outcome':
            # Server-authoritative: apply raid outcome (coins, stats, elo, items)
            username = str(body.get('username', '')).strip()
            result = body.get('result') or {}
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            # Skip if no active raid (prevents duplicate outcomes)
            if not user.get('activeRaid'):
                safe = {k: v for k, v in user.items() if k != 'password'}
                self._send_json({'ok': True, 'profile': safe, 'skipped': True})
                return
            profile = dict(user)  # work on a copy
            status = result.get('status', '')
            summary = result.get('summary') or {}
            difficulty = result.get('difficulty', 'advanced')
            # Update stats
            stats = profile.get('stats') or {}
            stats['totalRuns'] = stats.get('totalRuns', 0) + 1
            kills = int(summary.get('kills', 0) or 0)
            stats['totalKills'] = stats.get('totalKills', 0) + kills
            profile['playerExp'] = _normalize_player_exp(profile.get('playerExp', 0)) + _get_exp_reward_for_run_summary(summary)
            if status == 'extracted':
                stats['totalExtractions'] = stats.get('totalExtractions', 0) + 1
                # Add extracted items
                extracted_items = summary.get('items') or []
                for item in extracted_items:
                    if item and item.get('definitionId'):
                        definition_id = item['definitionId']
                        _add_item_to_stash(profile, definition_id, _get_entry_amount(item, definition_id))
                extracted_runs = list(profile.get('extractedRuns') or [])
                extracted_runs.insert(0, {
                    'id': f'{int(time.time() * 1000)}-{uuid.uuid4().hex[:4]}',
                    'createdAt': summary.get('createdAt') or datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
                    **summary,
                })
                profile['extractedRuns'] = extracted_runs[:20]
                # Add coins from extraction
                loot_value = int(summary.get('lootValue', 0) or 0)
                profile['coins'] = profile.get('coins', 0) + loot_value
                stats['totalCoinsEarned'] = stats.get('totalCoinsEarned', 0) + loot_value
            elif status == 'dead':
                stats['totalDeaths'] = stats.get('totalDeaths', 0) + 1
                # Apply death coin loss
                death_loss = int(summary.get('deathCoinLoss', 0) or 0)
                profile['coins'] = max(0, profile.get('coins', 0) - death_loss)
                for definition_id in summary.get('deathLosses') or []:
                    if not _get_item_def(definition_id):
                        continue
                    try:
                        _remove_single_stash_copy(profile, definition_id)
                    except ValueError:
                        continue
            # Apply ELO (skip for easy difficulty)
            # Use pre-raid ELO to prevent double-application from concurrent client save
            active_raid = user.get('activeRaid') or {}
            current_elo = int(active_raid.get('preRaidElo', profile.get('elo', 1000)))
            # ELO kill bonus is awarded ONLY for operator (player-like AI) kills,
            # not for regular AI enemy mobs. This must match the client formula
            # in computeEloChange() exactly to avoid client/server mismatch.
            operator_kills = int(summary.get('operatorKills', 0) or 0)
            if difficulty == 'easy':
                elo_change = 0
            else:
                ELO_K = {'advanced': 5, 'hell': 12, 'chaos': 30}
                KILL_MULT = {'advanced': 1, 'hell': 2, 'chaos': 4}
                K = ELO_K.get(difficulty, 5)
                diff_mult = KILL_MULT.get(difficulty, 1)
                per_kill = 8
                kill_bonus = per_kill * operator_kills * diff_mult
                is_win = status == 'extracted'
                # Gain/loss multipliers based on pre-raid ELO bracket
                gain_mult = 1
                loss_mult = 1
                if current_elo <= 900: gain_mult = 3
                elif current_elo <= 1200: gain_mult = 2
                if current_elo >= 2401: loss_mult = 5
                elif current_elo >= 2101: loss_mult = 3
                elif current_elo >= 1801: loss_mult = 2
                if is_win:
                    elo_change = round((K + kill_bonus) * gain_mult)
                else:
                    death_penalty = float(summary.get('deathPenaltyScale', 1.0) or 1.0)
                    net_loss = max(0, K - kill_bonus)
                    elo_change = round(-net_loss * loss_mult * death_penalty)
            profile['elo'] = max(0, int(current_elo + elo_change))
            # Update safebox/backpack
            profile['safeboxItems'] = result.get('safeboxItems') or profile.get('safeboxItems') or []
            profile['backpackItems'] = []
            # Raid history — include value fields so netValue computes correctly
            value_extracted = int(summary.get('valueExtracted', 0) or 0)
            lost_value = int(summary.get('lostValue', 0) or 0)
            # Compute duration server-side from activeRaid.startedAt
            raid_started_at = active_raid.get('startedAt')
            now_ms = int(time.time() * 1000)
            raid_duration = max(0.0, (now_ms - raid_started_at) / 1000) if raid_started_at else float(summary.get('duration', 0) or 0)
            raid_dur_mins = int(raid_duration // 60)
            raid_dur_secs = int(raid_duration % 60)
            raid_duration_label = f'{raid_dur_mins:02d}:{raid_dur_secs:02d}'
            raid_created_at = datetime.datetime.fromtimestamp(raid_started_at / 1000, tz=datetime.timezone.utc).isoformat().replace('+00:00', 'Z') if raid_started_at else datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
            history = list(profile.get('raidHistory') or [])
            history.append({
                'status': status,
                'difficulty': difficulty,
                'kills': kills,
                'operatorKills': int(summary.get('operatorKills', 0) or 0),
                'aiEnemyKills': int(summary.get('aiEnemyKills', 0) or 0),
                'duration': raid_duration,
                'durationLabel': raid_duration_label,
                'elo': profile['elo'],
                'coins': profile['coins'],
                'items': summary.get('items') or [],
                'timestamp': now_ms,
                'createdAt': raid_created_at,
                'valueExtracted': value_extracted,
                'lostValue': lost_value,
                'netValue': value_extracted - lost_value if status == 'extracted' else -lost_value,
            })
            profile['raidHistory'] = history[-100:]  # keep last 100
            # Clear active raid marker
            profile['activeRaid'] = None
            # Preserve password/username
            profile['password'] = user.get('password', '')
            profile['username'] = user.get('username', username)
            users[existing_key] = profile
            write_store(store)
            self._send_json({'ok': True, 'profile': _safe_profile(profile, store)})
            return

        if parsed.path == '/api/enter-raid':
            # Mark a raid as active (called right before game starts)
            username = str(body.get('username', '')).strip()
            difficulty = str(body.get('difficulty', '')).strip()
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            user['activeRaid'] = {
                'difficulty': difficulty,
                'startedAt': int(time.time() * 1000),
                'preRaidElo': int(user.get('elo', 1000)),
            }
            users[existing_key] = user
            write_store(store)
            self._send_json({'ok': True})
            return

        if parsed.path == '/api/start-raid':
            # Server-authoritative: deduct raid chance for hell/chaos
            username = str(body.get('username', '')).strip()
            difficulty = str(body.get('difficulty', '')).strip()
            if difficulty not in ('hell', 'chaos'):
                self._send_json({'ok': True})  # no chance needed
                return
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            apply_chance_regen(user)
            chance_key = f'{difficulty}Chances'
            max_key = f'{difficulty}ChanceMax'
            regen_key = f'{difficulty}ChanceRegenAt'
            max_val = user.get(max_key, 12 if difficulty == 'hell' else 3)
            # Default to max for profiles that predate the chance system
            current = user.get(chance_key, max_val)
            if current <= 0:
                self._send_json({'ok': False, 'message': f'No {difficulty.title()} chances remaining.'}, HTTPStatus.FORBIDDEN)
                return
            user[chance_key] = current - 1
            if user.get(regen_key, 0) == 0:
                regen_ms = 5 * 3600 * 1000 if difficulty == 'hell' else 23 * 3600 * 1000
                user[regen_key] = int(time.time() * 1000) + regen_ms
            users[existing_key] = user
            write_store(store)
            safe = {k: v for k, v in user.items() if k != 'password'}
            safe['_clientVersion'] = store.get('_version', 0)
            self._send_json({'ok': True, 'profile': safe})
            return

        if parsed.path == '/api/complete-raid':
            # Server-authoritative: refund chance on successful extraction
            username = str(body.get('username', '')).strip()
            difficulty = str(body.get('difficulty', '')).strip()
            status = str(body.get('status', '')).strip()
            if difficulty not in ('hell', 'chaos') or status != 'extracted':
                self._send_json({'ok': True})  # no refund needed
                return
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            apply_chance_regen(user)
            chance_key = f'{difficulty}Chances'
            max_key = f'{difficulty}ChanceMax'
            max_val = user.get(max_key, 12 if difficulty == 'hell' else 3)
            user[chance_key] = min(user.get(chance_key, max_val) + 1, max_val)
            if user.get(chance_key, 0) >= max_val:
                user[f'{difficulty}ChanceRegenAt'] = 0
            users[existing_key] = user
            write_store(store)
            safe = {k: v for k, v in user.items() if k != 'password'}
            safe['_clientVersion'] = store.get('_version', 0)
            self._send_json({'ok': True, 'profile': safe})
            return

        if parsed.path == '/api/buy-chance':
            # Server-authoritative: buy a raid chance with coins
            username = str(body.get('username', '')).strip()
            difficulty = str(body.get('difficulty', '')).strip()
            if difficulty not in ('hell', 'chaos'):
                self._send_json({'ok': False, 'message': 'Invalid difficulty.'}, HTTPStatus.BAD_REQUEST)
                return
            cost = 150000 if difficulty == 'hell' else 1280000
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            apply_chance_regen(user)
            chance_key = f'{difficulty}Chances'
            max_key = f'{difficulty}ChanceMax'
            max_val = user.get(max_key, 12 if difficulty == 'hell' else 3)
            if user.get(chance_key, 0) >= max_val:
                self._send_json({'ok': False, 'message': 'Already at max chances.'}, HTTPStatus.BAD_REQUEST)
                return
            coins = user.get('coins', 0)
            if coins < cost:
                self._send_json({'ok': False, 'message': f'Not enough coins. Need {cost}.'}, HTTPStatus.BAD_REQUEST)
                return
            user['coins'] = coins - cost
            user[chance_key] = user.get(chance_key, 0) + 1
            if user.get(chance_key, 0) >= max_val:
                user[f'{difficulty}ChanceRegenAt'] = 0
            users[existing_key] = user
            write_store(store)
            safe = {k: v for k, v in user.items() if k != 'password'}
            safe['_clientVersion'] = store.get('_version', 0)
            self._send_json({'ok': True, 'profile': safe})
            return

        if parsed.path == '/api/change-password':
            username = str(body.get('username', '')).strip()
            current_pw = str(body.get('currentPassword', ''))
            new_pw = str(body.get('newPassword', ''))
            if not username or not current_pw or not new_pw:
                self._send_json({'ok': False, 'message': 'All fields are required.'}, HTTPStatus.BAD_REQUEST)
                return
            if len(new_pw) < 3:
                self._send_json({'ok': False, 'message': 'Password must be at least 3 characters.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            if user.get('password', '') != current_pw:
                self._send_json({'ok': False, 'message': 'Current password is incorrect.'}, HTTPStatus.UNAUTHORIZED)
                return
            user['password'] = new_pw
            users[existing_key] = user
            write_store(store)
            safe_user = {k: v for k, v in user.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
            return

        if parsed.path == '/api/unlock-achievement':
            username = str(body.get('username', '')).strip()
            achievement_id = str(body.get('achievementId', '')).strip()
            if not username or not achievement_id:
                self._send_json({'ok': False, 'message': 'username and achievementId required.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            unlocked = user.get('unlockedAchievements', [])
            if not isinstance(unlocked, list):
                unlocked = []
            if achievement_id not in unlocked:
                unlocked.append(achievement_id)
                user['unlockedAchievements'] = unlocked
                users[existing_key] = user
                write_store(store)
            safe_user = {k: v for k, v in user.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
            return

        if parsed.path == '/api/lock-achievement':
            username = str(body.get('username', '')).strip()
            achievement_id = str(body.get('achievementId', '')).strip()
            if not username or not achievement_id:
                self._send_json({'ok': False, 'message': 'username and achievementId required.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            unlocked = user.get('unlockedAchievements', [])
            if achievement_id in unlocked:
                unlocked.remove(achievement_id)
                user['unlockedAchievements'] = unlocked
                users[existing_key] = user
                write_store(store)
            safe_user = {k: v for k, v in user.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
            return

        if parsed.path == '/api/dev-config':
            config = body.get('config') or body
            if not config:
                self._send_json({'ok': False, 'message': 'No config data provided.'}, HTTPStatus.BAD_REQUEST)
                return
            try:
                DEV_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
                DEV_CONFIG_FILE.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding='utf-8')
                self._send_json({'ok': True, 'message': 'Config saved.'})
            except Exception as e:
                self._send_json({'ok': False, 'message': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path == '/api/generate-image':
            # Proxy to Cloudflare Workers AI image gen
            prompt = str(body.get('prompt', '')).strip()
            if not prompt:
                self._send_json({'ok': False, 'message': 'No prompt provided.'}, HTTPStatus.BAD_REQUEST)
                return
            try:
                import urllib.request
                img_req = urllib.request.Request(
                    'https://hermesimggen.oghyhk.workers.dev/',
                    data=json.dumps({
                        'prompt': prompt,
                        'width': int(body.get('width', 256)),
                        'height': int(body.get('height', 256))
                    }).encode('utf-8'),
                    headers={
                        'Authorization': 'Bearer 2598',
                        'Content-Type': 'application/json'
                    },
                    method='POST'
                )
                with urllib.request.urlopen(img_req, timeout=60) as resp:
                    img_data = resp.read()
                # Save to assets/dev/
                import base64, os
                item_id = str(body.get('itemId', 'unknown'))
                safe_id = re.sub(r'[^a-zA-Z0-9_]', '_', item_id)
                out_dir = ROOT / 'assets' / 'dev'
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / f'{safe_id}.jpg'
                out_path.write_bytes(img_data)
                self._send_json({'ok': True, 'path': f'/assets/dev/{safe_id}.jpg', 'size': len(img_data)})
            except Exception as e:
                self._send_json({'ok': False, 'message': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        if parsed.path == '/api/upload-image':
            # Accept base64-encoded image data and save to assets/dev/
            import base64, os
            image_data = str(body.get('data', '')).strip()
            filename = str(body.get('filename', 'upload.png')).strip()
            item_id = str(body.get('itemId', 'unknown')).strip()
            if not image_data:
                self._send_json({'ok': False, 'message': 'No image data provided.'}, HTTPStatus.BAD_REQUEST)
                return
            try:
                # Handle data URL prefix (e.g., "data:image/png;base64,...")
                if ',' in image_data:
                    image_data = image_data.split(',', 1)[1]
                img_bytes = base64.b64decode(image_data)
                safe_id = re.sub(r'[^a-zA-Z0-9_]', '_', item_id)
                ext = os.path.splitext(filename)[1] or '.png'
                if ext.lower() not in ('.png', '.jpg', '.jpeg', '.gif', '.webp'):
                    ext = '.png'
                out_dir = ROOT / 'assets' / 'dev'
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / f'{safe_id}{ext}'
                out_path.write_bytes(img_bytes)
                self._send_json({'ok': True, 'path': f'/assets/dev/{safe_id}{ext}', 'size': len(img_bytes)})
            except Exception as e:
                self._send_json({'ok': False, 'message': str(e)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return

        # ─── Mail System ──────────────────────────
        MAIL_EXPIRE_MS = 24 * 60 * 60 * 1000   # 24 hours — rewards unclaimable after this
        MAIL_DELETE_MS = 48 * 60 * 60 * 1000   # 48 hours — auto-delete after claim or expiry

        def _clean_mail(user):
            """Remove mail that has fully passed its lifecycle. Returns True if changes made."""
            now_ms = int(time.time() * 1000)
            mail = user.get('mail', [])
            active = []
            changed = False
            for m in mail:
                # Auto-expire unclaimed mail past 24h
                if not m.get('expiredAt') and not m.get('claimedAt') and (now_ms - m['createdAt']) > MAIL_EXPIRE_MS:
                    m['expiredAt'] = now_ms
                    changed = True
                # Determine deletion reference time (whichever happened last: claim or expiry)
                ref_time = max(m.get('claimedAt') or 0, m.get('expiredAt') or 0)
                if ref_time and (now_ms - ref_time) > MAIL_DELETE_MS:
                    changed = True  # drop it
                    continue
                active.append(m)
            if changed:
                user['mail'] = active
            return changed

        if parsed.path == '/api/mail':
            username = str(body.get('username', '')).strip()
            if not username:
                self._send_json({'ok': False, 'message': 'Username required.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            changed = _clean_mail(user)
            if changed:
                users[existing_key] = user
                write_store(store)
            safe_mail = [{k: v for k, v in m.items()} for m in user.get('mail', [])]
            self._send_json({'ok': True, 'mail': safe_mail})
            return

        if parsed.path == '/api/mail/claim':
            username = str(body.get('username', '')).strip()
            mail_id = str(body.get('mailId', '')).strip()
            if not username or not mail_id:
                self._send_json({'ok': False, 'message': 'Username and mailId required.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            now_ms = int(time.time() * 1000)
            mail = user.get('mail', [])
            found = False
            for m in mail:
                if m.get('id') == mail_id:
                    if m.get('claimedAt'):
                        self._send_json({'ok': False, 'message': 'Rewards already claimed.'}, HTTPStatus.BAD_REQUEST)
                        return
                    if m.get('expiredAt') or (now_ms - m['createdAt']) > MAIL_EXPIRE_MS:
                        self._send_json({'ok': False, 'message': 'This mail has expired. Rewards can no longer be claimed.'}, HTTPStatus.BAD_REQUEST)
                        return
                    # Add rewards to profile
                    for reward in m.get('rewards', []):
                        did = reward.get('definitionId', '')
                        qty = int(reward.get('quantity', 1))
                        if not did:
                            continue
                        if did == 'coins' or did == 'coin':
                            user['coins'] = int(user.get('coins', 0)) + qty
                        else:
                            stash = user.get('stashItems', [])
                            for _ in range(max(1, qty)):
                                stash.append({'definitionId': did})
                            user['stashItems'] = stash
                    m['claimedAt'] = now_ms
                    found = True
                    break
            if not found:
                self._send_json({'ok': False, 'message': 'Mail not found.'}, HTTPStatus.NOT_FOUND)
                return
            users[existing_key] = user
            write_store(store)
            safe_user = {k: v for k, v in user.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
            return

        if parsed.path == '/api/mail/send':
            # Dev/admin: send mail to a player
            username = str(body.get('username', '')).strip()
            title = str(body.get('title', '')).strip()
            content = str(body.get('content', '')).strip()
            rewards = body.get('rewards', [])
            if not username or not title:
                self._send_json({'ok': False, 'message': 'Username and title required.'}, HTTPStatus.BAD_REQUEST)
                return
            if len(rewards) > 5:
                self._send_json({'ok': False, 'message': 'Max 5 rewards per mail.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            mail_entry = {
                'id': f'mail_{uuid.uuid4().hex[:12]}',
                'title': title,
                'content': content,
                'rewards': [{'definitionId': str(r.get('definitionId', '')), 'quantity': int(r.get('quantity', 1))} for r in rewards if r.get('definitionId')],
                'createdAt': int(time.time() * 1000),
                'claimedAt': None,
                'expiredAt': None,
            }
            mail = user.get('mail', [])
            mail.append(mail_entry)
            user['mail'] = mail
            users[existing_key] = user
            write_store(store)
            self._send_json({'ok': True, 'mailId': mail_entry['id']})
            return

        self._send_json({'ok': False, 'message': 'Endpoint not found.'}, HTTPStatus.NOT_FOUND)


if __name__ == '__main__':
    # Start WebSocket server in background thread
    from ws_server import start_ws_in_thread, WS_PORT
    start_ws_in_thread()
    print(f'WebSocket server started on ws://{HOST}:{WS_PORT}')

    server = ThreadingHTTPServer((HOST, PORT), ApiHandler)
    print(f'Serving SDC.IO at http://{HOST}:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down...')
    finally:
        server.server_close()
