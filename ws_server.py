"""
ws_server.py — WebSocket server for real-time multiplayer raid rooms.
Runs on WS_PORT alongside the HTTP server.
"""
from __future__ import annotations

import asyncio
import json
import random
import time

import websockets

WS_PORT = 8766

# ── Raid instance management ──────────────────────────────────

class RaidInstance:
    """A single raid room that players can join."""
    __slots__ = ('id', 'difficulty', 'map_seed', 'players', 'state', 'created_at', 'started_at', 'max_players')

    def __init__(self, raid_id: str, difficulty: str, max_players: int = 20):
        self.id = raid_id
        self.difficulty = difficulty
        self.map_seed = random.randint(1, 2_147_483_646)
        self.players: dict[str, PlayerConnection] = {}  # username -> PlayerConnection
        self.state = 'lobby'  # lobby | active | closed
        self.created_at = time.time()
        self.started_at: float | None = None
        self.max_players = max_players

    def is_full(self):
        return len(self.players) >= self.max_players

    def is_empty(self):
        return len(self.players) == 0

    def add_player(self, pc: 'PlayerConnection'):
        self.players[pc.username] = pc
        pc.raid = self

    def remove_player(self, username: str):
        self.players.pop(username, None)

    async def broadcast(self, msg: dict, exclude: str | None = None):
        data = json.dumps(msg)
        for uname, pc in list(self.players.items()):
            if uname != exclude and pc.ws:
                try:
                    await pc.ws.send(data)
                except Exception:
                    pass

    def player_list(self, exclude: str | None = None):
        return [
            pc.last_state for uname, pc in self.players.items()
            if uname != exclude and pc.last_state
        ]


class PlayerConnection:
    """Tracks a connected player's WebSocket and last known state."""
    __slots__ = ('ws', 'username', 'raid', 'last_state', 'connected_at')

    def __init__(self, ws, username: str):
        self.ws = ws
        self.username = username
        self.raid: RaidInstance | None = None
        self.last_state: dict | None = None
        self.connected_at = time.time()


# Global state
_raids: dict[str, RaidInstance] = {}       # raid_id -> RaidInstance
_connections: dict[str, PlayerConnection] = {}  # username -> PlayerConnection
_queues: dict[str, list[PlayerConnection]] = {}  # difficulty -> list of waiting players

LOBBY_COUNTDOWN = 1       # seconds to wait in lobby before starting
LOBBY_MIN_PLAYERS = 1     # minimum players to start (1 = solo always starts)
POSITION_BROADCAST_HZ = 20  # max broadcasts per second


def _find_or_create_raid(difficulty: str) -> RaidInstance:
    """Find an open lobby for this difficulty or create a new one."""
    for raid in _raids.values():
        if raid.difficulty == difficulty and raid.state == 'lobby' and not raid.is_full():
            return raid
    raid_id = f'raid-{int(time.time()*1000)}-{random.randint(1000,9999)}'
    raid = RaidInstance(raid_id, difficulty)
    _raids[raid_id] = raid
    return raid


async def _start_raid(raid: RaidInstance):
    """Transition raid from lobby to active."""
    if raid.state != 'lobby':
        return
    raid.state = 'active'
    raid.started_at = time.time()
    await raid.broadcast({
        'type': 'raid_start',
        'raidId': raid.id,
        'mapSeed': raid.map_seed,
        'difficulty': raid.difficulty,
        'players': [
            {'username': uname, 'index': i}
            for i, uname in enumerate(raid.players.keys())
        ],
    })


async def _cleanup_raid(raid: RaidInstance):
    """Remove a raid after all players leave."""
    raid.state = 'closed'
    _raids.pop(raid.id, None)


# ── Message handlers ──────────────────────────────────────────

async def _handle_join(pc: PlayerConnection, msg: dict):
    """Player requests to join a raid."""
    difficulty = msg.get('difficulty', 'advanced')

    # Leave existing raid if any
    if pc.raid:
        pc.raid.remove_player(pc.username)
        if pc.raid.is_empty():
            await _cleanup_raid(pc.raid)

    raid = _find_or_create_raid(difficulty)
    raid.add_player(pc)

    # Send join confirmation with raid info
    await pc.ws.send(json.dumps({
        'type': 'raid_joined',
        'raidId': raid.id,
        'mapSeed': raid.map_seed,
        'difficulty': raid.difficulty,
        'players': [
            {'username': uname} for uname in raid.players.keys()
        ],
    }))

    # Notify others
    await raid.broadcast({
        'type': 'player_joined',
        'username': pc.username,
        'playerCount': len(raid.players),
    }, exclude=pc.username)

    # Auto-start after brief delay (for now, start immediately when solo or after 2+ join)
    if len(raid.players) >= LOBBY_MIN_PLAYERS:
        await asyncio.sleep(LOBBY_COUNTDOWN)
        if raid.state == 'lobby' and not raid.is_empty():
            await _start_raid(raid)


async def _handle_pos(pc: PlayerConnection, msg: dict):
    """Player position update — relay to others in same raid."""
    if not pc.raid or pc.raid.state != 'active':
        return
    pc.last_state = {
        'username': pc.username,
        'x': msg.get('x', 0),
        'y': msg.get('y', 0),
        'angle': msg.get('angle', 0),
        'vx': msg.get('vx', 0),
        'vy': msg.get('vy', 0),
        'hp': msg.get('hp', 100),
        'maxHp': msg.get('maxHp', 100),
        'alive': msg.get('alive', True),
        'shieldHp': msg.get('shieldHp', 0),
        'shieldMax': msg.get('shieldMax', 0),
        'dashing': msg.get('dashing', False),
        'gunId': msg.get('gunId', ''),
        'isReloading': msg.get('isReloading', False),
    }


async def _handle_shoot(pc: PlayerConnection, msg: dict):
    """Player fired — relay to others for visual/audio."""
    if not pc.raid or pc.raid.state != 'active':
        return
    await pc.raid.broadcast({
        'type': 'player_shoot',
        'username': pc.username,
        'x': msg.get('x', 0),
        'y': msg.get('y', 0),
        'angle': msg.get('angle', 0),
        'gunId': msg.get('gunId', ''),
    }, exclude=pc.username)


async def _handle_death(pc: PlayerConnection, msg: dict):
    """Player died — notify others."""
    if not pc.raid or pc.raid.state != 'active':
        return
    await pc.raid.broadcast({
        'type': 'player_death',
        'username': pc.username,
        'x': msg.get('x', 0),
        'y': msg.get('y', 0),
    }, exclude=pc.username)


async def _handle_extract(pc: PlayerConnection, msg: dict):
    """Player extracted — notify others."""
    if not pc.raid or pc.raid.state != 'active':
        return
    await pc.raid.broadcast({
        'type': 'player_extract',
        'username': pc.username,
    }, exclude=pc.username)


async def _handle_leave(pc: PlayerConnection, msg: dict):
    """Player intentionally leaves the raid."""
    if pc.raid:
        raid = pc.raid
        raid.remove_player(pc.username)
        await raid.broadcast({
            'type': 'player_left',
            'username': pc.username,
        })
        if raid.is_empty():
            await _cleanup_raid(raid)
        pc.raid = None


_MSG_HANDLERS = {
    'join': _handle_join,
    'pos': _handle_pos,
    'shoot': _handle_shoot,
    'death': _handle_death,
    'extract': _handle_extract,
    'leave': _handle_leave,
}


# ── Position broadcast loop ──────────────────────────────────

async def _broadcast_positions():
    """Periodically broadcast all player positions in active raids."""
    interval = 1 / POSITION_BROADCAST_HZ
    while True:
        for raid in list(_raids.values()):
            if raid.state != 'active' or len(raid.players) < 2:
                continue
            for uname, pc in list(raid.players.items()):
                others = raid.player_list(exclude=uname)
                if others and pc.ws:
                    try:
                        await pc.ws.send(json.dumps({
                            'type': 'players',
                            'data': others,
                        }))
                    except Exception:
                        pass
        await asyncio.sleep(interval)


# ── Stale raid cleanup ────────────────────────────────────────

async def _cleanup_stale_raids():
    """Remove raids that have been empty or old."""
    while True:
        now = time.time()
        for raid_id, raid in list(_raids.items()):
            if raid.is_empty() and now - raid.created_at > 60:
                raid.state = 'closed'
                _raids.pop(raid_id, None)
            elif raid.state == 'active' and raid.started_at and now - raid.started_at > 3600:
                # Force-close raids older than 1 hour
                raid.state = 'closed'
                _raids.pop(raid_id, None)
        await asyncio.sleep(30)


# ── Connection handler ────────────────────────────────────────

async def _ws_handler(ws):
    """Handle a single WebSocket connection lifecycle."""
    pc: PlayerConnection | None = None
    try:
        # First message must be auth
        raw = await asyncio.wait_for(ws.recv(), timeout=10)
        msg = json.loads(raw)
        if msg.get('type') != 'auth' or not msg.get('username'):
            await ws.close(1008, 'Auth required')
            return

        username = str(msg['username']).strip()

        # Kick existing connection for same user
        old = _connections.pop(username, None)
        if old and old.ws:
            try:
                await old.ws.close(1000, 'Replaced by new connection')
            except Exception:
                pass
            if old.raid:
                old.raid.remove_player(username)

        pc = PlayerConnection(ws, username)
        _connections[username] = pc

        await ws.send(json.dumps({'type': 'auth_ok', 'username': username}))

        # Message loop
        async for raw in ws:
            try:
                msg = json.loads(raw)
                handler = _MSG_HANDLERS.get(msg.get('type'))
                if handler:
                    await handler(pc, msg)
            except json.JSONDecodeError:
                continue

    except (websockets.exceptions.ConnectionClosed, asyncio.TimeoutError, OSError):
        pass
    finally:
        if pc:
            _connections.pop(pc.username, None)
            if pc.raid:
                raid = pc.raid
                raid.remove_player(pc.username)
                await raid.broadcast({
                    'type': 'player_left',
                    'username': pc.username,
                })
                if raid.is_empty():
                    await _cleanup_raid(raid)


# ── Entry point ───────────────────────────────────────────────

async def run_ws_server():
    """Start the WebSocket server (called from main server.py)."""
    async with websockets.serve(_ws_handler, '0.0.0.0', WS_PORT):
        print(f'WebSocket server running on ws://0.0.0.0:{WS_PORT}')
        # Start background tasks
        asyncio.create_task(_broadcast_positions())
        asyncio.create_task(_cleanup_stale_raids())
        await asyncio.Future()  # run forever


def start_ws_in_thread():
    """Run the async WS server in a new thread with its own event loop."""
    import threading
    def _run():
        asyncio.run(run_ws_server())
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t
