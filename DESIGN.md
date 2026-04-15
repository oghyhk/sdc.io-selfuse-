# SDC.IO — Game Design Document

## 1. Core Gameplay Loop

**Prepare Loadout → Enter Raid → Open Crates → Take Items → Fight → Extract**

1. The player selects a six-slot loadout from the menu inventory: **2 gun slots** (`gunPrimary`, `gunSecondary`) plus armor, helmet, shoes, and backpack.
2. The player deploys into a 2D top-down map with enemies, combat zones, loot-crate rooms, and extraction points.
3. Loot is no longer loose cash on the ground. Instead, the player must move beside a crate and press `F` to open or close it.
4. Each crate contains **1 to 4 items**. Items are shown in a centered loot panel and can be taken individually by clicking them.
5. Opened crates remain visually marked as already inspected even after they are closed.
6. The player survives combat, manages carry capacity, and decides which items are worth taking.
7. Standing inside an extraction zone for 3 seconds secures the carried items into the player stash for later trading.
8. Death still causes full run failure.
9. The player must equip **at least one gun** before any raid can be started.

---

## 2. Item Model

### Live Equipment Model
The current live build uses six equipped slots across these categories:

1. **Primary Gun Slot**
2. **Secondary Gun Slot**
3. **Armors**
4. **Helmets**
5. **Shoes**
6. **Backpacks**

The player inventory screen supports equipping one item into each slot. Guns are still a single item category, but the player can now bring **two guns** into a raid and switch between them.

### Ammo
Ammo is a separate loot type (not equipment) with six rarity tiers from Gray to Red. Each tier has a distinct damage multiplier and sell value. Ammo is stored in a dedicated `stashAmmo` map rather than the equipment stash. See **Section 10** for full details.

### Example Items
The current prototype currently includes these notable live items:

- **Guns**: G17 (White), AS VAL (Red), AWM (Red)
- **Armors**: Cloth Vest (White), Kevlar Weave (Green), Ranger Plate (Blue), Warden Vest (Purple), Titan Rig (Gold), Bastion Plate (Red)
- **Helmets**: Scout Cap (White), Recon Helmet (Green), Sentinel Helm (Blue), Eclipse Visor (Purple), Fortress Mask (Gold), Phantom Crown (Red)
- **Shoes**: Trail Shoes (White), Runner Boots (Green), Phase Greaves (Blue), Phantom Sprinters (Purple), Blitz Treads (Gold), Warp Drivers (Red)
- **Backpacks**: Sling Pack (White), Scout Pack (Green), Mule Pack (Blue), Siege Rucksack (Purple), Cargo Titan (Gold), Void Satchel (Red)
- **Consumables**: Field Bandage (White), Med Kit (Green), Stim Syringe (Blue), Combat Medic Pack (Purple), Regen Injector (Gold), Nano Serum (Red)

### Consumables System
Consumable items are picked up from loot crates and stored directly in the backpack. They stack like ammo in bundles of up to 999 per backpack slot, can be traded in the market, and cannot be placed in the safebox. Press **Q** to use a consumable. The HUD shows the total consumable count currently packed in the backpack.

### Gun Rules
Guns now use the normal rarity system and can appear in both gun slots.

- The player may equip **up to two guns**.
- At least **one gun must be equipped** before starting a raid.
- The player spawns with the higher-value equipped gun active by default.
- Press **E** during a raid to switch between the primary and secondary gun.
- `AWM` is a high-end red gun with oversized projectile visuals (`projectileScale = 1.5`).

### Melee System Status
The melee system has been **removed from the live game**.

- There is no melee slot in the live loadout.
- There is no melee attack input or melee HUD in live gameplay.
- Raids are now fully gun-based.

However, melee support is intentionally **kept in the dev tooling/config workflow** so it can be restored quickly later if needed. The Dev UI / CLI still preserve melee-oriented authoring support for future recreation or experimentation.

| Item | Rarity | Heal | Special |
|------|--------|------|---------|
| Field Bandage | White | 20 HP | — |
| Med Kit | Green | 35 HP | — |
| Stim Syringe | Blue | 50 HP | — |
| Combat Medic Pack | Purple | 70 HP | — |
| Regen Injector | Gold | 100 HP | +2 HP/sec for 15 sec |
| Nano Serum | Red | Full HP | + Full energy restore |

### Item Images
Each item has a 512x512 PNG image stored in `assets/items/`. Images are displayed in:
- **Inventory loadout cards** — 64px thumbnail alongside item name, description, and stats
- **Market cards** — full-width image above item details
- **Crate loot panel** — full-width image above item details when opening crates during a raid

The `getItemImagePath(definitionId)` function in `profile.js` returns the image path as `assets/items/<definitionId>.png`.

### Item Size
Each item (except ammo) has a `size` property (integer, default 1) that determines how many units of inventory space it occupies in the player's carrying capacity. Backpacks provide `carrySlots` which is the total space available.

| Item | Size |
|------|------|
| Most items | 1 (default) |
| Large/heavy items | 2+ |

Size can be adjusted per-item via the Dev UI (`dev.html`) or CLI (`python dev.py edit item --id <id> --field size --value <n>`).

### Rarity Ladder
All items, including equipment, follow this rarity order from highest to lowest:

**Legend > Red > Gold > Purple > Blue > Green > White > Gray**

Rarity affects:
- visual color coding
- crate excitement/readability
- market value
- equipment quality and stat expectations
- start-button and frame special effects for top-end content

---

## 3. Loot Crates

### Crate Behavior
- Crates are distributed across safe, combat, and high-value zones.
- The player must be within interaction range.
- Pressing `F` toggles the nearest crate open or closed.
- Once opened at least once, a crate is marked as **inspected** visually.
- Crates may become empty after all items are taken.
- **Chaos difficulty currently has no loot crates**.

### Crate Tiers
Crates come in three tiers that determine loot quality:
- **Supply** — green and below, found in safe zones
- **Tactical** — blue and below, found in combat zones
- **Elite** — red and below, found in high-value zones

Each tier has its own image (`crate_supply.png`, `crate_tactical.png`, `crate_elite.png`) and the crate is colored to match its tier.

### Crate UI Direction
The prototype now uses a **centered loot panel** while raiding.
This is aligned with the general readability goal of extraction shooters:
- nearby crate prompt
- visible item list
- click-to-take behavior
- rarity color indicators
- clear empty-state feedback

This is conceptually similar to modern extraction-mode inventory interactions without copying proprietary UI assets.

---

## 4. Visual Direction

- Minimalist geometric art remains intact.
- The map, enemies, and player use simple readable shapes.
- Loot crates are rendered as simple boxes with different states:
  - unopened
  - opened
  - inspected/opened-before
- Rarity is emphasized through strong color accents in the loot panel and item markers.
- Ground color progression now reads as:
  - **low-value / safe**: gray
  - **mid-value / combat**: light green
  - **high-value**: light purple
- `Legend` rarity uses a more animated premium presentation, and the Chaos start button borrows this visual intensity.

---

## 5. Technical Structure

```
index.html          — Entry point + DOM overlays
assets/
  items/            — 512x512 PNG images for all 36 items + 3 crate tiers
js/
  app.js            — Menu, inventory, auth, and crate-panel UI
  game.js           — Main loop, raid state, extraction summary, crate interaction
  player.js         — Player movement, loadout stats, carried items
  enemy.js          — AI enemies
  map.js            — Procedural map generation and crate placement
  renderer.js       — Canvas rendering for world, crates, HUD, minimap
  profile.js        — Item catalog, rarity data, stash persistence, loadout logic, item image paths
  input.js          — Keyboard/mouse commands including `F` interaction
  audio.js          — Procedural sound
  constants.js      — Shared config
  utils.js          — Math and collision helpers
```

---

## 6. Inventory and Persistence

### Menu Layer
The front page now supports:
- **Start Game**
- **Inventory**
- **Market**
- **Login / Sign Up** button

### Inventory Layer
The inventory page allows the player to:
- view saved coins
- inspect extracted loot history
- equip two guns plus four armor/mobility slots
- review stash totals by rarity
- save loadout presets into **5 preset slots**
- inspect the **Est. Value of Loadout** for the currently selected preset

### Market Layer
The market page allows the player to:
- buy any currently defined item for coins
- sell owned items back for coins
- compare rarity, category, and owned counts in one place
- adjust trade amount with a quantity slider

### Persistence
For the prototype, account and stash data are stored in a **local JSON file** served through a lightweight local API.
Saved data includes:
- username/password (prototype only)
- equipped loadout
- stash items
- extracted run history
- total coins

---

## 7. Gameplay Consequences of Gear

The prototype currently uses equipment to affect the raid by modifying:
- gun damage / fire rate / range
- armor and helmet max HP
- shoes movement speed
- backpack carry capacity

Because the player can bring two guns, loadout choice now also affects in-raid weapon swapping and risk management.

### Carry Space
- base carry capacity is now **10** without a backpack
- backpacks add extra carry space on top of that base value

### Energy and Pace Control
- the bottom-center status area contains health, carry, and a thinner white energy bar
- moving in **normal mode** drains energy
- pressing `R` toggles between **normal** and **slow** mode
- while in **slow mode**, energy regenerates
- if energy is depleted, the player is forced into slow mode
- the player can only switch back to normal mode once energy is above **20%**

This gives the inventory page direct gameplay relevance.

---

## 8. Multiplayer-Ready Considerations

The new crate system is still designed with future multiplayer in mind.

### Server-Authoritative Targets Later
The following actions would need server validation in multiplayer:
- login and profile saves
- crate open / close state
- crate contents
- item pickup from crates
- player carry inventory
- extraction result calculation
- stash rewards after raid
- market trades and coin balances

### Why Current Structure Helps
The current architecture already separates:
- input commands
- world state
- UI rendering
- persistent player profile data

That makes it easier later to move raid logic to an authoritative backend while keeping menu/inventory UI on the client.

---

## 9. Current MVP Rules

### Win
- Extract alive with carried items.

### Lose
- Die before extraction.
- Death penalties vary by difficulty — see **Section 12** for details.

### Controls
- `WASD` / arrow keys: move
- mouse: aim
- left click: shoot
- `E`: switch equipped gun
- `Q`: use consumable
- `Space`: dash
- `R`: toggle normal / slow movement mode
- `F`: open / close nearby crate
- click loot entries in the crate panel: take item

---

## 10. Ammo Rarity System

### Ammo Tiers
Ammo is a distinct loot type split into seven rarity tiers, each stored as a separate pack:

| Rarity | Definition ID | Damage Multiplier | Sell Value | Color |
|--------|---------------|-------------------|------------|-------|
| **Legend** | `ammo_338_ap` | Extreme / instant kill | 5,000,000 | near-black / legend UI |
| **Gray (White)** | `ammo_white` | ×0.2 (free fallback) | 1 | `#aaa` (gray) |
| **Green** | `ammo_green` | ×1.0 | 8 | green |
| **Blue** | `ammo_blue` | ×1.05 | 250 | blue |
| **Purple** | `ammo_purple` | ×1.2 | 5,000 | purple |
| **Gold** | `ammo_gold` | ×1.4 | 25,000 | gold |
| **Red** | `ammo_red` | Instant Kill | 1,000,000 | red |

Ammo definitions live in `ITEM_DEFS` in `profile.js`. The priority ordering (highest → lowest) is maintained in `AMMO_DEFINITION_IDS`: `['ammo_338_ap', 'ammo_red', 'ammo_gold', 'ammo_purple', 'ammo_blue', 'ammo_green', 'ammo_white']`.

### Stash Ammo Storage
Ammo is persisted separately from equipment in a `stashAmmo` map (`{ [definitionId]: count }`), not in `stashItems`. On profile load, `normalizeStashAmmo()` migrates any legacy ammo entries from the items array into this map.

### Priority-based Loading
- On raid start, the gun magazine starts **empty**.
- `reloadBestAvailableAmmo(forceReplace)` draws ammo from the backpack, filling the magazine with the **highest-rarity ammo first** using `_getAmmoPriority()` (lower index in `AMMO_DEFINITION_IDS` = higher priority).
- When all non-gray backpack ammo is exhausted, the remaining magazine slots are filled with free gray ammo.
- Each round in the magazine tracks its own `ammoDefinitionId`, so a single magazine can contain mixed-rarity rounds sorted by priority.

### Gray Ammo — Free Unlimited Fallback
Gray ammo (`ammo_white`) is a special tier with these rules:
- **Unlimited & free**: always available as a fallback; never runs out.
- **Damage ×0.8**: weaker than upgraded ammo and used as the floor-tier fallback.
- **Cannot be persisted**: `addAmmoToProfile()` and `removeAmmoFromProfile()` silently skip it; `createPersistentEntryFromLootItem()` returns `null` for it.
- **Cannot be extracted**: `recordExtraction()` skips gray ammo items.
- **Cannot be stored**: `moveItemToSafebox()` and `moveItemToBackpack()` throw errors for gray ammo.
- **Cannot be traded**: the market UI shows "Locked" for gray ammo; buy/sell operations throw errors.
- **Reserve shows ∞**: when no non-gray ammo is in the backpack, the HUD reserve counter displays `∞`.

Guard functions:
- `isFreeFallbackAmmo(definitionId)` — returns `true` for `ammo_white`.
- `isMarketLockedAmmo(definitionId)` — returns `true` for `ammo_white`.

### Shooting & Bullet Behavior
- Each shot shifts one round from `loadedAmmoQueue`.
- The bullet inherits the round's `damageMultiplier`, `instantKill` flag, and rarity **color**.
- `game.js` applies instant-kill logic: if `b.instantKill` is true, the bullet deals `e.maxHp` damage, killing any enemy in one hit.
- Bullets are rendered on canvas in the color of their ammo rarity via `b.color` in `renderer.js`.
- `.338 AP` additionally uses a custom premium projectile style with longer visuals and one-tile wall penetration.

### Auto-reload Triggers
1. **Raid start** — `reloadBestAvailableAmmo(true)` is called when the player spawns.
2. **Safebox → Backpack transfer** — if the moved item is ammo with higher priority than the currently loaded round, `reloadBestAvailableAmmo(true)` is called to upgrade the magazine.
3. **Manual reload** — standard reload timer applies as before.

---

## 11. Dynamic HUD Coloring

The weapon HUD text at the bottom of the screen dynamically changes color based on the highest-priority ammo currently loaded:
- `player.getWeaponHudInfo()` returns `{ text, color, ammoDefinitionId }` instead of the old plain-text function.
- `renderer.js` renders the HUD text with `weaponHud.color` at 16px bold with an 8px shadow glow for readability.
- When reloading, the color reflects the next round's rarity. When the magazine is empty and only gray fallback remains, the HUD color is gray.

---

## 12. Difficulty-based Death Penalties

On death, penalties are determined by the raid difficulty setting:

| Difficulty | Backpack Lost | Equipped Guns | Other Equipped Slots | Safebox |
|------------|---------------|---------------|----------------------|---------|
| **Easy** | Yes (always) | No | No | Safe |
| **Advanced** | Yes (always) | Always | 15% chance each | Safe |
| **Hell** | Yes (always) | Always | Always | Safe |
| **Chaos** | Yes (always) | Always | Always | 50% chance per safebox entry |

Implementation: `applyDeathLosses(profile, difficulty)` in `profile.js`:
- `easy` — returns immediately; only backpack contents are lost (handled separately by `applyRaidOutcome`).
- `advanced` — always removes all equipped guns from stash; each other equipped slot has a 15% independent chance of removal.
- `hell` — removes all equipped items from stash (every slot).
- `chaos` — uses the same equipped-item loss rules as Hell and can also remove safebox entries.
- In Chaos, each safebox entry has a **50% independent chance** to be lost on death.

`ProfileStore.applyRaidOutcome()` accepts a `difficulty` parameter from `game.js` (`this.activeDifficulty`).

---

## 13. Safebox

- The safebox is a protected storage area (capacity: `SAFEBOX_CAPACITY`) separate from the main stash.
- Items in the safebox are protected in all normal modes.
- **Chaos is the only exception**: each safebox entry has a 50% independent chance to be lost on death.
- Safebox ammo is **not auto-moved** to the backpack on raid start — the player must explicitly move items via a "Move to Backpack" action.
- Moving ammo from safebox to backpack can trigger an auto-reload if the transferred ammo has higher priority than the currently loaded round.
- Gray ammo cannot be placed in the safebox (it's free and unlimited).

The Chaos start flow explicitly warns the player about this added safebox risk before the raid begins.

---

## 14. Inventory Value and Run Summary Display

The top-right corner of the screen shows account information including:
- Username/login status
- **Inv Value** — displayed below the account info in gold (`#ffca28`), 13px, font-weight 900.
- Inv Value = total coins + the sum of `sellValue` for every item in stash, backpack, and safebox.
- Calculated by `getProfileInventoryValue(profile)` in `profile.js`.
- Rendered via an `.auth-status-value` span in the `.auth-status-button` container.

The menu and raid-result flow also expose value summaries:
- The selected preset panel shows **Est. Value of Loadout**.
- The extraction success page shows **Est. Extracted Value**.
- Extracted value counts only items gained during the raid and excludes items originally brought into the run by the player.

---

## 15. Redeem Code System

A **Redeem** button is displayed in the top-left bar next to the game brand. It opens a prompt for entering redemption codes:

| Code | Reward |
|------|--------|
| `oghyhk` | +10,000 coins |
| `2598` | Prompts for a custom coin amount to add |

Implementation: `redeemButton` click handler in `app.js` calls `ProfileStore.addCoins()` and re-renders the auth status.

---

## 16. Next Refinement Opportunities

Recommended next passes:
1. expand endgame gun/ammo content and high-risk loot progression
2. add stash filtering and sorting tools in inventory
3. harden the local API auth model before any wider release
4. add multiplayer-safe server authority for crate ownership, item pickup, and market sync
5. expose more AI/debug tuning controls directly through the dev tool

> Dev note: melee is no longer part of the live design, but the dev tool path still keeps melee-related authoring support so the system can be recreated quickly if desired later.

---

## 17. Changes Implemented Since the Last GitHub Pull

This section summarizes the major live-system changes that were implemented after the last sync from GitHub.

### 17.1 Dev Tool Layer Added

The project now includes a dedicated content-authoring toolchain:

- `dev.html` — browser-based content editor
- `dev.py` — CLI editor / importer / exporter
- `data/dev-config.json` — editable config source for tool-managed data
- `server.py` endpoints for dev-config loading/saving and image generation

The dev tool currently supports:

- equipment authoring
- consumable authoring
- ammo authoring
- enemy tuning
- crate tier tuning
- melee stat authoring for future restoration
- generated art export into `assets/dev/`

This separates gameplay content editing from direct hand-editing of runtime JS definitions while still preserving `js/profile.js` as the live gameplay authority.

### 17.2 Expanded Live Gear / Art Pass

The current repo now includes a larger live art/content set for weapons and ammo presentation, including imported weapon sprites and refreshed item art such as:

- G17
- G18
- AKM
- Groza
- Vector
- SR-25
- M14
- Marlin
- M250
- AWM
- AP ammo art
- Hammer art (`assets/items/Tool_Hammer.png`)

This supports both the live raid/inventory UI and the new dev-tool editing flow.

### 17.3 Shield System Added

Purple-and-above armor and helmets now support shield layers in live gameplay.

Key behavior:

- shields render as a separate light-blue segment on the health bar
- multiple shield sources can stack as layered protection
- higher-rarity shields are consumed before lower-rarity shields
- shield absorption depends on ammo rarity relative to shield rarity
- shields regenerate over time using each item's `shieldRegen`
- instant-kill rounds bypass shield protection entirely

This makes equipment rarity matter more directly in combat beyond flat HP bonuses.

### 17.4 Difficulty-based Map Scaling Reworked

Map generation now scales by difficulty much more aggressively:

| Difficulty | Map Size | Area Multiplier | Operators | Extractions |
|---|---|---:|---:|---:|
| Easy | 80×60 | 1× | 16–19 | 4 |
| Advanced | 80×60 | 1× | 16–19 | 4 |
| Hell | 160×120 | 4× | 16–19 | 2 |
| Chaos | 320×240 | 16× | 36–39 | 1 |

Additional consequences:

- walls / rooms / clusters scale with map size
- loot density and health-pack placement scale with area
- enemy counts scale with the larger map footprint
- Chaos now plays as a much larger operator-heavy raid instead of only a stat bump

### 17.5 Chaos Extraction Gate Added

Chaos difficulty now uses a locked extraction rule:

- the single extraction point starts locked
- it unlocks only after at least half of all operators are eliminated
- the HUD and kill feed clearly communicate the lock/unlock state
- AI operators are aware of the lock and do not pile onto extraction before it opens

This turns Chaos into a delayed-endgame fight rather than an immediate sprint-to-extract mode.

### 17.6 AI Navigation Upgraded to A*

AI navigation is no longer limited to naive direct pursuit.

The repo now includes `js/pathfinding.js`, which provides:

- A* pathfinding on the tile navigation grid
- path smoothing
- nearest-walkable fallback resolution
- waypoint-based movement for bot pursuit and roaming

Supporting map work in `map.js` ensures walkable connectivity so operators are less likely to get trapped behind invalid room layouts.

### 17.7 Persistent AI Operator Roster Expanded to 91

The AI roster system has been expanded from the earlier 49/66-account versions into a 91-operator persistent roster.

Current roster composition:

- 17 lv1 operators
- 19 lv2 operators
- 30 lv3 operators
- 25 lv4 operators

Each roster entry now has:

- permanent identity
- persistent raid stats
- persistent ELO
- level and type specialization (`fighter`, `searcher`, `runner`)

This allows AI opponents to behave more like a persistent population rather than disposable random bots.

### 17.8 Lv3 / Lv4 AI Combat Behaviors Improved

Higher-tier AI operators now use more advanced decision-making:

- cover-seeking before healing
- line-of-sight threat checks before consumable use
- path-based target pursuit when direct line-of-sight is blocked
- extraction awareness in Chaos
- more aggressive combat logic for endgame tiers

Lv4 operators specifically:

- share lv3 combat intelligence
- are restricted to gold/red loadouts
- spawn with effectively full premium ammo / consumable reserves
- appear rarely in Hell and much more often in Chaos

### 17.9 ELO / Leaderboard System Added and Reworked

The prototype now includes a live ELO progression layer for both players and persistent AI operators.

Recent updates changed the ELO model so that:

- killing a lower-ELO operator awards less ELO
- killing a higher-ELO operator awards more ELO
- each kill still grants at least `1` ELO
- dying to a lower-ELO opponent causes more ELO loss
- dying to a higher-ELO opponent causes less ELO loss
- AI roster entries use the same post-raid ELO framework

This replaces the older flatter kill-count-only ELO behavior with opponent-relative gain/loss.

### 17.10 QoL and Combat Handling Updates

Several live gameplay quality-of-life fixes were also added:

- continue button support on post-raid result screens
- abandon-item flows for inventory/loadout management
- auto-equip handling for guns and backpack interactions
- outrange damage attenuation support
- gravity-boots equipment effect support

Most recently, dual-gun handling was corrected so that:

- picking up a gun into the second gun slot does **not** forcibly switch the currently held weapon
- each gun preserves its own loaded clip state when switching between primary and secondary weapons
- switching back to a previously held gun restores its prior magazine contents instead of resetting the clip

### 17.11 Design Impact Summary

The live game is now materially different from the earlier pulled version in four major ways:

1. **Raids scale harder by difficulty** — especially Hell and Chaos.
2. **Bots are now a persistent competitive layer** with identities, levels, ELO, and stronger navigation.
3. **Gear depth is broader** through shields, premium AI tiers, improved ammo interactions, and richer item art/content support.
4. **Tooling is stronger** thanks to the dev UI/CLI workflow that now supports future balancing without direct code editing for every content change.
