// ============================================================
// Master Blaster - Game Types
// ============================================================

/** Map size presets */
export type MapSize = 'small' | 'medium' | 'large' | 'huge' | 'mega';

/** Game mode */
export type GameMode = 'solo' | 'pvp' | 'aionly' | 'ai10' | 'ai20' | 'ai40';

/** Power-up types */
export type PowerUpType = 
  | 'bomb'      // +1 max bombs
  | 'flame'     // +1 flame range
  | 'speed'     // +1 speed level
  | 'bomb2'     // +2 max bombs (golden)
  | 'flame2'    // +2 flame range (golden)
  | 'speed2'    // +2 speed levels (golden)
  | 'fullfire'  // max flame range (8)
  | 'pierce'    // flames pierce through bricks
  | 'shield'    // survive one explosion
  | 'skull';    // random negative effect

/** Direction for movement */
export type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

/** Tile type in the grid */
export type TileType = 'empty' | 'wall' | 'brick' | 'powerup';

/** Key binding set for a player */
export interface KeyBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  bomb: string;
}

/** Grid position */
export interface GridPos {
  gx: number;
  gy: number;
}

/** A tile on the map */
export interface Tile {
  type: TileType;
  powerUp?: PowerUpType; // hidden under brick or visible on empty
}

/** A player or AI entity */
export interface Player {
  id: number;
  x: number;      // pixel position (center)
  y: number;
  speed: number;   // pixels per second
  bombCount: number;
  maxBombs: number;
  flameRange: number;
  alive: boolean;
  isAI: boolean;
  direction: Direction;
  animFrame: number;
  animTimer: number;
  color: string;
  name: string;
  keys: KeyBindings;
  // Track which bomb tile the player is currently standing on (for walk-through-own-bomb)
  placedBombTiles: Set<string>;
  invincibleTimer: number; // brief invincibility after spawn
  // Power-up effects
  hasPierce: boolean;      // flames pierce through bricks
  hasShield: boolean;      // survive one explosion
  // Skull effects (temporary)
  skullEffect: SkullEffect | null;
  skullTimer: number;      // seconds remaining
  // Inventory — every power-up picked up is recorded so it can
  // be scattered on the map when the player dies.
  inventory: PowerUpType[];
}

/** Skull curse effects */
export type SkullEffect = 
  | 'slow'        // half speed
  | 'constipation' // can't place bombs
  | 'diarrhea'    // auto-place bombs constantly
  | 'short'       // flame range = 1
  | 'reverse';    // reversed controls

/** A bomb on the map */
export interface Bomb {
  gx: number;
  gy: number;
  ownerId: number;
  timer: number;      // seconds remaining
  range: number;
  animTimer: number;
  pierce: boolean;    // flames go through bricks
}

/** An explosion cell */
export interface Explosion {
  gx: number;
  gy: number;
  timer: number;      // seconds remaining
  direction: 'center' | 'up' | 'down' | 'left' | 'right';
  isEnd: boolean;     // is this the end of the flame arm?
}

/** Power-up entity on the map */
export interface PowerUp {
  gx: number;
  gy: number;
  type: PowerUpType;
  animTimer: number;
  /** Immunity timer — while > 0 explosions won't destroy this power-up.
   *  Set when revealed from a brick so the same blast doesn't delete it. */
  immuneTimer: number;
}

/** Particle for visual effects */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/** The full game state */
export interface GameState {
  cols: number;
  rows: number;
  tileSize: number;
  tiles: Tile[][];         // tiles[gy][gx]
  players: Player[];
  bombs: Bomb[];
  explosions: Explosion[];
  powerUps: PowerUp[];
  particles: Particle[];
  gameOver: boolean;
  winner: string | null;
  paused: boolean;
  gameTime: number;
  shakeTimer: number;
  shakeIntensity: number;
}

/** Menu configuration */
export interface GameConfig {
  mapSize: MapSize;
  mode: GameMode;
  playerKeys: KeyBindings[];
}

/** Map size dimensions */
export interface MapDimensions {
  cols: number;
  rows: number;
}
