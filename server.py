from __future__ import annotations

import json
import re
import time
import uuid
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / 'data' / 'users.json'
DEV_CONFIG_FILE = ROOT / 'data' / 'dev-config.json'
HOST = '0.0.0.0'
PORT = 8765
USERNAME_PATTERN = re.compile(r'^(?:[A-Za-z]|❤(?:️)?)+$')


def read_store() -> dict:
    if not DATA_FILE.exists():
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        DATA_FILE.write_text(json.dumps({'users': {}}, indent=2), encoding='utf-8')
    try:
        return json.loads(DATA_FILE.read_text(encoding='utf-8'))
    except json.JSONDecodeError:
        return {'users': {}}


def write_store(store: dict) -> None:
    DATA_FILE.write_text(json.dumps(store, indent=2), encoding='utf-8')


def normalize_username_key(username: str) -> str:
    return username.casefold()


def is_valid_username(username: str) -> bool:
    return bool(USERNAME_PATTERN.fullmatch(username))


def get_user_record(users: dict, username: str) -> tuple[str | None, dict | None]:
    normalized = normalize_username_key(username)
    if normalized in users:
        return normalized, users[normalized]

    for key, user in users.items():
        stored_name = str(user.get('username', key))
        if normalize_username_key(stored_name) == normalized or normalize_username_key(key) == normalized:
            return key, user

    return None, None


def build_profile(username: str, password: str, source_profile: dict | None = None) -> dict:
    source_profile = source_profile or {}
    source_stats = source_profile.get('stats') or {}
    return {
        'username': username,
        'isGuest': source_profile.get('isGuest', False),
        'coins': source_profile.get('coins', 0),
        'playerExp': source_profile.get('playerExp', 0),
        'elo': source_profile.get('elo', 1000),
        'claimedPlayerLevelRewards': source_profile.get('claimedPlayerLevelRewards', []),
        'loadout': source_profile.get('loadout', {}),
        'stashItems': source_profile.get('stashItems', []),
        'stashAmmo': source_profile.get('stashAmmo', {}),
        'backpackItems': source_profile.get('backpackItems', []),
        'safeboxItems': source_profile.get('safeboxItems', []),
        'savedLoadouts': source_profile.get('savedLoadouts', []),
        'extractedRuns': source_profile.get('extractedRuns', []),
        'raidHistory': source_profile.get('raidHistory', []),
        'stats': {
            'totalRuns': source_stats.get('totalRuns', 0),
            'totalExtractions': source_stats.get('totalExtractions', 0),
            'totalKills': source_stats.get('totalKills', 0),
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
            ai_roster = store.get('aiRoster', {})
            entries = []
            for _key, user in users.items():
                username = user.get('username', _key)
                elo = int(user.get('elo', 1000))
                stats = user.get('stats') or {}
                entries.append({
                    'username': username,
                    'elo': elo,
                    'totalRuns': stats.get('totalRuns', 0),
                    'totalExtractions': stats.get('totalExtractions', 0),
                    'totalKills': stats.get('totalKills', 0),
                    'isAI': False,
                })
            for _key, ai in ai_roster.items():
                entries.append({
                    'username': ai.get('username', _key),
                    'elo': int(ai.get('elo', 1000)),
                    'totalRuns': int(ai.get('totalRuns', 0)),
                    'totalExtractions': int(ai.get('totalExtractions', 0)),
                    'totalKills': int(ai.get('totalKills', 0)),
                    'isAI': True,
                })
            entries.sort(key=lambda e: -e['elo'])
            for i, entry in enumerate(entries):
                entry['rank'] = i + 1
            params = parse_qs(parsed.query)
            requesting_username = (params.get('username') or [''])[0]
            player_entry = None
            if requesting_username:
                norm_name = normalize_username_key(requesting_username)
                player_entry = next(
                    (e for e in entries if normalize_username_key(e['username']) == norm_name),
                    None
                )
            top_entries = entries[:100]
            self._send_json({
                'ok': True,
                'leaderboard': top_entries,
                'total': len(entries),
                'player': player_entry,
            })
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
            roster_entries = body.get('entries')
            if not isinstance(roster_entries, list):
                self._send_json({'ok': False, 'message': 'Invalid entries.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            ai_roster = store.get('aiRoster', {})
            for entry in roster_entries:
                if not isinstance(entry, dict):
                    continue
                name = str(entry.get('username', '')).strip()
                if not name:
                    continue
                key = normalize_username_key(name)
                ai_roster[key] = {
                    'username': name,
                    'elo': int(entry.get('elo', 1000)),
                    'totalRuns': int(entry.get('totalRuns', 0)),
                    'totalExtractions': int(entry.get('totalExtractions', 0)),
                    'totalKills': int(entry.get('totalKills', 0)),
                    'isAI': True,
                }
            store['aiRoster'] = ai_roster
            write_store(store)
            self._send_json({'ok': True, 'saved': len(roster_entries)})
            return

        if parsed.path == '/api/auth':
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            if not username or not password:
                self._send_json({'ok': False, 'message': 'Username and password are required.'}, HTTPStatus.BAD_REQUEST)
                return
            if not is_valid_username(username):
                self._send_json({'ok': False, 'message': 'Username may contain only English letters and the red heart emoji.'}, HTTPStatus.BAD_REQUEST)
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
                self._send_json({'ok': True, 'created': False, 'profile': safe_user})
                return

            profile = build_profile(username, password, body.get('profile'))
            users[canonical_key] = profile
            write_store(store)
            safe_user = {k: v for k, v in profile.items() if k != 'password'}
            self._send_json({'ok': True, 'created': True, 'profile': safe_user}, HTTPStatus.CREATED)
            return

        if parsed.path == '/api/signup':
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            if not username or not password:
                self._send_json({'ok': False, 'message': 'Username and password are required.'}, HTTPStatus.BAD_REQUEST)
                return
            if not is_valid_username(username):
                self._send_json({'ok': False, 'message': 'Username may contain only English letters and the red heart emoji.'}, HTTPStatus.BAD_REQUEST)
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
            self._send_json({'ok': True, 'profile': safe_user})
            return

        if parsed.path == '/api/login':
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            store = read_store()
            _, user = get_user_record(store.get('users', {}), username)
            if not user or user.get('password') != password:
                self._send_json({'ok': False, 'message': 'Invalid username or password.'}, HTTPStatus.UNAUTHORIZED)
                return
            safe_user = {k: v for k, v in user.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
            return

        if parsed.path == '/api/save-profile':
            username = str(body.get('username', '')).strip()
            profile = body.get('profile') or {}
            store = read_store()
            users = store.setdefault('users', {})
            existing_key, user = get_user_record(users, username)
            if not user or not existing_key:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            profile['password'] = user.get('password', '')
            profile['username'] = user.get('username', username)
            users[existing_key] = profile
            write_store(store)
            safe_user = {k: v for k, v in profile.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
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
    server = ThreadingHTTPServer((HOST, PORT), ApiHandler)
    print(f'Serving SDC.IO at http://{HOST}:{PORT}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down...')
    finally:
        server.server_close()
