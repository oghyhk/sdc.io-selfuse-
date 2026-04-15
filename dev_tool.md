# SDC.IO Dev Tool

The dev tool is the content-editing layer for SDC.IO. It consists of:

- [dev.html](dev.html) — browser UI for editing game content
- [dev.py](dev.py) — command-line interface for editing/exporting content
- [data/dev-config.json](data/dev-config.json) — source config edited by both tools
- [server.py](server.py) — exposes `/api/dev-config` and `/api/generate-image`

## What the dev tool manages

### 1. Equipments
- Guns
- Melee weapons
- Armor
- Helmets
- Shoes
- Backpacks
- Consumables
- Ammo definitions

Each item can store:
- `id`
- `name`
- `category`
- `rarity`
- `description`
- `value` (stored as `sellValue` in data)
- `size`
- `image`
- `stats` and/or `modifiers`

### 2. Enemies
- HP
- speed
- damage
- attack cooldown
- sight/chase/patrol ranges
- optional ranged attack settings

### 3. Crate tiers
- label
- description
- item count range
- rarity pool
- UI color

### 4. Ammo
- rarity
- damage multiplier
- value
- instant-kill flag

## Difficulty & map scaling

| Difficulty | Map size | Area mult | Operators | Extractions | Extraction gate |
|---|---|---|---|---|---|
| Easy | 80×60 | 1× | 16–19 | 4 | open |
| Advanced | 80×60 | 1× | 16–19 | 4 | open |
| Hell | 160×120 | 4× | 16–19 | 2 | open |
| Chaos | 320×240 | 16× | 36–39 | 1 | locked until half operators die |

- Rooms, wall clusters, loot crates, health packs, and enemy counts all scale proportionally with map area.
- In chaos mode the single extraction point displays as **LOCKED** until at least `⌈totalPlayers / 2⌉` operators have been eliminated, at which point a kill-feed message announces the unlock.
- AI roster has 66 operators total: 17 lv1, 19 lv2, 30 lv3. Chaos mode draws from lv2+lv3 pool (49 available).

## Dev UI features

Open [dev.html](dev.html) in the local server.

### Equipments tab
- search by name or ID
- filter by category and rarity
- create/edit/delete equipment entries
- preview item art
- edit category-specific stats

### Consumables tab
- search consumables by name or ID
- filter consumables by rarity
- create/edit/delete consumables
- preview the live consumable rules used in raid
- consumables always heal `1 HP` per unit consumed
- higher rarity only changes heal speed
- the UI shows the derived heal speed for the selected rarity
- healing slows movement to `10`, blocks reloading, can be cancelled with `Q`, and is cancelled automatically by left click

#### Gun fields
- `damage`
- `cooldown`
- `bulletSpeed`
- `range`
- `clipSize`
- `reloadTime`
- `spread`

#### Melee fields
- `meleeDamage`
- `meleeCooldown`
- `meleeRange`
- `meleeArc`

These now match the live melee system added in the game code.

#### Equipment modifier fields
- armor / helmet: `maxHp`, `shieldHp`, `shieldRegen`
- shoes: `speed`
- backpack: `carrySlots`

### Shield system

Armors and helmets of **purple rarity or above** carry an energy shield on top of normal HP.

Each shielded item defines:
- `shieldHp` — maximum shield hit-points (positive integer)
- `shieldRegen` — shield regeneration rate in HP/s

Shield HP is shown as a **light-blue segment** on the health bar, sitting to the right of the green HP portion. The HUD text displays `HP x/y | SH x/y` when shields are present.

#### Damage interaction rules (ammo rarity vs shield rarity)

| Condition | Effect |
|---|---|
| ammo rarity **<** shield rarity | Shield absorbs **all** damage; operator only takes damage if the shield breaks mid-hit (overflow) |
| ammo rarity **=** shield rarity | Shield absorbs **30 %** of incoming damage; operator takes the remaining 70 % |
| ammo rarity **>** shield rarity | **Both** shield and operator take the full projectile damage (shield offers no protection) |

- `instantKill` bullets (red ammo, .338 AP) **bypass shields entirely**.
- When armor and helmet have **different** shield rarities, the **higher-rarity** shield is consumed first.
- Shields regenerate passively at `shieldRegen` HP/s while the operator is alive.
- Enemy (drone/sentinel) bullets have no ammo rarity (treated as gray), so shields absorb their damage fully.

### Enemies tab
- create/edit/delete enemies
- supports melee and ranged enemies

### Crates tab
- edit crate pools and counts

### Ammo tab
- edit ammo stats and rarity values

### Image generation
- the UI can request generated art through `/api/generate-image`
- generated images are saved into [assets/dev](assets/dev)

## Dev CLI features

Run from the repo root:

- `python dev.py list items`
- `python dev.py list enemies`
- `python dev.py list ammo`
- `python dev.py list crates`
- `python dev.py add item ...`
- `python dev.py add enemy ...`
- `python dev.py edit item ...`
- `python dev.py edit enemy ...`
- `python dev.py delete item ...`
- `python dev.py delete enemy ...`
- `python dev.py export`
- `python dev.py import --input ...`
- `python dev.py stats`
- `python dev.py generate-image --id ...`

### CLI melee support

The CLI now supports melee-specific add fields:
- `--melee_damage`
- `--melee_cooldown`
- `--melee_range`
- `--melee_arc`

It also supports nested field editing, for example:

- `python dev.py edit item --id field_knife --field stats.meleeRange --value 54`
- `python dev.py edit item --id field_knife --field stats.meleeArc --value 1.8`
- `python dev.py edit item --id ranger_plate --field modifiers.maxHp --value 28`

## Hammer / starter melee note

For save compatibility, the starter melee still uses the definition ID `field_knife`, but the live item is now **Hammer**.

In the dev tool config:
- `field_knife.name` is `Hammer`
- its image points to [assets/items/Tool_Hammer.png](assets/items/Tool_Hammer.png)
- it uses live melee stats for damage, cooldown, range, and swing arc

## Server endpoints used by the dev tool

- `GET /api/dev-config` — load current dev config
- `POST /api/dev-config` — save current dev config
- `POST /api/generate-image` — generate and save dev art

## Source of truth

The dev tool edits [data/dev-config.json](data/dev-config.json), but the runtime game code in [js/profile.js](js/profile.js) remains the live gameplay source.

When gameplay systems change, update both:
- runtime definitions in [js/profile.js](js/profile.js)
- dev tool support in [dev.html](dev.html), [dev.py](dev.py), and [data/dev-config.json](data/dev-config.json)