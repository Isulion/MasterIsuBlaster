# Master Blaster - Retro Bomberman Game Specification

## Overview
Create a polished retro Bomberman clone (1994-inspired) using **React + Vite + Tailwind CSS** with canvas-based gameplay. The game must run at 60+ FPS with smooth movement, strict pixel-accurate collisions, and intelligent AI.

---

## Architecture

### File Structure
```
src/
├── game/
│   ├── types.ts      # All TypeScript interfaces
│   ├── constants.ts  # Game constants and config
│   ├── audio.ts      # Web Audio API sound effects
│   ├── map.ts        # Map generation
│   ├── renderer.ts   # Canvas rendering (retro pixel art)
│   ├── ai.ts         # AI decision system
│   └── engine.ts     # Core game loop, physics, collisions
├── components/
│   ├── Menu.tsx      # Main menu with options
│   └── Game.tsx      # Game canvas wrapper
└── App.tsx           # Root component (menu/game router)
```

---

## Type Definitions (types.ts)

### CRITICAL: Define ALL fields upfront to avoid TypeScript errors later

```typescript
export type MapSize = 'small' | 'medium' | 'large';
export type GameMode = 'solo' | 'pvp' | 'aionly';
export type Direction = 'up' | 'down' | 'left' | 'right' | 'none';
export type TileType = 'empty' | 'wall' | 'brick';

// All power-up types including special ones
export type PowerUpType = 
  | 'bomb'      // +1 max bombs
  | 'flame'     // +1 flame range
  | 'speed'     // +1 speed level
  | 'bomb2'     // +2 max bombs (golden)
  | 'flame2'    // +2 flame range (golden)
  | 'speed2'    // +2 speed levels (golden)
  | 'fullfire'  // max flame range
  | 'pierce'    // flames pierce through bricks
  | 'shield'    // survive one explosion
  | 'skull';    // random negative effect

export type SkullEffect = 
  | 'slow'         // half speed
  | 'constipation' // can't place bombs
  | 'diarrhea'     // auto-place bombs
  | 'short'        // flame range = 1
  | 'reverse';     // reversed controls

export interface Player {
  id: number;
  x: number;                    // pixel position (center)
  y: number;
  speed: number;
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
  placedBombTiles: Set<string>; // for walk-through-own-bomb mechanic
  invincibleTimer: number;
  // Power-up states
  hasPierce: boolean;
  hasShield: boolean;
  skullEffect: SkullEffect | null;
  skullTimer: number;
}

export interface Bomb {
  gx: number;
  gy: number;
  ownerId: number;
  timer: number;
  range: number;
  animTimer: number;
  pierce: boolean;    // IMPORTANT: track if this bomb pierces
}

export interface PowerUp {
  gx: number;
  gy: number;
  type: PowerUpType;
  animTimer: number;
  immuneTimer: number;  // CRITICAL: prevents instant destruction by the explosion that revealed it
}

export interface Explosion {
  gx: number;
  gy: number;
  timer: number;
  direction: 'center' | 'up' | 'down' | 'left' | 'right';
  isEnd: boolean;
}
```

---

## Critical Implementation Details

### 1. Power-Up Spawn Immunity (MOST COMMON BUG)

**Problem:** When a bomb destroys a brick containing a power-up, the explosion is still active on that tile. The power-up spawns and immediately gets destroyed by the same explosion.

**Solution:** Give newly spawned power-ups an `immuneTimer` equal to `EXPLOSION_DURATION + 0.1`:

```typescript
function destroyBrick(state, gx, gy, tile) {
  if (tile.powerUp) {
    state.powerUps.push({
      gx, gy,
      type: tile.powerUp,
      animTimer: 0,
      immuneTimer: EXPLOSION_DURATION + 0.1  // <-- CRITICAL
    });
  }
  state.tiles[gy][gx] = { type: 'empty' };
}

function updateExplosions(state, dt) {
  // Tick down immunity
  for (const pu of state.powerUps) {
    if (pu.immuneTimer > 0) pu.immuneTimer -= dt;
  }
  
  // Only destroy non-immune power-ups
  for (const exp of state.explosions) {
    if (exp.timer <= 0) continue;
    state.powerUps = state.powerUps.filter(
      pu => !(pu.gx === exp.gx && pu.gy === exp.gy && pu.immuneTimer <= 0)
    );
  }
}
```

---

### 2. Bomb Walk-Through Mechanic (COLLISION BUG)

**Problem:** Player places bomb, can walk off it, but gets stuck when their center moves to next tile while collision box corner still overlaps bomb.

**Solution:** Use AABB overlap test, not grid-center comparison:

```typescript
// WRONG - causes getting stuck:
const pgx = Math.floor(player.x / T);
const pgy = Math.floor(player.y / T);
if (pgx !== bombGx || pgy !== bombGy) {
  player.placedBombTiles.delete(key);  // Removed too early!
}

// CORRECT - full AABB overlap test:
for (const key of player.placedBombTiles) {
  const [bx, by] = key.split(',').map(Number);
  const tileLeft = bx * T, tileRight = (bx + 1) * T;
  const tileTop = by * T, tileBottom = (by + 1) * T;
  const pLeft = player.x - halfW, pRight = player.x + halfW;
  const pTop = player.y - halfH, pBottom = player.y + halfH;
  
  const overlaps = pRight > tileLeft && pLeft < tileRight &&
                   pBottom > tileTop && pTop < tileBottom;
  if (!overlaps) {
    player.placedBombTiles.delete(key);
  }
}
```

---

### 3. AI Self-Kill Prevention (AI DEATH BUG)

**Problem:** AI places bomb and dies to its own explosion.

**Root Causes & Solutions:**

#### A. Danger Map Must Use Timed Values
```typescript
// WRONG - flat danger value:
danger[y][x] = 999;  // Can't distinguish "exploding now" vs "exploding in 2.5s"

// CORRECT - store time until explosion:
danger[y][x] = bomb.timer;  // Lower = more urgent
const EXPLODING_NOW = 0.001;  // Sentinel for active explosions
```

#### B. Chain Explosion Propagation
```typescript
// Iterate until stable - if bomb A hits bomb B, B detonates at A's timer
for (let iter = 0; iter < 10; iter++) {
  let changed = false;
  for (const bomb of bombs) {
    // For each blast cell, check if it hits another bomb
    // If so, set other bomb's timer = min(other.timer, this.timer)
  }
  if (!changed) break;
}
```

#### C. Escape BFS Must Allow Walking Off Own Bomb
```typescript
function findSafePath(state, startGx, startGy, danger, allowBombAt?) {
  // On first step, allow walking through the bomb at allowBombAt
  const allow = curr.path.length === 0 ? allowBombAt : undefined;
  if (!isWalkable(state, nx, ny, allow)) continue;
}

function canEscapeBomb(state, player, bombGx, bombGy) {
  const fakeBomb = { gx: bombGx, gy: bombGy, ... };
  const fakeState = { ...state, bombs: [...state.bombs, fakeBomb] };
  const bombKey = `${bombGx},${bombGy}`;
  
  // Allow walking off the bomb tile on first step
  const safePath = findSafePath(fakeState, bombGx, bombGy, danger, bombKey);
  
  // Validate path length vs bomb timer
  const tileTime = T / player.speed;
  const maxSteps = Math.floor(BOMB_TIMER / tileTime) - 1;
  if (safePath.length > maxSteps) return false;
  
  // Validate each cell won't explode before we reach it
  for (let i = 0; i < safePath.length; i++) {
    const arrivalTime = (i + 1) * tileTime;
    if (danger[cell.gy][cell.gx] > 0 && danger[cell.gy][cell.gx] <= arrivalTime) {
      return false;
    }
  }
  return true;
}
```

#### D. Re-query AI Immediately After Placing Bomb
```typescript
function updateAIPlayer(state, player, dt) {
  if (timer <= 0) {
    let action = decideAI(state, player);
    
    if (action.placeBomb) {
      tryPlaceBomb(state, player);
      // CRITICAL: Re-query so AI starts escaping THIS frame
      action = decideAI(state, player);
    }
    
    aiDirs.set(player.id, action.direction);
  }
}
```

---

### 4. Pierce Bomb Handling

Pierce bombs continue through bricks instead of stopping. Must update:

1. **Explosion logic:**
```typescript
if (tile.type === 'brick') {
  destroyBrick(state, nx, ny, tile);
  if (!bomb.pierce) break;  // Normal bombs stop
  continue;                  // Pierce bombs continue
}
```

2. **AI danger map:**
```typescript
if (tile.type === 'brick' && !bomb.pierce) break;
```

3. **Visual distinction:** Green tint + ring around pierce bombs

---

### 5. Skull Effects Implementation

```typescript
// In movement:
const effectiveSpeed = player.skullEffect === 'slow' ? player.speed * 0.5 : player.speed;

// In bomb placement:
if (player.skullEffect === 'constipation') return;
const effectiveRange = player.skullEffect === 'short' ? 1 : player.flameRange;

// In input handling (reverse controls):
if (player.skullEffect === 'reverse') {
  dir = { up: 'down', down: 'up', left: 'right', right: 'left' }[dir];
}

// Diarrhea auto-bomb in update loop:
if (player.skullEffect === 'diarrhea' && Math.random() < dt * 2) {
  tryPlaceBomb(state, player);
}

// Timer countdown:
if (player.skullTimer > 0) {
  player.skullTimer -= dt;
  if (player.skullTimer <= 0) player.skullEffect = null;
}
```

---

### 6. Shield Mechanic

```typescript
function killPlayer(state, player) {
  if (player.hasShield) {
    player.hasShield = false;
    player.invincibleTimer = 1.5;  // Brief immunity after shield break
    playShieldBreak();
    return;  // Don't die
  }
  player.alive = false;
  playDeath();
}
```

---

### 7. AI Priority System

Strict priority order (check in sequence, return on first match):

1. **SURVIVAL** - If in danger, find escape path immediately
2. **POWER-UPS** - Path to nearby power-ups (avoid skulls!)
3. **OFFENSE** - If enemy in blast range AND can escape, place bomb
4. **CLEARING** - If adjacent to brick AND can escape, place bomb
5. **WANDER** - Move toward enemies or random safe direction

```typescript
// AI avoids skull power-ups:
const puPath = findPath(state, gx, gy, (px, py) => {
  return state.powerUps.some(p => p.gx === px && p.gy === py && p.type !== 'skull');
}, danger, 10);
```

---

### 8. Smooth AI Movement

Snap AI to grid center on perpendicular axis to prevent getting stuck:

```typescript
if (dir === 'up' || dir === 'down') {
  // Snap X toward center
  const centerX = Math.floor(player.x / T) * T + T / 2;
  player.x += (centerX - player.x) * Math.min(1, 6 * dt);
}
```

---

## Power-Up Distribution

Weighted random selection when brick is destroyed:
- bomb (25%), flame (25%), speed (20%)
- bomb2 (7%), flame2 (7%), speed2 (4%)
- fullfire (3%), pierce (3%), shield (3%), skull (3%)

---

## Constants

```typescript
export const TILE_SIZE = 40;
export const BOMB_TIMER = 2.5;
export const EXPLOSION_DURATION = 0.5;
export const BASE_SPEED = 120;
export const SPEED_BOOST = 20;
export const MAX_FLAME = 8;
export const MAX_BOMBS = 8;
export const MAX_SPEED_BOOSTS = 6;
export const SKULL_DURATION = 8.0;
export const SPAWN_INVINCIBILITY = 1.5;
export const POWERUP_CHANCE = 0.35;

export const MAP_SIZES = {
  small:  { cols: 13, rows: 11 },
  medium: { cols: 17, rows: 13 },
  large:  { cols: 21, rows: 15 },
};
```

---

## Rendering Notes

1. **HUD Height:** 32px above game area for player stats
2. **Player indicators:** Shield ring, skull icon, pierce lightning bolt
3. **Pierce bombs:** Green tint with glowing ring
4. **Golden power-ups:** Sparkle effect for +2 variants
5. **Skull power-ups:** Purple pulsing effect

---

## Audio (Web Audio API)

Simple synth sounds:
- `playPlaceBomb()` - Descending square wave
- `playExplosion()` - Noise burst with lowpass filter
- `playPowerUp()` - Ascending arpeggio
- `playDeath()` - Descending sawtooth
- `playSkull()` - Eerie dissonant tone
- `playShieldBreak()` - Glass-break sound
- `playWin()` - Victory jingle

---

## Menu Features

1. Map size selector (small/medium/large with dimensions shown)
2. Game mode (Solo vs AI, 1v1 PvP, AI Battle)
3. Custom key bindings with click-to-rebind
4. Animated retro title
5. Start button with hover effects

---

## Testing Checklist

Before considering complete, verify:

- [ ] Power-ups appear when bricks are destroyed
- [ ] AI doesn't kill itself with its own bombs
- [ ] Player can walk off their own bomb but not back through it
- [ ] Pierce bombs blast through multiple bricks
- [ ] Shield blocks one death
- [ ] All skull effects work correctly
- [ ] Game ends when one player remains
- [ ] No white screen / runtime errors
- [ ] 60 FPS performance

---

## Common Mistakes to Avoid

1. **Don't use flat danger values** - Use timed values for AI safety
2. **Don't check grid center for bomb overlap** - Use full AABB test
3. **Don't forget power-up immunity timer** - Or they vanish instantly
4. **Don't forget to re-query AI after bomb placement** - Or AI stands still
5. **Don't forget pierce flag on bombs** - Track it per-bomb, not per-player
6. **Don't inline imports mid-file** - Put all imports at top
7. **Don't forget all interface fields** - TypeScript will error later
