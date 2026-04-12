from __future__ import annotations

import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / 'data' / 'users.json'
HOST = '127.0.0.1'
PORT = 8765


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


class ApiHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

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

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/profile':
            params = parse_qs(parsed.query)
            username = (params.get('username') or [''])[0]
            store = read_store()
            user = store.get('users', {}).get(username)
            if not user:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            safe_user = {k: v for k, v in user.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
            return
        if parsed.path == '/api/health':
            self._send_json({'ok': True})
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            body = self._read_json_body()
        except json.JSONDecodeError:
            self._send_json({'ok': False, 'message': 'Invalid JSON body.'}, HTTPStatus.BAD_REQUEST)
            return

        if parsed.path == '/api/signup':
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            if not username or not password:
                self._send_json({'ok': False, 'message': 'Username and password are required.'}, HTTPStatus.BAD_REQUEST)
                return
            store = read_store()
            users = store.setdefault('users', {})
            if username in users:
                self._send_json({'ok': False, 'message': 'Username already exists.'}, HTTPStatus.CONFLICT)
                return
            profile = {
                'username': username,
                'coins': 0,
                'loadout': body.get('profile', {}).get('loadout', {}),
                'stashItems': body.get('profile', {}).get('stashItems', []),
                'extractedRuns': [],
                'stats': {
                    'totalRuns': 0,
                    'totalExtractions': 0,
                    'totalKills': 0,
                    'totalCoinsEarned': 0,
                    'totalMarketTrades': 0,
                },
                'password': password,
            }
            users[username] = profile
            write_store(store)
            safe_user = {k: v for k, v in profile.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
            return

        if parsed.path == '/api/login':
            username = str(body.get('username', '')).strip()
            password = str(body.get('password', ''))
            store = read_store()
            user = store.get('users', {}).get(username)
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
            user = store.get('users', {}).get(username)
            if not user:
                self._send_json({'ok': False, 'message': 'User not found.'}, HTTPStatus.NOT_FOUND)
                return
            profile['password'] = user.get('password', '')
            store['users'][username] = profile
            write_store(store)
            safe_user = {k: v for k, v in profile.items() if k != 'password'}
            self._send_json({'ok': True, 'profile': safe_user})
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
