import json
d = json.load(open('data/users.json'))
for username, val in d.items():
    if not isinstance(val, dict):
        continue
    h = val.get('raidHistory', [])
    if not h:
        continue
    print(f'\n=== {username} ({len(h)} raids) ===')
    for i, e in enumerate(h[:5]):
        op = e.get('operatorKills', '?')
        ai = e.get('aiEnemyKills', '?')
        kills = e.get('kills', '?')
        status = e.get('status', '?')
        diff = e.get('difficulty', '?')
        print(f'  #{i}: operatorKills={op} aiEnemyKills={ai} kills={kills} status={status} diff={diff}')
