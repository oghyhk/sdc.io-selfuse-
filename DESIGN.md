# SDC.IO — Game Design Document

## 1. Core Gameplay Loop

**Prepare Loadout → Enter Raid → Open Crates → Take Items → Fight → Extract**

1. The player selects a six-slot loadout from the menu inventory.
2. The player deploys into a 2D top-down map with enemies, combat zones, loot-crate rooms, and extraction points.
3. Loot is no longer loose cash on the ground. Instead, the player must move beside a crate and press `F` to open or close it.
4. Each crate contains **1 to 4 items**. Items are shown in a centered loot panel and can be taken individually by clicking them.
5. Opened crates remain visually marked as already inspected even after they are closed.
6. The player survives combat, manages carry capacity, and decides which items are worth taking.
7. Standing inside an extraction zone for 3 seconds secures the carried items into the player stash for later trading.
8. Death still causes full run failure.

---

## 2. Item Model

### Six Equipment Classes
The current prototype now treats all major loot as one of these six categories:

1. **Guns**
2. **Melee Weapons**
3. **Armors**
4. **Helmets**
5. **Shoes**
6. **Backpacks**

The player inventory screen supports equipping one item from each class.

### Example Items
Current placeholder examples include:

- **Guns**: Militia Carbine, Ranger SMG, Eclipse DMR, Aurora LMG, Inferno Railgun
- **Melee Weapons**: Field Knife, Breach Hatchet, Ion Blade, Revenant Machete
- **Armors**: Cloth Vest, Ranger Plate, Titan Rig
- **Helmets**: Scout Cap, Recon Helmet, Eclipse Visor
- **Shoes**: Trail Shoes, Runner Boots, Phase Greaves
- **Backpacks**: Sling Pack, Scout Pack, Mule Pack, Void Satchel

These are placeholder content only and are intended to be refined later.

### Rarity Ladder
All items, including equipment, follow this rarity order from highest to lowest:

**Red > Gold > Purple > Blue > Green > White**

Rarity affects:
- visual color coding
- crate excitement/readability
- market value
- equipment quality and stat expectations

---

## 3. Loot Crates

### Crate Behavior
- Crates are distributed across safe, combat, and high-value zones.
- The player must be within interaction range.
- Pressing `F` toggles the nearest crate open or closed.
- Once opened at least once, a crate is marked as **inspected** visually.
- Crates may become empty after all items are taken.

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

---

## 5. Technical Structure

```
index.html          — Entry point + DOM overlays
js/
  app.js            — Menu, inventory, auth, and crate-panel UI
  game.js           — Main loop, raid state, extraction summary, crate interaction
  player.js         — Player movement, loadout stats, carried items
  enemy.js          — AI enemies
  map.js            — Procedural map generation and crate placement
  renderer.js       — Canvas rendering for world, crates, HUD, minimap
  profile.js        — Item catalog, rarity data, stash persistence, loadout logic
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
- equip one item for each of the six categories
- review stash totals by rarity

### Market Layer
The market page allows the player to:
- buy any currently defined item for coins
- sell owned items back for coins
- compare rarity, category, and owned counts in one place

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
- melee damage / melee cooldown
- armor and helmet max HP
- shoes movement speed
- backpack carry capacity

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

### Controls
- `WASD` / arrow keys: move
- mouse: aim
- left click: shoot
- `Space`: dash
- `R`: toggle normal / slow movement mode
- `F`: open / close nearby crate
- click loot entries in the crate panel: take item

---

## 10. Next Refinement Opportunities

Recommended next passes:
1. add true melee attack input and enemy stagger
2. add item size / slot weight instead of simple carry count
3. add dedicated ammo / meds / valuables item classes
4. add stash filtering and sorting tools in inventory
5. harden the local API auth model before any wider release
6. add multiplayer-safe server authority for crate ownership, item pickup, and market sync
