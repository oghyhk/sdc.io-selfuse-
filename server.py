from __future__ import annotations

import datetime
import json
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
                safe_user = {k: v for k, v in user.items() if k != 'password'}
                safe_user['_clientVersion'] = store.get('_version', 0)
                self._send_json({'ok': True, 'created': False, 'profile': safe_user})
                return

            profile = build_profile(username, password, body.get('profile'))
            users[canonical_key] = profile
            write_store(store)
            safe_user = {k: v for k, v in profile.items() if k != 'password'}
            safe_user['_clientVersion'] = store.get('_version', 0)
            self._send_json({'ok': True, 'created': True, 'profile': safe_user}, HTTPStatus.CREATED)
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
            profile = build_profile(username, password, body.get('profile'))
            users[canonical_key] = profile
            write_store(store)
            safe_user = {k: v for k, v in profile.items() if k != 'password'}
            safe_user['_clientVersion'] = store.get('_version', 0)
            self._send_json({'ok': True, 'profile': safe_user})
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
            safe_user = {k: v for k, v in user.items() if k != 'password'}
            safe_user['_clientVersion'] = store.get('_version', 0)
            self._send_json({'ok': True, 'profile': safe_user})
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
                'coins', 'elo',
                'hellChances', 'hellChanceMax', 'hellChanceRegenAt',
                'chaosChances', 'chaosChanceMax', 'chaosChanceRegenAt',
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
                if key == 'stats':
                    # Merge incrementally — client can add but not reset
                    server_stats = user.get('stats') or {}
                    client_stats = val or {}
                    for sk, sv in client_stats.items():
                        if isinstance(sv, (int, float)) and sv > server_stats.get(sk, 0):
                            merged.setdefault('stats', {})[sk] = sv
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
                # For dict fields (loadout), only accept if client sent non-empty
                if key == 'loadout':
                    if isinstance(val, dict) and any(v for v in val.values() if v):
                        merged[key] = val
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
            if status == 'extracted':
                stats['totalExtractions'] = stats.get('totalExtractions', 0) + 1
                # Add extracted items
                extracted_items = summary.get('items') or []
                stash = list(profile.get('stashItems') or [])
                for item in extracted_items:
                    if item and item.get('definitionId'):
                        stash.append({'definitionId': item['definitionId'], 'quantity': item.get('quantity')})
                profile['stashItems'] = stash
                # Add coins from extraction
                loot_value = int(summary.get('lootValue', 0) or 0)
                profile['coins'] = profile.get('coins', 0) + loot_value
                stats['totalCoinsEarned'] = stats.get('totalCoinsEarned', 0) + loot_value
            elif status == 'dead':
                stats['totalDeaths'] = stats.get('totalDeaths', 0) + 1
                # Apply death coin loss
                death_loss = int(summary.get('deathCoinLoss', 0) or 0)
                profile['coins'] = max(0, profile.get('coins', 0) - death_loss)
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
            safe = {k: v for k, v in profile.items() if k != 'password'}
            safe['_clientVersion'] = store.get('_version', 0)
            self._send_json({'ok': True, 'profile': safe})
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
