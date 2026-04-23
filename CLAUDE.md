# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
Normally, only work on the primary project. You have the right to access the whole /Coding directory but only access other project when the user asked to.
If you worked on any new project with the user, make notes similar the primary project's in CLAUDE.md (this file).

## Primary Project: SDC.IO

Location: `Games/sdc.io/`
Github repo link of the game: https://github.com/oghyhk/sdc_io_localfork
SDC.IO is a 2D top-down extraction shooter with AI operators, loot crates, and equipment-based progression. You must prevent player data lost and only test with testing credentials when working in this project.
When making large or risky changes, commit to github before doing so if not commited.
Update your CLAUDE.md (this file) about it when a large change is made. (for example switching server of the game.)

### Running the Game

```bash
cd Games/sdc.io
python server.py
```
The game runs on a VPS with link to the game as http://72.62.252.75:8765

The server runs on port 8765 by default.

### Dev Tool

Content authoring is done through `dev.html` (browser UI) or `dev.py` (CLI):

```bash
cd Games/sdc.io

# CLI examples
python dev.py list items
python dev.py list crates
python dev.py add item --name "Test" --rarity blue --category gun --damage 30
python dev.py edit item --id g17 --field stats.damage --value 15
python dev.py delete item --id test_item

# Export/import content
python dev.py export
python dev.py import --input backup.json

# Image generation
python dev.py generate-image --id my_item
```

Edit content via dev tool, which writes to `data/dev-config.json`. **Runtime source of truth is `js/profile.js`** — sync changes when gameplay systems update.

Public browser-loaded files now live under `Games/sdc.io/client/`. Static pages such as `index.html` and `dev.html`, plus `assets/` and `js/`, are served from that folder by `server.py`.

### Architecture

```
client/
  index.html      — Main game entry point + DOM overlays
  dev.html        — Browser content editor
  assets/         — Public game art and item icons
  js/
  profile.js     — Item catalog (ITEM_DEFS), rarity data, loadout logic, stash persistence
  game.js        — Main loop, raid state, extraction, crate interaction
  player.js      — Movement, loadout stats, carried items
  enemy.js       — AI operators with A* pathfinding (via js/pathfinding.js)
  map.js         — Procedural map generation
  renderer.js    — Canvas rendering
  input.js       — Keyboard/mouse commands (WASD, E to switch guns, Q consumable, F crate)
  app.js         — Menu, inventory, market, auth UI
  audio.js       — Procedural sound
  constants.js   — Shared config
  utils.js       — Math/collision helpers

server.py        — Local API server (Python) for user data, profile persistence, image generation
dev.py           — CLI content editor
data/
  dev-config.json — Editable content source
  users.json     — Player profiles (auto-created)
```

### Key Game Systems

**Rarity Ladder** (highest → lowest): Legend > Red > Gold > Purple > Blue > Green > White > Gray

**Equipment Slots**: gunPrimary, gunSecondary, armor, helmet, shoes, backpack (6 slots)

**Difficulty Scaling**:
| Difficulty | Map Size | Area Multi | Operators | Extractions |
|------------|----------|------------|-----------|-------------|
| Easy/Advanced | 80×60 | 1× | 16–19 | 4 |
| Hell | 160×120 | 4× | 16–19 | 2 |
| Chaos | 320×240 | 16× | 36–39 | 1 (locked until half die) |

**AI Operator Levels**: lv1, lv2, lv3, lv4, boss (special high-difficulty spawn)

**Shield System**: Purple+ armor/helmets add energy shields with regen. Shield absorption depends on ammo rarity vs shield rarity.

**ELO System**: Easy excluded. K-values: Advanced=5, Hell=12, Chaos=30. Kill bonuses scale by difficulty multiplier.

### Adding New Content

1. Use `python dev.py add item ...` or dev.html
2. Item images go in `client/assets/items/` (512x512 PNG)
3. Run `python dev.py export` to verify content
4. Item ID must match image filename without extension (e.g., `awm` → `client/assets/items/awm.png`)

## Coding Rules

### Core Principles (Non‑Negotiable)

**1. Think Before Coding**
Do not assume. Do not guess silently.
Before writing or modifying code, explicitly state key assumptions, surface ambiguity instead of resolving it implicitly, and ask clarifying questions when requirements are unclear. Stop execution and ask when confused.

**2. Simplicity First**
Minimum code that solves the stated problem. Nothing more. Implement the simplest correct solution, avoid speculative abstractions, and avoid premature generalization. If 200 lines can be rewritten as 50, rewrite it.

**3. Surgical Changes**
Touch only what is required by the task. Modify only code that directly relates to the request. Match existing project style and conventions. Every changed line must be traceable to the user's request.

**4. Goal‑Driven Execution**
Tasks must be expressed as verifiable success criteria. Translate vague instructions into measurable goals. State what "done" means before implementing. Do not stop when code is written—stop when success is verified.

### Execution Pattern

For non‑trivial tasks, follow this loop:
1. **Clarify** — State assumptions, ask questions if needed
2. **Plan** — Brief, minimal plan, note tradeoffs if applicable
3. **Execute** — Write the smallest correct implementation, make only surgical modifications
4. **Verify** — Run or reason through tests, explicitly confirm completion criteria are met

### When You Must Ask Questions

Stop and ask before coding if:
- Requirements are ambiguous
- Multiple reasonable interpretations exist
- Success criteria are undefined
- The task risks large or irreversible changes

### Priority Order

When rules conflict, obey this order:
1. Think Before Coding
2. Simplicity First
3. Surgical Changes
4. Goal‑Driven Execution

**This file is not about coding style. It is about decision discipline. Follow it strictly.**

