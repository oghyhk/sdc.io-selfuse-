#!/usr/bin/env python3
"""
SDC.IO Developer CLI — Manage game content via dev-config.json

Usage:
    python dev.py list items [--category gun] [--rarity red] [--search keyword]
    python dev.py list enemies
    python dev.py list ammo
    python dev.py list crates
    python dev.py add item --id my_gun --name "My Gun" --category gun --rarity blue --sell 200 --size 2
    python dev.py add enemy --id my_enemy --name "My Enemy" --type melee --hp 50 --speed 90 --damage 10
    python dev.py edit item --id my_gun --field name --value "Better Gun"
    python dev.py edit enemy --id my_enemy --field hp --value 100
    python dev.py delete item --id my_gun
    python dev.py delete enemy --id my_enemy
    python dev.py export [--output config_export.json]
    python dev.py import --input config_export.json
    python dev.py stats
    python dev.py generate-image --id my_gun --prompt "tactical assault rifle"
"""

import argparse
import json
import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG_FILE = ROOT / 'data' / 'dev-config.json'

RARITY_ORDER = ['gray', 'white', 'green', 'blue', 'purple', 'gold', 'red']
CATEGORIES = ['gun', 'armor', 'helmet', 'shoes', 'backpack']
RARITY_COLORS = {
    'white': '\033[97m', 'gray': '\033[90m', 'green': '\033[92m',
    'blue': '\033[94m', 'purple': '\033[95m', 'gold': '\033[93m',
    'red': '\033[91m'
}
RESET = '\033[0m'
BOLD = '\033[1m'
DIM = '\033[2m'


def _parse_value(raw: str):
    lowered = raw.lower()
    if lowered in ('true', 'false'):
        return lowered == 'true'
    try:
        if '.' in raw:
            return float(raw)
        return int(raw)
    except ValueError:
        return raw


def _get_nested_value(entry: dict, path: str):
    current = entry
    parts = path.split('.')
    for part in parts[:-1]:
        if not isinstance(current, dict):
            return None, None
        current = current.get(part)
        if current is None:
            return None, None
    if not isinstance(current, dict):
        return None, None
    return current, parts[-1]


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return {"version": 1, "items": {}, "enemies": {}, "crate_tiers": {}, "ammo": {}, "player_level_rewards": {}}
    with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_config(config: dict):
    CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def rarity_color(rarity: str) -> str:
    return RARITY_COLORS.get(rarity, '')


def cmd_list_items(args):
    config = load_config()
    items = {k: v for k, v in config.get('items', {}).items() if v.get('lootType') != 'ammo'}
    
    if args.category:
        items = {k: v for k, v in items.items() if v.get('category') == args.category}
    if args.rarity:
        items = {k: v for k, v in items.items() if v.get('rarity') == args.rarity}
    if args.search:
        s = args.search.lower()
        items = {k: v for k, v in items.items() if s in v.get('name', '').lower() or s in k.lower()}
    
    if not items:
        print("No items found.")
        return
    
    # Group by category
    by_cat = {}
    for k, v in items.items():
        cat = v.get('category', 'unknown')
        by_cat.setdefault(cat, []).append((k, v))
    
    for cat in sorted(by_cat.keys()):
        print(f"\n{BOLD}── {cat.upper()} ──{RESET}")
        for k, v in sorted(by_cat[cat], key=lambda x: RARITY_ORDER.index(x[1].get('rarity', 'white')) if x[1].get('rarity') in RARITY_ORDER else 99):
            rc = rarity_color(v.get('rarity', ''))
            stats = v.get('stats', {})
            mods = v.get('modifiers', {})
            stat_str = ', '.join(f"{sk}:{sv}" for sk, sv in {**stats, **mods}.items())
            size_str = f"  sz:{v.get('size', 1)}" if not v.get('lootType') == 'ammo' else ""
            print(f"  {rc}●{RESET} {BOLD}{v.get('name', k):20s}{RESET} [{v.get('rarity',''):6s}] ${v.get('sellValue',0):>6}{size_str}  {DIM}{stat_str}{RESET}")
            if v.get('description'):
                print(f"    {DIM}{v['description']}{RESET}")
    
    print(f"\n{DIM}Total: {len(items)} items{RESET}")


def cmd_list_enemies(args):
    config = load_config()
    enemies = config.get('enemies', {})
    if not enemies:
        print("No enemies found.")
        return
    
    for k, v in enemies.items():
        shoot_info = f" | Shoot:{v.get('shootRange',0)} BulletSpd:{v.get('bulletSpeed',0)}" if v.get('canShoot') else ""
        print(f"  {BOLD}{v.get('name', k):15s}{RESET} [{v.get('type',''):6s}] HP:{v.get('hp',0):>4} SPD:{v.get('speed',0):>3} DMG:{v.get('damage',0):>3} CD:{v.get('attackCooldown',0):.1f}s Sight:{v.get('sightRange',0)}{shoot_info}")
        if v.get('description'):
            print(f"    {DIM}{v['description']}{RESET}")
    
    print(f"\n{DIM}Total: {len(enemies)} enemies{RESET}")


def cmd_list_ammo(args):
    config = load_config()
    ammo = {k: v for k, v in config.get('items', {}).items() if v.get('lootType') == 'ammo'}
    if not ammo:
        print("No ammo found.")
        return
    
    for k, v in sorted(ammo.items(), key=lambda x: RARITY_ORDER.index(x[1].get('rarity', 'white')) if x[1].get('rarity') in RARITY_ORDER else 99):
        rc = rarity_color(v.get('rarity', ''))
        ik = " ⚡INSTANT KILL" if v.get('instantKill') else ""
        print(f"  {rc}●{RESET} {BOLD}{v.get('name', k):15s}{RESET} [{v.get('rarity',''):6s}] Dmg×{v.get('damageMultiplier',1)} Sell:${v.get('sellValue',0):,}{ik}")


def cmd_list_crates(args):
    config = load_config()
    crates = config.get('crate_tiers', {})
    if not crates:
        print("No crate tiers found.")
        return
    
    for k, v in crates.items():
        pool_str = ', '.join(f"{rarity_color(r)}{r}{RESET}" for r in v.get('pool', []))
        ic = v.get('itemCount', {})
        print(f"  {BOLD}{v.get('label', k):20s}{RESET} Items:{ic.get('min',0)}-{ic.get('max',0)}")
        print(f"    Pool: {pool_str}")
        if v.get('description'):
            print(f"    {DIM}{v['description']}{RESET}")


def cmd_add_item(args):
    config = load_config()
    if args.id in config.get('items', {}):
        print(f"Error: Item '{args.id}' already exists. Use 'edit' to modify.", file=sys.stderr)
        sys.exit(1)
    
    item = {
        'id': args.id,
        'name': args.name or args.id,
        'category': args.category or 'gun',
        'rarity': args.rarity or 'white',
        'description': args.description or '',
        'sellValue': args.sell or 100,
        'size': args.size or 1,
    }
    
    # Add default stats based on category
    if item['category'] == 'gun':
        item['stats'] = {
            'damage': args.damage or 15,
            'cooldown': args.cooldown or 0.25,
            'bulletSpeed': args.bullet_speed or 500,
            'range': args.range or 350,
            'clipSize': args.clip_size or 30,
            'reloadTime': args.reload_time or 1.5,
            'spread': args.spread or 0.08
        }
    elif item['category'] in ('armor', 'helmet'):
        item['modifiers'] = {'maxHp': args.hp_bonus or 10}
    elif item['category'] == 'shoes':
        item['modifiers'] = {'speed': args.speed_bonus or 10}
    elif item['category'] == 'backpack':
        item['modifiers'] = {'carrySlots': args.carry_slots or 3}
    
    config.setdefault('items', {})[args.id] = item
    save_config(config)
    print(f"✅ Added item: {item['name']} ({item['category']}, {item['rarity']})")


def cmd_add_enemy(args):
    config = load_config()
    if args.id in config.get('enemies', {}):
        print(f"Error: Enemy '{args.id}' already exists.", file=sys.stderr)
        sys.exit(1)
    
    enemy = {
        'id': args.id,
        'name': args.name or args.id,
        'type': args.type or 'melee',
        'radius': args.radius or 12,
        'speed': args.speed or 100,
        'hp': args.hp or 40,
        'damage': args.damage or 8,
        'attackCooldown': args.attack_cooldown or 0.8,
        'sightRange': args.sight_range or 250,
        'chaseRange': args.chase_range or 350,
        'patrolRange': args.patrol_range or 150,
        'canShoot': args.can_shoot or False,
        'color': args.color or '#ff5252',
        'description': args.description or '',
    }
    
    if enemy['canShoot']:
        enemy['shootRange'] = args.shoot_range or 180
        enemy['bulletSpeed'] = args.bullet_speed or 300
    
    config.setdefault('enemies', {})[args.id] = enemy
    save_config(config)
    print(f"✅ Added enemy: {enemy['name']} ({enemy['type']}, HP:{enemy['hp']})")


def cmd_edit(args):
    config = load_config()
    target = 'items' if args.command == 'item' else 'enemies'
    
    if args.id not in config.get(target, {}):
        print(f"Error: {args.command} '{args.id}' not found.", file=sys.stderr)
        sys.exit(1)
    
    entry = config[target][args.id]
    parent, leaf = _get_nested_value(entry, args.field)
    if parent is None:
        if '.' in args.field:
            parts = args.field.split('.')
            parent = entry
            for part in parts[:-1]:
                if part not in parent or not isinstance(parent.get(part), dict):
                    parent[part] = {}
                parent = parent[part]
            leaf = parts[-1]
            old_val = parent.get(leaf)
        else:
            parent = entry
            leaf = args.field
            old_val = entry.get(args.field)
    else:
        old_val = parent.get(leaf)

    if isinstance(old_val, bool):
        new_val = str(args.value).lower() in ('true', '1', 'yes')
    elif isinstance(old_val, int):
        new_val = int(args.value)
    elif isinstance(old_val, float):
        new_val = float(args.value)
    else:
        new_val = _parse_value(args.value)

    parent[leaf] = new_val
    save_config(config)
    print(f"✅ Updated {args.command} '{args.id}': {args.field} = {new_val} (was {old_val})")


def cmd_delete(args):
    config = load_config()
    target = 'items' if args.command == 'item' else 'enemies'
    
    if args.id not in config.get(target, {}):
        print(f"Error: {args.command} '{args.id}' not found.", file=sys.stderr)
        sys.exit(1)
    
    name = config[target][args.id].get('name', args.id)
    del config[target][args.id]
    save_config(config)
    print(f"✅ Deleted {args.command}: {name} ({args.id})")


def cmd_export(args):
    config = load_config()
    output = args.output or 'config_export.json'
    with open(output, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    print(f"✅ Exported config to {output}")


def cmd_import(args):
    with open(args.input, 'r', encoding='utf-8') as f:
        new_config = json.load(f)
    save_config(new_config)
    items = len(new_config.get('items', {}))
    enemies = len(new_config.get('enemies', {}))
    rewards = len(new_config.get('player_level_rewards', {}))
    print(f"✅ Imported config: {items} items, {enemies} enemies, {rewards} level rewards")


def cmd_stats(args):
    config = load_config()
    items = config.get('items', {})
    enemies = config.get('enemies', {})
    crates = config.get('crate_tiers', {})
    rewards = config.get('player_level_rewards', {})
    
    equipment = {k: v for k, v in items.items() if v.get('lootType') != 'ammo'}
    ammo = {k: v for k, v in items.items() if v.get('lootType') == 'ammo'}
    
    print(f"{BOLD}SDC.IO Config Statistics{RESET}")
    print(f"  Equipment items: {len(equipment)}")
    for cat in CATEGORIES:
        count = sum(1 for v in equipment.values() if v.get('category') == cat)
        if count:
            print(f"    {cat:12s}: {count}")
    
    print(f"  Ammo types: {len(ammo)}")
    print(f"  Enemies: {len(enemies)}")
    print(f"  Crate tiers: {len(crates)}")
    print(f"  Level rewards: {len(rewards)}")
    
    by_rarity = {}
    for v in equipment.values():
        r = v.get('rarity', 'unknown')
        by_rarity[r] = by_rarity.get(r, 0) + 1
    print(f"\n  {BOLD}By Rarity:{RESET}")
    for r in RARITY_ORDER:
        if r in by_rarity:
            print(f"    {rarity_color(r)}{r:8s}{RESET}: {by_rarity[r]}")


def cmd_generate_image(args):
    """Generate an item image using Cloudflare Workers AI via the local server proxy."""
    import urllib.request
    
    config = load_config()
    item = config.get('items', {}).get(args.id)
    prompt = args.prompt
    if not prompt and item:
        prompt = f"Game item icon, {item.get('category','equipment')} weapon, {item.get('name',args.id)}, {item.get('rarity','common')} rarity, dark background, tactical military style, detailed 3D render, top-down game asset"
    elif not prompt:
        prompt = f"Game item icon, {args.id}, tactical military style"
    
    print(f"Generating image for '{args.id}'...")
    print(f"Prompt: {prompt}")
    
    try:
        data = json.dumps({
            'prompt': prompt,
            'itemId': args.id,
            'width': 512,
            'height': 512
        }).encode('utf-8')
        
        req = urllib.request.Request(
            'https://hermesimggen.oghyhk.workers.dev/',
            data=json.dumps({
                'prompt': prompt,
                'width': 512,
                'height': 512
            }).encode('utf-8'),
            headers={
                'Authorization': 'Bearer 2598',
                'Content-Type': 'application/json'
            },
            method='POST'
        )
        
        with urllib.request.urlopen(req, timeout=60) as resp:
            img_data = resp.read()
        
        out_dir = ROOT / 'assets' / 'dev'
        out_dir.mkdir(parents=True, exist_ok=True)
        safe_id = args.id.replace('/', '_')
        out_path = out_dir / f'{safe_id}.jpg'
        out_path.write_bytes(img_data)
        print(f"✅ Image saved: {out_path} ({len(img_data)} bytes)")
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description='SDC.IO Developer CLI')
    sub = parser.add_subparsers(dest='action')
    
    # list
    list_parser = sub.add_parser('list', help='List game content')
    list_parser.add_argument('type', choices=['items', 'enemies', 'ammo', 'crates'])
    list_parser.add_argument('--category', '-c')
    list_parser.add_argument('--rarity', '-r')
    list_parser.add_argument('--search', '-s')
    
    # add
    add_parser = sub.add_parser('add', help='Add new content')
    add_sub = add_parser.add_subparsers(dest='command')
    
    add_item = add_sub.add_parser('item')
    add_item.add_argument('--id', required=True)
    add_item.add_argument('--name', '-n')
    add_item.add_argument('--category', '-c', choices=CATEGORIES)
    add_item.add_argument('--rarity', '-r', choices=RARITY_ORDER)
    add_item.add_argument('--description', '-d')
    add_item.add_argument('--sell', type=int)
    add_item.add_argument('--damage', type=int)
    add_item.add_argument('--cooldown', type=float)
    add_item.add_argument('--bullet_speed', type=int)
    add_item.add_argument('--range', type=int)
    add_item.add_argument('--clip_size', type=int)
    add_item.add_argument('--reload_time', type=float)
    add_item.add_argument('--spread', type=float)
    add_item.add_argument('--hp_bonus', type=int)
    add_item.add_argument('--speed_bonus', type=int)
    add_item.add_argument('--carry_slots', type=int)
    add_item.add_argument('--size', type=int, default=1)
    
    add_enemy = add_sub.add_parser('enemy')
    add_enemy.add_argument('--id', required=True)
    add_enemy.add_argument('--name', '-n')
    add_enemy.add_argument('--type', '-t', choices=['melee', 'ranged'])
    add_enemy.add_argument('--hp', type=int)
    add_enemy.add_argument('--speed', type=int)
    add_enemy.add_argument('--damage', type=int)
    add_enemy.add_argument('--attack_cooldown', type=float)
    add_enemy.add_argument('--sight_range', type=int)
    add_enemy.add_argument('--chase_range', type=int)
    add_enemy.add_argument('--patrol_range', type=int)
    add_enemy.add_argument('--can_shoot', action='store_true')
    add_enemy.add_argument('--shoot_range', type=int)
    add_enemy.add_argument('--bullet_speed', type=int)
    add_enemy.add_argument('--radius', type=int)
    add_enemy.add_argument('--color')
    add_enemy.add_argument('--description', '-d')
    
    # edit
    edit_parser = sub.add_parser('edit', help='Edit existing content')
    edit_sub = edit_parser.add_subparsers(dest='command')
    edit_item = edit_sub.add_parser('item')
    edit_item.add_argument('--id', required=True)
    edit_item.add_argument('--field', '-f', required=True)
    edit_item.add_argument('--value', '-v', required=True)
    edit_enemy = edit_sub.add_parser('enemy')
    edit_enemy.add_argument('--id', required=True)
    edit_enemy.add_argument('--field', '-f', required=True)
    edit_enemy.add_argument('--value', '-v', required=True)
    
    # delete
    del_parser = sub.add_parser('delete', help='Delete content')
    del_sub = del_parser.add_subparsers(dest='command')
    del_item = del_sub.add_parser('item')
    del_item.add_argument('--id', required=True)
    del_enemy = del_sub.add_parser('enemy')
    del_enemy.add_argument('--id', required=True)
    
    # export
    exp = sub.add_parser('export', help='Export config to JSON')
    exp.add_argument('--output', '-o')
    
    # import
    imp = sub.add_parser('import', help='Import config from JSON')
    imp.add_argument('--input', '-i', required=True)
    
    # stats
    sub.add_parser('stats', help='Show config statistics')
    
    # generate-image
    gen = sub.add_parser('generate-image', help='Generate item image')
    gen.add_argument('--id', required=True)
    gen.add_argument('--prompt', '-p')
    
    args = parser.parse_args()
    
    if not args.action:
        parser.print_help()
        return
    
    handlers = {
        'list': lambda: {
            'items': cmd_list_items,
            'enemies': cmd_list_enemies,
            'ammo': cmd_list_ammo,
            'crates': cmd_list_crates,
        }[args.type](args),
        'add': lambda: cmd_add_item(args) if args.command == 'item' else cmd_add_enemy(args),
        'edit': lambda: cmd_edit(args),
        'delete': lambda: cmd_delete(args),
        'export': lambda: cmd_export(args),
        'import': lambda: cmd_import(args),
        'stats': lambda: cmd_stats(args),
        'generate-image': lambda: cmd_generate_image(args),
    }
    
    handlers[args.action]()


if __name__ == '__main__':
    main()
