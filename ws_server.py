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
    __slots__ = (
        'id', 'difficulty', 'map_seed', 'players', 'state',
        'created_at', 'started_at', 'max_players',
        # Phase 2: shared world state
        'taken_items', 'taken_healthpacks', 'operator_deaths',
        # Phase 3: PvP HP tracking
        'player_hp',
        # Phase 4: host-based AI
        'host_username', 'enemy_snapshot',
        # Phase 5: movement validation
        'last_positions',
    )

    def __init__(self, raid_id: str, difficulty: str, max_players: int = 20):
        self.id = raid_id
        self.difficulty = difficulty
        self.map_seed = random.randint(1, 2_147_483_646)
        self.players: dict[str, PlayerConnection] = {}  # username -> PlayerConnection
        self.state = 'lobby'  # lobby | active | closed
        self.created_at = time.time()
        self.started_at: float | None = None
        self.max_players = max_players
        # Phase 2
        self.taken_items: set[str] = set()         # set of item IDs already taken
        self.taken_healthpacks: set[str] = set()   # set of healthpack IDs collected
        self.operator_deaths: int = 0              # shared operator death count
        # Phase 3
        self.player_hp: dict[str, dict] = {}       # username -> {hp, maxHp, alive}
        # Phase 4
        self.host_username: str | None = None      # first player = AI host
        self.enemy_snapshot: list = []              # latest enemy state from host
        # Phase 5
        self.last_positions: dict[str, dict] = {}  # username -> {x, y, t}

    def is_full(self):
        return len(self.players) >= self.max_players

    def is_empty(self):
        return len(self.players) == 0

    def add_player(self, pc: 'PlayerConnection'):
        self.players[pc.username] = pc
        pc.raid = self
        if self.host_username is None:
            self.host_username = pc.username

    def remove_player(self, username: str):
        self.players.pop(username, None)
        # Reassign host if the host left
        if self.host_username == username:
            self.host_username = next(iter(self.players), None)

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
        'host': raid.host_username,
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
    x = msg.get('x', 0)
    y = msg.get('y', 0)
    raid = pc.raid

    # Phase 5: speed validation
    now = time.time()
    last = raid.last_positions.get(pc.username)
    if last:
        dt = now - last['t']
        if dt > 0.01:  # skip very small intervals
            dx = x - last['x']
            dy = y - last['y']
            speed = (dx * dx + dy * dy) ** 0.5 / dt
            if speed > MAX_SPEED * 1.5:  # 50% tolerance for network jitter
                # Reject — snap back to last known valid position
                try:
                    await pc.ws.send(json.dumps({
                        'type': 'pos_correct',
                        'x': last['x'], 'y': last['y'],
                    }))
                except Exception:
                    pass
                return
    raid.last_positions[pc.username] = {'x': x, 'y': y, 't': now}

    pc.last_state = {
        'username': pc.username,
        'x': x,
        'y': y,
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


# ── Phase 2: Shared world state handlers ──────────────────────

MAX_SPEED = 500  # px/s max expected (with dash) — Phase 5

async def _handle_crate_take(pc: PlayerConnection, msg: dict):
    """Player takes an item from a crate — first-come-first-served."""
    if not pc.raid or pc.raid.state != 'active':
        return
    item_id = msg.get('itemId', '')
    crate_id = msg.get('crateId', '')
    if not item_id:
        return
    raid = pc.raid
    if item_id in raid.taken_items:
        await pc.ws.send(json.dumps({'type': 'crate_take_fail', 'itemId': item_id, 'reason': 'already_taken'}))
        return
    raid.taken_items.add(item_id)
    await pc.ws.send(json.dumps({'type': 'crate_take_ok', 'itemId': item_id, 'crateId': crate_id}))
    await raid.broadcast({
        'type': 'crate_item_taken',
        'username': pc.username,
        'crateId': crate_id,
        'itemId': item_id,
    }, exclude=pc.username)


async def _handle_hp_take(pc: PlayerConnection, msg: dict):
    """Player picks up a health pack — first-come-first-served."""
    if not pc.raid or pc.raid.state != 'active':
        return
    hp_id = msg.get('hpId', '')
    if not hp_id:
        return
    raid = pc.raid
    if hp_id in raid.taken_healthpacks:
        await pc.ws.send(json.dumps({'type': 'hp_take_fail', 'hpId': hp_id}))
        return
    raid.taken_healthpacks.add(hp_id)
    await pc.ws.send(json.dumps({'type': 'hp_take_ok', 'hpId': hp_id}))
    await raid.broadcast({
        'type': 'hp_taken',
        'username': pc.username,
        'hpId': hp_id,
    }, exclude=pc.username)


async def _handle_crate_spawn(pc: PlayerConnection, msg: dict):
    """Dynamic crate spawn (e.g., enemy death drop) — broadcast to others."""
    if not pc.raid or pc.raid.state != 'active':
        return
    await pc.raid.broadcast({
        'type': 'crate_spawned',
        'username': pc.username,
        'crate': msg.get('crate', {}),
    }, exclude=pc.username)


async def _handle_op_death(pc: PlayerConnection, msg: dict):
    """Operator (AI player) died — increment shared counter for extraction gate."""
    if not pc.raid or pc.raid.state != 'active':
        return
    raid = pc.raid
    raid.operator_deaths += 1
    await raid.broadcast({
        'type': 'op_death_count',
        'count': raid.operator_deaths,
    })


# ── Phase 3: PvP combat handlers ─────────────────────────────

async def _handle_pvp_hit(pc: PlayerConnection, msg: dict):
    """Shooter reports hitting a remote player. Server validates and applies."""
    if not pc.raid or pc.raid.state != 'active':
        return
    target = msg.get('target', '')
    damage = min(max(msg.get('damage', 0), 0), 9999)  # clamp
    if not target or target == pc.username:
        return
    raid = pc.raid
    target_pc = raid.players.get(target)
    if not target_pc:
        return
    # Init HP tracking if needed
    if target not in raid.player_hp:
        hp = target_pc.last_state.get('hp', 100) if target_pc.last_state else 100
        maxHp = target_pc.last_state.get('maxHp', 100) if target_pc.last_state else 100
        raid.player_hp[target] = {'hp': hp, 'maxHp': maxHp, 'alive': True}
    t_hp = raid.player_hp[target]
    if not t_hp['alive']:
        return
    t_hp['hp'] = max(0, t_hp['hp'] - damage)
    alive = t_hp['hp'] > 0
    t_hp['alive'] = alive
    # Notify the target they were hit
    if target_pc.ws:
        try:
            await target_pc.ws.send(json.dumps({
                'type': 'pvp_damage',
                'attacker': pc.username,
                'damage': damage,
                'hp': t_hp['hp'],
                'alive': alive,
                'gunId': msg.get('gunId', ''),
            }))
        except Exception:
            pass
    # Broadcast to others for visual feedback
    await raid.broadcast({
        'type': 'pvp_hit_visual',
        'attacker': pc.username,
        'target': target,
        'damage': damage,
        'alive': alive,
    }, exclude=target)
    # If killed, broadcast death
    if not alive:
        await raid.broadcast({
            'type': 'pvp_kill',
            'killer': pc.username,
            'victim': target,
        })


# ── Phase 4: Host-based AI handlers ──────────────────────────

async def _handle_enemy_sync(pc: PlayerConnection, msg: dict):
    """Host sends enemy state update — relay to non-host players."""
    if not pc.raid or pc.raid.state != 'active':
        return
    raid = pc.raid
    if pc.username != raid.host_username:
        return  # Only host can send enemy updates
    enemies = msg.get('enemies', [])
    raid.enemy_snapshot = enemies
    # Relay to all non-host players
    data = json.dumps({'type': 'enemy_sync', 'enemies': enemies})
    for uname, other_pc in list(raid.players.items()):
        if uname != pc.username and other_pc.ws:
            try:
                await other_pc.ws.send(data)
            except Exception:
                pass


async def _handle_enemy_hit(pc: PlayerConnection, msg: dict):
    """Player hit an enemy — broadcast to others for sync."""
    if not pc.raid or pc.raid.state != 'active':
        return
    await pc.raid.broadcast({
        'type': 'enemy_hit',
        'username': pc.username,
        'enemyId': msg.get('enemyId', ''),
        'damage': msg.get('damage', 0),
        'killed': msg.get('killed', False),
    }, exclude=pc.username)


async def _handle_enemy_bullet(pc: PlayerConnection, msg: dict):
    """Enemy fired a bullet (from host) — broadcast to others."""
    if not pc.raid or pc.raid.state != 'active':
        return
    if pc.username != pc.raid.host_username:
        return
    await pc.raid.broadcast({
        'type': 'enemy_bullet',
        'data': msg.get('data', {}),
    }, exclude=pc.username)


_MSG_HANDLERS = {
    'join': _handle_join,
    'pos': _handle_pos,
    'shoot': _handle_shoot,
    'death': _handle_death,
    'extract': _handle_extract,
    'leave': _handle_leave,
    # Phase 2
    'crate_take': _handle_crate_take,
    'hp_take': _handle_hp_take,
    'crate_spawn': _handle_crate_spawn,
    'op_death': _handle_op_death,
    # Phase 3
    'pvp_hit': _handle_pvp_hit,
    # Phase 4
    'enemy_sync': _handle_enemy_sync,
    'enemy_hit': _handle_enemy_hit,
    'enemy_bullet': _handle_enemy_bullet,
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
    async with websockets.serve(_ws_handler, '0.0.0.0', WS_PORT,
                                ping_interval=None):
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
