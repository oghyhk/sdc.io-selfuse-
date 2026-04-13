// ============================================================
// constants.js — Game-wide configuration constants
// ============================================================

// Map
export const TILE_SIZE = 48;
export const MAP_COLS = 80;        // 80 * 48 = 3840 px
export const MAP_ROWS = 60;        // 60 * 48 = 2880 px
export const MAP_WIDTH = MAP_COLS * TILE_SIZE;
export const MAP_HEIGHT = MAP_ROWS * TILE_SIZE;

// Tile types
export const TILE = {
    FLOOR: 0,
    WALL: 1,
    FLOOR_DARK: 2,  // combat zone floor (visual only)
};

// Zone types (overlay metadata, separate from tile rendering)
export const ZONE = {
    SAFE: 0,
    COMBAT: 1,
    HIGH_VALUE: 2,
};

// Player
export const PLAYER_RADIUS = 14;
export const PLAYER_SPEED = 180;          // px/s
export const PLAYER_MAX_HP = 100;
export const PLAYER_MELEE_RANGE = 40;
export const PLAYER_MELEE_DAMAGE = 25;
export const PLAYER_MELEE_COOLDOWN = 0.4; // seconds
export const PLAYER_SHOOT_DAMAGE = 18;
export const PLAYER_SHOOT_COOLDOWN = 0.25;
export const PLAYER_BULLET_SPEED = 500;
export const PLAYER_BULLET_RANGE = 350;
export const PLAYER_DASH_SPEED = 450;
export const PLAYER_DASH_DURATION = 0.15;
export const PLAYER_DASH_COOLDOWN = 1.5;
export const PLAYER_BASE_CARRY_CAPACITY = 10;
export const PLAYER_MAX_ENERGY = 100;
export const PLAYER_ENERGY_DRAIN_PER_SECOND = 18;
export const PLAYER_ENERGY_RECOVERY_PER_SECOND = 24;
export const PLAYER_SLOW_SPEED_MULTIPLIER = 0.78;
export const PLAYER_ENERGY_RETURN_THRESHOLD = 0.2;

// Enemies
export const DRONE_RADIUS = 12;
export const DRONE_SPEED = 100;
export const DRONE_HP = 40;
export const DRONE_DAMAGE = 8;
export const DRONE_ATTACK_COOLDOWN = 0.8;
export const DRONE_SIGHT_RANGE = 250;
export const DRONE_CHASE_RANGE = 350;
export const DRONE_PATROL_RANGE = 150;

export const SENTINEL_RADIUS = 20;
export const SENTINEL_SPEED = 70;
export const SENTINEL_HP = 120;
export const SENTINEL_DAMAGE = 18;
export const SENTINEL_ATTACK_COOLDOWN = 1.2;
export const SENTINEL_SIGHT_RANGE = 200;
export const SENTINEL_CHASE_RANGE = 300;
export const SENTINEL_SHOOT_RANGE = 180;
export const SENTINEL_BULLET_SPEED = 300;

// Loot
export const LOOT_RADIUS = 10;
export const LOOT_VALUE_COMMON = 10;
export const LOOT_VALUE_RARE = 25;
export const LOOT_VALUE_EPIC = 50;
export const LOOT_PICKUP_RANGE = 30;
export const CRATE_INTERACT_RANGE = 78;
export const CRATE_WIDTH = 34;
export const CRATE_HEIGHT = 26;

// Health pack
export const HEALTHPACK_RADIUS = 10;
export const HEALTHPACK_HEAL = 30;

// Extraction
export const EXTRACTION_RADIUS = 50;
export const EXTRACTION_TIME = 3.0;  // seconds to extract

// Camera
export const CAMERA_LERP = 0.08;

// Colors
export const COLORS = {
    BG: '#1a1a2e',
    FLOOR: '#16213e',
    FLOOR_DARK: '#0f1a30',
    WALL: '#3a3a5c',
    WALL_STROKE: '#5a5a8c',
    GRID: 'rgba(255,255,255,0.03)',
    PLAYER: '#00e676',
    PLAYER_STROKE: '#00c853',
    PLAYER_DASH: '#b9f6ca',
    ENEMY_DRONE: '#ff5252',
    ENEMY_DRONE_STROKE: '#d32f2f',
    ENEMY_SENTINEL: '#ff6f00',
    ENEMY_SENTINEL_STROKE: '#e65100',
    BULLET_PLAYER: '#69f0ae',
    BULLET_ENEMY: '#ff8a80',
    LOOT_COMMON: '#ffd740',
    LOOT_RARE: '#40c4ff',
    LOOT_EPIC: '#ea80fc',
    CRATE: '#7a5a3a',
    CRATE_DARK: '#573d25',
    CRATE_OPENED: '#a36f3d',
    CRATE_INTERACT: '#fff59d',
    HEALTHPACK: '#76ff03',
    EXTRACTION: '#448aff',
    EXTRACTION_ACTIVE: '#82b1ff',
    EXTRACTION_GLOW: 'rgba(68,138,255,0.15)',
    HP_BAR_BG: '#333',
    HP_BAR: '#00e676',
    HP_BAR_LOW: '#ff5252',
    MINIMAP_BG: 'rgba(0,0,0,0.6)',
    MINIMAP_WALL: '#5a5a8c',
    MINIMAP_PLAYER: '#00e676',
    MINIMAP_ENEMY: '#ff5252',
    MINIMAP_LOOT: '#ffd740',
    MINIMAP_EXTRACTION: '#448aff',
    HUD_TEXT: '#ffffff',
    HUD_SHADOW: 'rgba(0,0,0,0.5)',
    CROSSHAIR: 'rgba(255,255,255,0.7)',
    DAMAGE_FLASH: 'rgba(255,0,0,0.3)',
};
