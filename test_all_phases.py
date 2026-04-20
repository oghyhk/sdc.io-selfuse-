"""Test all multiplayer phases: crates, PvP, AI sync, movement validation."""
import asyncio, websockets, json, time

URI = "ws://localhost:8766"
SKIP = {"players", "player_joined"}  # Background broadcasts to ignore

async def auth(username):
    ws = await websockets.connect(URI, ping_interval=None, close_timeout=2)
    await ws.send(json.dumps({"type": "auth", "username": username}))
    r = json.loads(await ws.recv())
    assert r["type"] == "auth_ok"
    return ws

async def join(ws, difficulty="easy"):
    await ws.send(json.dumps({"type": "join", "difficulty": difficulty}))
    r = json.loads(await ws.recv())
    assert r["type"] == "raid_joined"
    return r

async def wait_start(ws):
    while True:
        r = json.loads(await asyncio.wait_for(ws.recv(), 5))
        if r["type"] == "raid_start":
            return r

async def recv_type(ws, msg_type, timeout=2):
    """Receive first message of msg_type, skipping broadcasts."""
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError(f"No {msg_type} within {timeout}s")
        r = json.loads(await asyncio.wait_for(ws.recv(), remaining))
        if r["type"] == msg_type:
            return r

async def recv_none(ws, msg_type, timeout=0.3):
    """Assert no message of msg_type arrives within timeout (ignoring broadcasts)."""
    deadline = time.monotonic() + timeout
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return  # Good - didn't receive it
        try:
            r = json.loads(await asyncio.wait_for(ws.recv(), remaining))
        except asyncio.TimeoutError:
            return  # Good
        if r["type"] == msg_type:
            raise AssertionError(f"Unexpectedly got {msg_type}: {r}")

async def test_phase2():
    """Phase 2: Crate takes, health packs, operator deaths."""
    print("=== Phase 2: Shared World ===")
    ws1 = await auth("testbot99")
    ws2 = await auth("fixtest1")

    j1 = await join(ws1)
    j2 = await join(ws2)
    assert j1["raidId"] == j2["raidId"]

    await wait_start(ws1)
    await wait_start(ws2)

    await ws1.send(json.dumps({"type": "pos", "x": 100, "y": 100, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))
    await ws2.send(json.dumps({"type": "pos", "x": 200, "y": 200, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))

    # Test 1: Crate take - first come first served
    await ws1.send(json.dumps({"type": "crate_take", "crateId": "crate1", "itemId": "item_a"}))
    r = await recv_type(ws1, "crate_take_ok")
    print(f"  Crate take OK: {r}")

    # P2 should get notification
    r = await recv_type(ws2, "crate_item_taken")
    print(f"  P2 notified: {r}")

    # P2 tries same item — should fail
    await ws2.send(json.dumps({"type": "crate_take", "crateId": "crate1", "itemId": "item_a"}))
    r = await recv_type(ws2, "crate_take_fail")
    print(f"  Double-take blocked: {r}")

    # Test 2: Health pack
    await ws1.send(json.dumps({"type": "hp_take", "hpId": "hp_1"}))
    r = await recv_type(ws1, "hp_take_ok")
    print(f"  HP take OK: {r}")

    await ws2.send(json.dumps({"type": "hp_take", "hpId": "hp_1"}))
    r = await recv_type(ws2, "hp_take_fail")
    print(f"  HP double-take blocked: {r}")

    # Test 3: Operator death count
    await ws1.send(json.dumps({"type": "op_death"}))
    r = await recv_type(ws1, "op_death_count")
    assert r["count"] == 1
    r2 = await recv_type(ws2, "op_death_count")
    assert r2["count"] == 1
    print(f"  Op death count synced: {r['count']}")

    # Test 4: Crate spawn
    await ws1.send(json.dumps({"type": "crate_spawn", "crate": {"id": "dyn_1", "x": 500, "y": 500, "tier": "elite"}}))
    r = await recv_type(ws2, "crate_spawned")
    print(f"  Dynamic crate spawn: {r['crate']}")

    await ws1.close()
    await ws2.close()
    print("  Phase 2 PASSED!\n")


async def test_phase3():
    """Phase 3: PvP combat."""
    print("=== Phase 3: PvP Combat ===")
    ws1 = await auth("p3_player1")
    ws2 = await auth("p3_player2")

    await join(ws1)
    await join(ws2)
    await wait_start(ws1)
    await wait_start(ws2)

    await ws1.send(json.dumps({"type": "pos", "x": 100, "y": 100, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))
    await ws2.send(json.dumps({"type": "pos", "x": 200, "y": 200, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))
    await asyncio.sleep(0.15)

    # P1 hits P2
    await ws1.send(json.dumps({"type": "pvp_hit", "target": "p3_player2", "damage": 25, "gunId": "ar15"}))
    r = await recv_type(ws2, "pvp_damage")
    assert r["damage"] == 25 and r["hp"] == 75 and r["alive"] == True
    print(f"  PvP hit: damage={r['damage']}, hp={r['hp']}, alive={r['alive']}")

    # P1 sees hit visual
    r = await recv_type(ws1, "pvp_hit_visual")
    print(f"  Hit visual broadcast: target={r['target']}")

    # P1 kills P2 (remaining 75 HP)
    await ws1.send(json.dumps({"type": "pvp_hit", "target": "p3_player2", "damage": 75}))
    r = await recv_type(ws2, "pvp_damage")
    assert r["hp"] == 0 and r["alive"] == False
    print(f"  Kill confirmed: hp={r['hp']}, alive={r['alive']}")

    r = await recv_type(ws1, "pvp_kill")
    assert r["killer"] == "p3_player1" and r["victim"] == "p3_player2"
    print(f"  Kill broadcast: {r['killer']} -> {r['victim']}")

    # Further hits on dead player should be ignored
    await ws1.send(json.dumps({"type": "pvp_hit", "target": "p3_player2", "damage": 50}))
    await recv_none(ws2, "pvp_damage", 0.5)
    print("  Dead player not re-hit: correct")

    await ws1.close()
    await ws2.close()
    print("  Phase 3 PASSED!\n")


async def test_phase4():
    """Phase 4: Host-based AI sync."""
    print("=== Phase 4: AI Sync ===")
    ws1 = await auth("p4_host")
    ws2 = await auth("p4_client")

    await join(ws1)
    await join(ws2)

    start1 = await wait_start(ws1)
    start2 = await wait_start(ws2)
    assert start1["host"] == "p4_host"
    assert start2["host"] == "p4_host"
    print(f"  Host assigned: {start1['host']}")

    await ws1.send(json.dumps({"type": "pos", "x": 100, "y": 100, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))
    await ws2.send(json.dumps({"type": "pos", "x": 200, "y": 200, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))

    # Host sends enemy sync
    enemies = [
        {"id": "e1", "x": 300, "y": 300, "angle": 0, "hp": 50, "alive": True, "state": "patrol"},
        {"id": "e2", "x": 400, "y": 400, "angle": 1.5, "hp": 80, "alive": True, "state": "chase"},
    ]
    await ws1.send(json.dumps({"type": "enemy_sync", "enemies": enemies}))
    r = await recv_type(ws2, "enemy_sync")
    assert len(r["enemies"]) == 2
    print(f"  Enemy sync received: {len(r['enemies'])} enemies")

    # Non-host can't send enemy sync
    await ws2.send(json.dumps({"type": "enemy_sync", "enemies": [{"id": "hack"}]}))
    await recv_none(ws1, "enemy_sync", 0.5)
    print("  Non-host enemy sync rejected: correct")

    # Enemy hit broadcast
    await ws2.send(json.dumps({"type": "enemy_hit", "enemyId": "e1", "damage": 20, "killed": False}))
    r = await recv_type(ws1, "enemy_hit")
    print(f"  Enemy hit broadcast: enemyId={r['enemyId']}, damage={r['damage']}")

    # Host sends enemy bullet
    await ws1.send(json.dumps({"type": "enemy_bullet", "data": {"x": 300, "y": 300, "vx": 100, "vy": 0}}))
    r = await recv_type(ws2, "enemy_bullet")
    print(f"  Enemy bullet relayed: {r['data']}")

    await ws1.close()
    await ws2.close()
    print("  Phase 4 PASSED!\n")


async def test_phase5():
    """Phase 5: Movement validation."""
    print("=== Phase 5: Movement Validation ===")
    ws1 = await auth("p5_player")

    await join(ws1)
    await wait_start(ws1)

    # Normal movement
    await ws1.send(json.dumps({"type": "pos", "x": 100, "y": 100, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))
    await asyncio.sleep(0.1)

    # Move at normal speed (~180 px/s -> 18px in 0.1s)
    await ws1.send(json.dumps({"type": "pos", "x": 118, "y": 100, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))
    await recv_none(ws1, "pos_correct", 0.3)
    print("  Normal speed accepted: correct")

    # Teleport (speed hack) — 5000px in 0.1s = 50000 px/s >> MAX_SPEED*1.5
    await asyncio.sleep(0.1)
    await ws1.send(json.dumps({"type": "pos", "x": 5118, "y": 100, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))
    r = await recv_type(ws1, "pos_correct")
    print(f"  Teleport blocked, corrected to: ({r['x']}, {r['y']})")

    # After correction, normal move should work
    await asyncio.sleep(0.1)
    await ws1.send(json.dumps({"type": "pos", "x": 130, "y": 100, "angle": 0, "hp": 100, "maxHp": 100, "alive": True}))
    await recv_none(ws1, "pos_correct", 0.3)
    print("  Post-correction normal move accepted: correct")

    await ws1.close()
    print("  Phase 5 PASSED!\n")


async def main():
    await test_phase2()
    await test_phase3()
    await test_phase4()
    await test_phase5()
    print("ALL PHASES PASSED!")

asyncio.run(main())
