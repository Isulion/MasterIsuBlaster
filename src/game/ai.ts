// ============================================================
// Master Blaster - AI System (Hardened)
// Priority: 1) Survive  2) Power-ups  3) Offense  4) Clear
//
// Key fixes for self-kill prevention:
//   - Danger map uses timed urgency (not flat 999) so AI can
//     distinguish "about to explode" from "just placed".
//   - canEscapeBomb simulates the bomb AND allows the AI to
//     walk off its own bomb tile (first step) before BFS.
//   - Escape BFS validates every step of the path is reachable
//     before the blast arrives.
//   - Chain-explosion propagation in danger map.
//   - Conservative escape-length requirement scales with range.
// ============================================================

import { GameState, Player, Direction, Bomb, GridPos } from './types';
import { BOMB_TIMER } from './constants';

const T = 40;
const DIRS: { dir: Direction; dx: number; dy: number }[] = [
  { dir: 'up', dx: 0, dy: -1 },
  { dir: 'down', dx: 0, dy: 1 },
  { dir: 'left', dx: -1, dy: 0 },
  { dir: 'right', dx: 1, dy: 0 },
];

/** AI decision output */
export interface AIAction {
  direction: Direction;
  placeBomb: boolean;
}

/** Track AI state to prevent loops */
interface AIMemory {
  lastPositions: string[];
  lastDecisionTime: number;
  currentTarget: GridPos | null;
  stuckCounter: number;
}

const aiMemories = new Map<number, AIMemory>();

function getMemory(id: number): AIMemory {
  if (!aiMemories.has(id)) {
    aiMemories.set(id, {
      lastPositions: [],
      lastDecisionTime: 0,
      currentTarget: null,
      stuckCounter: 0,
    });
  }
  return aiMemories.get(id)!;
}

/** Reset AI memories (on game start) */
export function resetAI() {
  aiMemories.clear();
}

// ============================================================
// Danger Map
// ============================================================
// Each cell stores the *minimum time until it becomes lethal*.
//   0  = currently safe
//  >0  = dangerous – value is seconds until detonation
//        (lower = more urgent; anything > 0 means "will be hit")
// We also flag cells that are *already* exploding with a tiny
// sentinel (0.001) so AI treats them as instant-death.

const EXPLODING_NOW = 0.001; // sentinel for active explosion tiles

function buildDangerMap(state: GameState): number[][] {
  const { cols, rows } = state;
  const danger: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  // --- Mark active explosions as instant-death ---
  for (const exp of state.explosions) {
    danger[exp.gy][exp.gx] = EXPLODING_NOW;
  }

  // --- Collect all bombs; resolve chain timers ---
  // If bomb A's blast reaches bomb B, B detonates at A's timer
  // (whichever is sooner). We iterate until stable.
  const bombTimers = new Map<string, number>();
  for (const bomb of state.bombs) {
    bombTimers.set(`${bomb.gx},${bomb.gy}`, bomb.timer);
  }

  // Propagate chains (simple fixed-point, max 10 iterations)
  for (let iter = 0; iter < 10; iter++) {
    let changed = false;
    for (const bomb of state.bombs) {
      const myTime = bombTimers.get(`${bomb.gx},${bomb.gy}`)!;
      for (const { dx, dy } of DIRS) {
        for (let i = 1; i <= bomb.range; i++) {
          const nx = bomb.gx + dx * i;
          const ny = bomb.gy + dy * i;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) break;
          const tile = state.tiles[ny][nx];
          if (tile.type === 'wall') break;
          // Does this blast hit another bomb?
          const otherKey = `${nx},${ny}`;
          const otherTime = bombTimers.get(otherKey);
          if (otherTime !== undefined && otherTime > myTime) {
            // Chain: the other bomb detonates when this one does
            bombTimers.set(otherKey, myTime);
            changed = true;
          }
          if (tile.type === 'brick' && !bomb.pierce) break;
        }
      }
    }
    if (!changed) break;
  }

  // --- Paint danger zones from each bomb ---
  for (const bomb of state.bombs) {
    const bombTime = bombTimers.get(`${bomb.gx},${bomb.gy}`) ?? bomb.timer;

    // The bomb tile itself
    markDanger(danger, bomb.gx, bomb.gy, bombTime);

    for (const { dx, dy } of DIRS) {
      for (let i = 1; i <= bomb.range; i++) {
        const nx = bomb.gx + dx * i;
        const ny = bomb.gy + dy * i;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) break;
        const tile = state.tiles[ny][nx];
        if (tile.type === 'wall') break;
        markDanger(danger, nx, ny, bombTime);
        // Pierce bombs go through bricks, normal bombs stop
        if (tile.type === 'brick' && !bomb.pierce) break;
      }
    }
  }

  return danger;
}

/** Set danger for a cell – keep the MOST URGENT (smallest positive) value */
function markDanger(danger: number[][], gx: number, gy: number, time: number) {
  const t = Math.max(time, EXPLODING_NOW); // clamp to sentinel minimum
  if (danger[gy][gx] === 0 || t < danger[gy][gx]) {
    danger[gy][gx] = t;
  }
}

/** Is a cell dangerous? (any positive danger value) */
function isDangerous(danger: number[][], gx: number, gy: number): boolean {
  return danger[gy][gx] > 0;
}

// ============================================================
// Walkability helpers
// ============================================================

/** Check if a grid cell is walkable for pathfinding.
 *  `allowBombAt` lets us whitelist one bomb tile (the one we're standing on). */
function isWalkable(
  state: GameState, gx: number, gy: number,
  allowBombAt?: string,
): boolean {
  if (gx < 0 || gy < 0 || gx >= state.cols || gy >= state.rows) return false;
  const tile = state.tiles[gy][gx];
  if (tile.type === 'wall' || tile.type === 'brick') return false;
  for (const bomb of state.bombs) {
    if (bomb.gx === gx && bomb.gy === gy) {
      if (allowBombAt === `${gx},${gy}`) continue; // owner standing on it
      return false;
    }
  }
  return true;
}

// ============================================================
// Pathfinding
// ============================================================

/** BFS to find the shortest path to a safe (danger==0) cell.
 *  The AI may currently be standing on a bomb it just placed, so
 *  we whitelist that tile for the first hop. */
function findSafePath(
  state: GameState,
  startGx: number, startGy: number,
  danger: number[][],
  allowBombAt?: string,
): GridPos[] | null {
  const visited = new Set<string>();
  const queue: { gx: number; gy: number; path: GridPos[] }[] = [
    { gx: startGx, gy: startGy, path: [] },
  ];
  visited.add(`${startGx},${startGy}`);

  while (queue.length > 0) {
    const curr = queue.shift()!;

    // Found a safe tile (and it's not the starting tile)
    if (!isDangerous(danger, curr.gx, curr.gy) && curr.path.length > 0) {
      return curr.path;
    }

    // Don't search too deep (performance guard)
    if (curr.path.length >= 12) continue;

    for (const { dx, dy } of DIRS) {
      const nx = curr.gx + dx;
      const ny = curr.gy + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      // On the first step out, allow walking off our own bomb
      const allow = curr.path.length === 0 ? allowBombAt : undefined;
      if (!isWalkable(state, nx, ny, allow)) continue;
      visited.add(key);
      queue.push({
        gx: nx, gy: ny,
        path: [...curr.path, { gx: nx, gy: ny }],
      });
    }
  }
  return null;
}

/** BFS to find nearest cell matching a predicate.
 *  Only walks through safe+walkable cells.
 *  Avoids stepping on skull power-ups. */
function findPath(
  state: GameState,
  startGx: number, startGy: number,
  predicate: (gx: number, gy: number) => boolean,
  danger: number[][],
  maxDist: number = 20,
): GridPos[] | null {
  const visited = new Set<string>();
  const queue: { gx: number; gy: number; path: GridPos[] }[] = [
    { gx: startGx, gy: startGy, path: [] },
  ];
  visited.add(`${startGx},${startGy}`);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.path.length > maxDist) continue;

    if (predicate(curr.gx, curr.gy) && curr.path.length > 0) {
      return curr.path;
    }

    for (const { dx, dy } of DIRS) {
      const nx = curr.gx + dx;
      const ny = curr.gy + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;
      if (!isWalkable(state, nx, ny)) continue;
      // Don't path through danger
      if (isDangerous(danger, nx, ny)) continue;
      // Avoid stepping on skull power-ups (unless that IS the target)
      if (hasSkullAt(state, nx, ny) && !predicate(nx, ny)) continue;
      visited.add(key);
      queue.push({
        gx: nx, gy: ny,
        path: [...curr.path, { gx: nx, gy: ny }],
      });
    }
  }
  return null;
}

/** Is there a skull power-up sitting on this tile? */
function hasSkullAt(state: GameState, gx: number, gy: number): boolean {
  return state.powerUps.some(p => p.gx === gx && p.gy === gy && p.type === 'skull');
}

// ============================================================
// Escape validation – the core anti-self-kill check
// ============================================================

/** Can the AI escape if it places a bomb at (bombGx, bombGy)?
 *  We simulate the new bomb, rebuild the danger map, then BFS
 *  from the bomb tile (allowing one walk-off) to find safety.
 *  We also verify the path is short enough that the AI can
 *  physically reach it before detonation. */
function canEscapeBomb(
  state: GameState, player: Player,
  bombGx: number, bombGy: number,
): boolean {
  // Simulate the bomb being placed
  const fakeBomb: Bomb = {
    gx: bombGx, gy: bombGy,
    ownerId: player.id,
    timer: BOMB_TIMER,
    range: player.flameRange,
    animTimer: 0,
    pierce: player.hasPierce,
  };
  const fakeState: GameState = {
    ...state,
    bombs: [...state.bombs, fakeBomb],
  };
  const fakeDanger = buildDangerMap(fakeState);

  // The AI is standing on the bomb tile and can walk off it
  const bombKey = `${bombGx},${bombGy}`;
  const safePath = findSafePath(fakeState, bombGx, bombGy, fakeDanger, bombKey);

  if (!safePath || safePath.length === 0) return false;

  // Maximum steps the AI can take before the bomb goes off.
  // At base speed (120 px/s) one tile (40px) takes ~0.33s.
  // With BOMB_TIMER=2.5s that's ~7 tiles.  We add a safety margin.
  const tileTime = T / player.speed;          // seconds per tile
  const maxSteps = Math.floor(BOMB_TIMER / tileTime) - 1; // one-tile safety margin

  if (safePath.length > maxSteps) return false;

  // Extra: make sure every cell along the path is not in the
  // blast zone of a bomb that detonates BEFORE we pass through.
  for (let i = 0; i < safePath.length; i++) {
    const cell = safePath[i];
    const arrivalTime = (i + 1) * tileTime; // approx time AI reaches this cell
    const cellDanger = fakeDanger[cell.gy][cell.gx];
    // If the cell is dangerous AND the bomb goes off before we pass…
    if (cellDanger > 0 && cellDanger <= arrivalTime) {
      return false; // we'd walk into an explosion
    }
  }

  return true;
}

// ============================================================
// Tactical helpers
// ============================================================

/** Check if there are walls/bricks between two axis-aligned cells (exclusive) */
function lineBlocked(state: GameState, x1: number, y1: number, x2: number, y2: number): boolean {
  if (x1 === x2) {
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let cy = minY + 1; cy < maxY; cy++) {
      const t = state.tiles[cy][x1].type;
      if (t === 'wall' || t === 'brick') return true;
    }
  } else {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let cx = minX + 1; cx < maxX; cx++) {
      const t = state.tiles[y1][cx].type;
      if (t === 'wall' || t === 'brick') return true;
    }
  }
  return false;
}

function countMyBombs(state: GameState, playerId: number): number {
  return state.bombs.filter(b => b.ownerId === playerId).length;
}

function detectLoop(mem: AIMemory): boolean {
  if (mem.lastPositions.length < 8) return false;
  const recent = mem.lastPositions.slice(-8);
  const unique = new Set(recent);
  return unique.size <= 2;
}

// ============================================================
// Scoring helpers – rate how useful a bomb at (gx,gy) would be
// ============================================================

/** Count how many bricks a bomb at (gx,gy) would destroy */
function countBrickHits(state: GameState, gx: number, gy: number, range: number, pierce: boolean): number {
  let hits = 0;
  for (const { dx, dy } of DIRS) {
    for (let i = 1; i <= range; i++) {
      const nx = gx + dx * i;
      const ny = gy + dy * i;
      if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) break;
      const tile = state.tiles[ny][nx];
      if (tile.type === 'wall') break;
      if (tile.type === 'brick') {
        hits++;
        if (!pierce) break;
      }
    }
  }
  return hits;
}

/** Count how many collectible (non-skull) power-ups a bomb blast
 *  at (gx,gy) would destroy.  These are items sitting on empty
 *  tiles in the blast path — the AI must avoid wasting them. */
function countPowerUpsInBlast(state: GameState, gx: number, gy: number, range: number, pierce: boolean): number {
  let destroyed = 0;
  // Check the bomb tile itself
  if (state.powerUps.some(p => p.gx === gx && p.gy === gy && p.type !== 'skull')) {
    destroyed++;
  }
  for (const { dx, dy } of DIRS) {
    for (let i = 1; i <= range; i++) {
      const nx = gx + dx * i;
      const ny = gy + dy * i;
      if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) break;
      const tile = state.tiles[ny][nx];
      if (tile.type === 'wall') break;
      // A power-up sitting here would be destroyed
      if (state.powerUps.some(p => p.gx === nx && p.gy === ny && p.type !== 'skull')) {
        destroyed++;
      }
      if (tile.type === 'brick' && !pierce) break;
    }
  }
  return destroyed;
}

/** Count how many alive enemies a bomb at (gx,gy) threatens */
function countEnemyThreats(state: GameState, player: Player, gx: number, gy: number): number {
  let threats = 0;
  for (const other of state.players) {
    if (other.id === player.id || !other.alive) continue;
    const ogx = Math.floor(other.x / T);
    const ogy = Math.floor(other.y / T);
    if (ogx === gx && ogy !== gy) {
      if (Math.abs(ogy - gy) <= player.flameRange && !lineBlocked(state, gx, gy, gx, ogy)) threats++;
    }
    if (ogy === gy && ogx !== gx) {
      if (Math.abs(ogx - gx) <= player.flameRange && !lineBlocked(state, gx, gy, ogx, gy)) threats++;
    }
  }
  return threats;
}

/** Is it worth placing a bomb here? Returns a score.
 *  Negative = DON'T bomb (would destroy power-ups).
 *  0 = not useful.  Higher = more valuable. */
function bombScore(state: GameState, player: Player, gx: number, gy: number): number {
  const bricks  = countBrickHits(state, gx, gy, player.flameRange, player.hasPierce);
  const enemies = countEnemyThreats(state, player, gx, gy);
  const puLoss  = countPowerUpsInBlast(state, gx, gy, player.flameRange, player.hasPierce);
  // Heavy penalty for destroying power-ups: each lost item = –20
  // Enemies are worth a lot (+10), bricks a little (+2)
  return enemies * 10 + bricks * 2 - puLoss * 20;
}

/** Does the AI have spare bombs it isn't using? */
function hasSpareBombs(state: GameState, player: Player): boolean {
  const active = countMyBombs(state, player.id);
  return active < player.maxBombs;
}

/** Find the nearest enemy distance (Manhattan) */
function nearestEnemyDist(state: GameState, player: Player, gx: number, gy: number): number {
  let best = 999;
  for (const other of state.players) {
    if (other.id === player.id || !other.alive) continue;
    const ogx = Math.floor(other.x / T);
    const ogy = Math.floor(other.y / T);
    const d = Math.abs(ogx - gx) + Math.abs(ogy - gy);
    if (d < best) best = d;
  }
  return best;
}

// ============================================================
// Main AI Decision Function
//
// PHILOSOPHY: Drop a bomb on EVERY tile we pass through as long
// as we can escape and it won't destroy a power-up.  The AI
// should always be bombing — idle bombs = wasted bombs.
// ============================================================

export function decideAI(state: GameState, player: Player): AIAction {
  const mem = getMemory(player.id);
  const gx = Math.floor(player.x / T);
  const gy = Math.floor(player.y / T);
  const posKey = `${gx},${gy}`;

  // Track positions for loop detection
  mem.lastPositions.push(posKey);
  if (mem.lastPositions.length > 20) mem.lastPositions.shift();

  const danger = buildDangerMap(state);
  const inDanger = isDangerous(danger, gx, gy);
  const canPlace = hasSpareBombs(state, player);
  const scoreHere = bombScore(state, player, gx, gy);
  // Is there already one of our bombs on this tile?
  const bombAlreadyHere = state.bombs.some(b => b.gx === gx && b.gy === gy);

  // Pre-compute: should we drop a bomb RIGHT HERE while doing
  // something else?  Yes if we have a spare, the score is
  // non-negative (won't destroy power-ups), and we can escape.
  // This lets us bomb on almost every tile we walk through.
  const shouldBombHere = canPlace && !bombAlreadyHere && scoreHere >= 0
    && canEscapeBomb(state, player, gx, gy);

  // The AI might be standing on its own just-placed bomb
  const standingOnOwnBomb = state.bombs.some(
    b => b.gx === gx && b.gy === gy && b.ownerId === player.id
  );
  const bombKey = standingOnOwnBomb ? `${gx},${gy}` : undefined;

  // ======================================
  // Priority 1: SURVIVAL – Escape danger
  // ======================================
  if (inDanger) {
    const escapePath = findSafePath(state, gx, gy, danger, bombKey);
    if (escapePath && escapePath.length > 0) {
      const next = escapePath[0];
      return { direction: getDirectionTo(gx, gy, next.gx, next.gy), placeBomb: false };
    }
    for (const { dir, dx, dy } of DIRS) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (isWalkable(state, nx, ny, bombKey)) {
        return { direction: dir, placeBomb: false };
      }
    }
    return { direction: 'none', placeBomb: false };
  }

  // ======================================
  // Priority 2: POWER-UPS – Rush to collect (avoid skulls!)
  //   Drop bombs along the way if it won't hurt power-ups.
  // ======================================
  {
    const goodPUs = state.powerUps.filter(p => p.type !== 'skull');
    if (goodPUs.length > 0) {
      const puPath = findPath(state, gx, gy, (px, py) => {
        return goodPUs.some(p => p.gx === px && p.gy === py);
      }, danger, 20);
      if (puPath && puPath.length > 0) {
        const dir = getDirectionTo(gx, gy, puPath[0].gx, puPath[0].gy);
        // Bomb along the way if it won't destroy power-ups
        return { direction: dir, placeBomb: shouldBombHere && scoreHere > 0 };
      }
    }
  }

  // ======================================
  // Priority 3: OFFENSE – Attack enemies
  //   Always bomb if enemy is in range.
  //   Always drop trail bombs while chasing.
  // ======================================
  {
    // 3a) Enemy in blast range right now — bomb immediately
    if (canPlace && scoreHere >= 10 && canEscapeBomb(state, player, gx, gy)) {
      return { direction: 'none', placeBomb: true };
    }

    // 3b) Find a tile where we'd hit an enemy
    if (canPlace) {
      const atkPath = findPath(state, gx, gy, (px, py) => {
        return bombScore(state, player, px, py) >= 10;
      }, danger, 10);
      if (atkPath && atkPath.length > 0) {
        const dir = getDirectionTo(gx, gy, atkPath[0].gx, atkPath[0].gy);
        // Always trail-bomb while heading to attack position
        return { direction: dir, placeBomb: shouldBombHere };
      }
    }

    // 3c) Chase nearest enemy and trail-bomb the whole way
    const enemyDist = nearestEnemyDist(state, player, gx, gy);
    if (enemyDist < 999) {
      const chasePath = findPath(state, gx, gy, (px, py) => {
        for (const other of state.players) {
          if (other.id === player.id || !other.alive) continue;
          const ogx = Math.floor(other.x / T);
          const ogy = Math.floor(other.y / T);
          if (Math.abs(ogx - px) + Math.abs(ogy - py) <= 2) return true;
        }
        return false;
      }, danger, 20);
      if (chasePath && chasePath.length > 0) {
        const dir = getDirectionTo(gx, gy, chasePath[0].gx, chasePath[0].gy);
        // Trail-bomb while chasing
        return { direction: dir, placeBomb: shouldBombHere };
      }
    }
  }

  // ======================================
  // Priority 4: CLEARING – Destroy bricks
  //   Bomb any tile next to a brick.
  //   Trail-bomb while moving toward bricks.
  // ======================================
  {
    const bricksHere = countBrickHits(state, gx, gy, player.flameRange, player.hasPierce);

    // Standing next to bricks — bomb immediately
    if (canPlace && bricksHere >= 1 && scoreHere >= 0 && canEscapeBomb(state, player, gx, gy)) {
      return { direction: 'none', placeBomb: true };
    }

    // Move toward bricks, trail-bomb the whole way
    const brickPath = findPath(state, gx, gy, (px, py) => {
      return countBrickHits(state, px, py, player.flameRange, player.hasPierce) >= 1
        && bombScore(state, player, px, py) >= 0;
    }, danger, 20);

    if (brickPath && brickPath.length > 0) {
      if (detectLoop(mem)) {
        mem.lastPositions = [];
        const safeDirs = DIRS.filter(d => {
          const nx = gx + d.dx;
          const ny = gy + d.dy;
          return isWalkable(state, nx, ny) && !isDangerous(danger, nx, ny);
        });
        if (safeDirs.length > 0) {
          const pick = safeDirs[Math.floor(Math.random() * safeDirs.length)];
          return { direction: pick.dir, placeBomb: shouldBombHere };
        }
      }
      const dir = getDirectionTo(gx, gy, brickPath[0].gx, brickPath[0].gy);
      return { direction: dir, placeBomb: shouldBombHere };
    }
  }

  // ======================================
  // Priority 5: HUNT / WANDER
  //   No bricks left — chase enemies or wander.
  //   ALWAYS trail-bomb to create pressure.
  // ======================================
  {
    const huntPath = findPath(state, gx, gy, (px, py) => {
      for (const other of state.players) {
        if (other.id === player.id || !other.alive) continue;
        const ogx = Math.floor(other.x / T);
        const ogy = Math.floor(other.y / T);
        if (Math.abs(ogx - px) + Math.abs(ogy - py) <= 3) return true;
      }
      return false;
    }, danger, 25);

    if (huntPath && huntPath.length > 0) {
      const dir = getDirectionTo(gx, gy, huntPath[0].gx, huntPath[0].gy);
      return { direction: dir, placeBomb: shouldBombHere };
    }
  }

  // Last resort: wander randomly, always bombing
  const safeDirs = DIRS.filter(d => {
    const nx = gx + d.dx;
    const ny = gy + d.dy;
    return isWalkable(state, nx, ny) && !isDangerous(danger, nx, ny) && !hasSkullAt(state, nx, ny);
  });
  if (safeDirs.length > 0) {
    const currentDir = safeDirs.find(d => d.dir === player.direction);
    const dir = (currentDir && Math.random() < 0.7)
      ? currentDir.dir
      : safeDirs[Math.floor(Math.random() * safeDirs.length)].dir;
    return { direction: dir, placeBomb: shouldBombHere };
  }

  return { direction: 'none', placeBomb: shouldBombHere };
}

function getDirectionTo(fx: number, fy: number, tx: number, ty: number): Direction {
  if (tx < fx) return 'left';
  if (tx > fx) return 'right';
  if (ty < fy) return 'up';
  if (ty > fy) return 'down';
  return 'none';
}
