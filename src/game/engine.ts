// ============================================================
// Master Blaster - Game Engine
// Handles: movement, collisions, bombs, explosions, power-ups
// ============================================================

import {
  GameState, Player, Bomb,
  Direction, GameConfig, Tile, KeyBindings, SkullEffect, GameParams,
} from './types';
import {
  TILE_SIZE, BASE_SPEED,
  SPEED_BOOST, SPAWN_INVINCIBILITY,
  PLAYER_COLORS, PLAYER_NAMES, getSpawnPositions, MAP_SIZES,
  SKULL_DURATION,
} from './constants';
import { generateMap } from './map';
import { decideAI, resetAI, shouldAIDropBombNow } from './ai';
import { playPlaceBomb, playExplosion, playPowerUp, playDeath, playWin, playShieldBreak, playSkull } from './audio';

const T = TILE_SIZE;

// ---- Input State ----
const keysDown = new Set<string>();

export function handleKeyDown(e: KeyboardEvent) {
  keysDown.add(e.key);
}

export function handleKeyUp(e: KeyboardEvent) {
  keysDown.delete(e.key);
}

// ---- Game Initialization ----

export function createGameState(config: GameConfig): GameState {
  resetAI();
  const p = config.params;
  const { cols, rows } = MAP_SIZES[config.mapSize];
  const mapData = generateMap(config.mapSize, getPlayerCount(config), p.brickDensity, p.powerUpChance);
  const spawns = getSpawnPositions(cols, rows);
  const numPlayers = getPlayerCount(config);

  const players: Player[] = [];
  const mkP = (id: number, ai: boolean, keys: KeyBindings) =>
    createPlayer(id, spawns[id], ai, keys, p);

  if (config.mode === 'solo') {
    players.push(mkP(0, false, config.playerKeys[0]));
    for (let i = 1; i < 4; i++) players.push(mkP(i, true, config.playerKeys[0]));
  } else if (config.mode === 'pvp') {
    players.push(mkP(0, false, config.playerKeys[0]));
    players.push(mkP(1, false, config.playerKeys[1]));
    for (let i = 2; i < 4; i++) players.push(mkP(i, true, config.playerKeys[0]));
  } else {
    for (let i = 0; i < numPlayers; i++) players.push(mkP(i, true, config.playerKeys[0]));
  }

  return {
    cols,
    rows,
    tileSize: T,
    tiles: mapData.tiles,
    players,
    bombs: [],
    explosions: [],
    powerUps: [],
    particles: [],
    gameOver: false,
    winner: null,
    winnerColor: null,
    gameOverTime: 0,
    paused: false,
    gameTime: 0,
    shakeTimer: 0,
    shakeIntensity: 0,
    params: p,
  };
}

function getPlayerCount(config: GameConfig): number {
  if (config.mode === 'ai40') return 40;
  if (config.mode === 'ai20') return 20;
  if (config.mode === 'ai10') return 10;
  return 4;
}

function createPlayer(
  id: number,
  spawn: { gx: number; gy: number },
  isAI: boolean,
  keys: KeyBindings,
  p: GameParams,
): Player {
  return {
    id,
    x: spawn.gx * T + T / 2,
    y: spawn.gy * T + T / 2,
    speed: BASE_SPEED + SPEED_BOOST * p.startSpeed,
    bombCount: 0,
    maxBombs: p.startBombs,
    flameRange: p.startFlame,
    alive: true,
    isAI,
    direction: 'none',
    animFrame: 0,
    animTimer: 0,
    color: PLAYER_COLORS[id % PLAYER_COLORS.length],
    name: PLAYER_NAMES[id] ?? `P${id + 1}`,
    keys,
    placedBombTiles: new Set<string>(),
    invincibleTimer: SPAWN_INVINCIBILITY,
    hasPierce: p.startPierce,
    hasShield: p.startShield,
    skullEffect: null,
    skullTimer: 0,
    inventory: [],
  };
}

// ---- AI State ----
const aiTimers = new Map<number, number>();

// ---- Main Update Loop ----

export function updateGame(state: GameState, dt: number): void {
  if (state.paused) return;

  state.gameTime += dt;

  // After game over, keep advancing time for the animation but skip gameplay
  if (state.gameOver) return;

  // Update players
  for (const player of state.players) {
    if (!player.alive) continue;

    // Decrease invincibility
    if (player.invincibleTimer > 0) {
      player.invincibleTimer -= dt;
    }

    // Update skull effect timer
    if (player.skullEffect && player.skullTimer > 0) {
      player.skullTimer -= dt;
      if (player.skullTimer <= 0) {
        player.skullEffect = null;
      }
    }

    // Diarrhea effect: auto-place bombs
    if (player.skullEffect === 'diarrhea' && Math.random() < dt * 2) {
      tryPlaceBomb(state, player);
    }

    if (player.isAI) {
      updateAIPlayer(state, player, dt);
    } else {
      updateHumanPlayer(state, player, dt);
    }
  }

  // Update bombs
  updateBombs(state, dt);

  // Update explosions
  updateExplosions(state, dt);

  // Update particles
  updateParticles(state, dt);

  // Check win condition
  checkWinCondition(state);
}

// ---- Human Player Input ----

function updateHumanPlayer(state: GameState, player: Player, dt: number) {
  let dir: Direction = 'none';

  if (keysDown.has(player.keys.up)) dir = 'up';
  else if (keysDown.has(player.keys.down)) dir = 'down';
  else if (keysDown.has(player.keys.left)) dir = 'left';
  else if (keysDown.has(player.keys.right)) dir = 'right';

  // Reverse controls skull effect
  if (player.skullEffect === 'reverse' && dir !== 'none') {
    const reverseMap: Record<Direction, Direction> = {
      up: 'down', down: 'up', left: 'right', right: 'left', none: 'none'
    };
    dir = reverseMap[dir];
  }

  if (dir !== 'none') {
    movePlayer(state, player, dir, dt);
  } else {
    player.direction = 'none';
  }

  // Bomb placement
  if (keysDown.has(player.keys.bomb)) {
    tryPlaceBomb(state, player);
    keysDown.delete(player.keys.bomb); // prevent repeat
  }

  // Pick up power-ups
  checkPowerUpPickup(state, player);
}

// ---- AI Player ----

// Store AI direction for smooth inter-tick movement
const aiDirs = new Map<number, Direction>();

function updateAIPlayer(state: GameState, player: Player, dt: number) {
  // AI tick timer
  let timer = aiTimers.get(player.id) || 0;
  timer -= dt;

  const beforeGx = Math.floor(player.x / T);
  const beforeGy = Math.floor(player.y / T);

  if (timer <= 0) {
    // Faster reaction for high-speed AI so they can change direction in time.
    const crowdBase = state.players.length >= 40 ? 0.11 : state.players.length >= 20 ? 0.09 : 0.07;
    const speedFactor = Math.max(0.45, BASE_SPEED / Math.max(BASE_SPEED, player.speed));
    const decisionBase = crowdBase * speedFactor;
    const decisionVar = (state.players.length >= 40 ? 0.05 : 0.04) * speedFactor;
    timer = decisionBase + Math.random() * decisionVar;

    let action = decideAI(state, player);

    if (action.placeBomb) {
      tryPlaceBomb(state, player);
      // After placing a bomb, re-query so the AI starts escaping immediately.
      action = decideAI(state, player);
    }

    aiDirs.set(player.id, action.direction);
  }

  // Move AI smoothly toward target
  const dir = aiDirs.get(player.id) || 'none';
  if (dir !== 'none') {
    // Strong pre-turn alignment for AI: before moving, pull the bot toward
    // the lane center on the perpendicular axis. This is the key fix for
    // high-speed turning at intersections.
    alignAIToLane(state, player, dir, dt);
    movePlayer(state, player, dir, dt);
    // And re-align after motion to absorb any residual drift.
    alignAIToLane(state, player, dir, dt);
  } else {
    player.direction = 'none';
  }

  aiTimers.set(player.id, timer);

  // Collect any bonus on the tile first, then aggressively spend any spare
  // bomb slots as soon as the AI reaches a new valid tile.
  checkPowerUpPickup(state, player);
  const afterGx = Math.floor(player.x / T);
  const afterGy = Math.floor(player.y / T);
  if ((afterGx !== beforeGx || afterGy !== beforeGy || dir === 'none') && shouldAIDropBombNow(state, player)) {
    tryPlaceBomb(state, player);
  }
}

// ---- Movement with Pixel-Perfect Collision ----

/** Nearest tile-center helper */
function nearestTileCenter(coord: number): number {
  return Math.round((coord - T / 2) / T) * T + T / 2;
}

/** Strong lane alignment for AI before/after turns.
 *  This is much stronger than the old soft snap and scales with speed. */
function alignAIToLane(state: GameState, player: Player, dir: Direction, dt: number) {
  if (!player.isAI || dir === 'none') return;

  const halfW = T * 0.38;
  const halfH = T * 0.38;
  const laneX = nearestTileCenter(player.x);
  const laneY = nearestTileCenter(player.y);
  const turnAssist = Math.max(8, player.speed * 1.6) * dt;

  if (dir === 'up' || dir === 'down') {
    const dx = laneX - player.x;
    if (Math.abs(dx) <= turnAssist * 1.2) {
      // Hard snap when close enough so intersections are not missed.
      if (checkCollision(state, player, laneX, player.y, halfW, halfH)) {
        player.x = laneX;
      }
    } else {
      const nx = player.x + Math.sign(dx) * turnAssist;
      if (checkCollision(state, player, nx, player.y, halfW, halfH)) {
        player.x = nx;
      }
    }
  } else {
    const dy = laneY - player.y;
    if (Math.abs(dy) <= turnAssist * 1.2) {
      if (checkCollision(state, player, player.x, laneY, halfW, halfH)) {
        player.y = laneY;
      }
    } else {
      const ny = player.y + Math.sign(dy) * turnAssist;
      if (checkCollision(state, player, player.x, ny, halfW, halfH)) {
        player.y = ny;
      }
    }
  }
}

function movePlayer(state: GameState, player: Player, dir: Direction, dt: number) {
  player.direction = dir;
  player.animTimer += dt;
  player.animFrame = Math.floor(player.animTimer * 8);

  // Apply slow skull effect (half speed)
  const effectiveSpeed = player.skullEffect === 'slow' ? player.speed * 0.5 : player.speed;
  const totalMove = effectiveSpeed * dt;

  // Player collision box (slightly smaller than tile for fluid movement)
  const halfW = T * 0.38;
  const halfH = T * 0.38;

  // Sub-step movement so very fast entities don't skip intersections.
  const maxStep = 6;
  const steps = Math.max(1, Math.ceil(totalMove / maxStep));
  const stepMove = totalMove / steps;

  for (let s = 0; s < steps; s++) {
    let newX = player.x;
    let newY = player.y;

    switch (dir) {
      case 'up': newY -= stepMove; break;
      case 'down': newY += stepMove; break;
      case 'left': newX -= stepMove; break;
      case 'right': newX += stepMove; break;
    }

    const canMove = checkCollision(state, player, newX, newY, halfW, halfH);

    if (canMove) {
      player.x = newX;
      player.y = newY;
      continue;
    }

    // Try sliding along walls (corner rounding)
    if (dir === 'up' || dir === 'down') {
      const slideAmount = stepMove * 0.9;
      const centerX = nearestTileCenter(player.x);
      const diff = player.x - centerX;

      if (Math.abs(diff) > 1) {
        const slideX = diff > 0 ? player.x - slideAmount : player.x + slideAmount;
        if (checkCollision(state, player, slideX, newY, halfW, halfH)) {
          player.x = slideX;
          player.y = newY;
        } else if (checkCollision(state, player, slideX, player.y, halfW, halfH)) {
          player.x = slideX;
        }
      }
    } else {
      const slideAmount = stepMove * 0.9;
      const centerY = nearestTileCenter(player.y);
      const diff = player.y - centerY;

      if (Math.abs(diff) > 1) {
        const slideY = diff > 0 ? player.y - slideAmount : player.y + slideAmount;
        if (checkCollision(state, player, newX, slideY, halfW, halfH)) {
          player.x = newX;
          player.y = slideY;
        } else if (checkCollision(state, player, player.x, slideY, halfW, halfH)) {
          player.y = slideY;
        }
      }
    }
  }

  // Update placed bomb tiles tracking.
  for (const key of player.placedBombTiles) {
    const [bx, by] = key.split(',').map(Number);
    const tileLeft = bx * T;
    const tileRight = (bx + 1) * T;
    const tileTop = by * T;
    const tileBottom = (by + 1) * T;
    const pLeft = player.x - halfW;
    const pRight = player.x + halfW;
    const pTop = player.y - halfH;
    const pBottom = player.y + halfH;
    const overlaps =
      pRight > tileLeft && pLeft < tileRight &&
      pBottom > tileTop && pTop < tileBottom;
    if (!overlaps) {
      player.placedBombTiles.delete(key);
    }
  }
}

/** Check if a player can move to (nx, ny) without clipping */
function checkCollision(
  state: GameState, player: Player,
  nx: number, ny: number,
  halfW: number, halfH: number
): boolean {
  // Check all 4 corners of the player's collision box
  const corners = [
    { cx: nx - halfW, cy: ny - halfH },
    { cx: nx + halfW, cy: ny - halfH },
    { cx: nx - halfW, cy: ny + halfH },
    { cx: nx + halfW, cy: ny + halfH },
  ];

  for (const { cx, cy } of corners) {
    const gx = Math.floor(cx / T);
    const gy = Math.floor(cy / T);

    if (gx < 0 || gy < 0 || gx >= state.cols || gy >= state.rows) return false;

    const tile = state.tiles[gy][gx];
    if (tile.type === 'wall' || tile.type === 'brick') return false;

    // Check bomb collision — any player who was standing on the
    // tile when the bomb was placed can walk through until they leave.
    for (const bomb of state.bombs) {
      if (bomb.gx === gx && bomb.gy === gy) {
        if (player.placedBombTiles.has(`${gx},${gy}`)) {
          continue; // still overlapping — allow walk-through
        }
        return false;
      }
    }
  }

  return true;
}

// ---- Bomb Placement ----

function tryPlaceBomb(state: GameState, player: Player) {
  // Check for constipation skull effect
  if (player.skullEffect === 'constipation') return;

  const gx = Math.floor(player.x / T);
  const gy = Math.floor(player.y / T);

  // Check max bombs (affected by skull)
  const effectiveMaxBombs = player.skullEffect === 'diarrhea' ? 99 : player.maxBombs;
  const activeBombs = state.bombs.filter(b => b.ownerId === player.id).length;
  if (activeBombs >= effectiveMaxBombs) return;

  // Check if there's already a bomb here
  if (state.bombs.some(b => b.gx === gx && b.gy === gy)) return;

  // Effective flame range (affected by skull)
  const effectiveRange = player.skullEffect === 'short' ? 1 : player.flameRange;

  const bomb: Bomb = {
    gx, gy,
    ownerId: player.id,
    timer: state.params.bombTimer,
    range: effectiveRange,
    animTimer: 0,
    pierce: player.hasPierce,
  };

  state.bombs.push(bomb);

  // Mark EVERY player whose collision box overlaps this bomb tile
  // so none of them get instantly trapped.  Each player's set entry
  // is removed individually once that player's box fully leaves.
  const tileKey = `${gx},${gy}`;
  const tileLeft = gx * T;
  const tileRight = (gx + 1) * T;
  const tileTop = gy * T;
  const tileBottom = (gy + 1) * T;
  const cHalf = T * 0.38; // same collision half-size used in movement

  for (const p of state.players) {
    if (!p.alive) continue;
    // AABB overlap test between player box and bomb tile
    if (p.x + cHalf > tileLeft && p.x - cHalf < tileRight &&
        p.y + cHalf > tileTop  && p.y - cHalf < tileBottom) {
      p.placedBombTiles.add(tileKey);
    }
  }

  playPlaceBomb();
}

// ---- Bomb & Explosion Updates ----

function updateBombs(state: GameState, dt: number) {
  const toExplode: Bomb[] = [];

  for (const bomb of state.bombs) {
    bomb.timer -= dt;
    bomb.animTimer += dt;

    if (bomb.timer <= 0) {
      toExplode.push(bomb);
    }
  }

  // Chain explosions
  for (const bomb of toExplode) {
    explodeBomb(state, bomb);
  }

  // Remove exploded bombs
  state.bombs = state.bombs.filter(b => b.timer > 0);
}

function explodeBomb(state: GameState, bomb: Bomb) {
  playExplosion();

  // Remove from all players' placedBombTiles
  for (const p of state.players) {
    p.placedBombTiles.delete(`${bomb.gx},${bomb.gy}`);
  }

  const expDur = state.params.explosionDuration;

  // Center explosion
  state.explosions.push({
    gx: bomb.gx, gy: bomb.gy,
    timer: expDur,
    direction: 'center',
    isEnd: false,
  });

  // Spawn particles at center
  spawnExplosionParticles(state, bomb.gx * T + T / 2, bomb.gy * T + T / 2);

  // Expand in 4 directions
  const dirs: { dx: number; dy: number; dir: 'up' | 'down' | 'left' | 'right' }[] = [
    { dx: 0, dy: -1, dir: 'up' },
    { dx: 0, dy: 1, dir: 'down' },
    { dx: -1, dy: 0, dir: 'left' },
    { dx: 1, dy: 0, dir: 'right' },
  ];

  for (const { dx, dy, dir } of dirs) {
    for (let i = 1; i <= bomb.range; i++) {
      const nx = bomb.gx + dx * i;
      const ny = bomb.gy + dy * i;

      if (nx < 0 || ny < 0 || nx >= state.cols || ny >= state.rows) break;

      const tile = state.tiles[ny][nx];

      // Indestructible wall stops blast
      if (tile.type === 'wall') break;

      // Brick: destroy it, spawn powerup
      // Pierce bombs continue through bricks, normal bombs stop
      if (tile.type === 'brick') {
        destroyBrick(state, nx, ny, tile);
        state.explosions.push({
          gx: nx, gy: ny,
          timer: expDur,
          direction: dir,
          isEnd: !bomb.pierce,
        });
        if (!bomb.pierce) break; // stop unless pierce
        continue; // pierce: continue to next tile
      }

      // Empty: add explosion
      state.explosions.push({
        gx: nx, gy: ny,
        timer: expDur,
        direction: dir,
        isEnd: i === bomb.range,
      });

      // Chain reaction: detonate other bombs hit by explosion
      const chainBomb = state.bombs.find(b => b.gx === nx && b.gy === ny && b.timer > 0);
      if (chainBomb) {
        chainBomb.timer = 0; // will explode next frame
      }
    }
  }
}

function destroyBrick(state: GameState, gx: number, gy: number, tile: Tile) {
  // Spawn debris particles
  spawnDebrisParticles(state, gx * T + T / 2, gy * T + T / 2);

  // Reveal power-up if hidden under this brick.
  // Give it an immunity timer equal to EXPLOSION_DURATION so the
  // blast that broke the brick doesn't immediately destroy it.
  if (tile.powerUp) {
    state.powerUps.push({
      gx, gy,
      type: tile.powerUp,
      animTimer: 0,
      immuneTimer: state.params.explosionDuration + 0.1,
    });
  }

  // Change tile to empty
  state.tiles[gy][gx] = { type: 'empty' };
}

function updateExplosions(state: GameState, dt: number) {
  for (const exp of state.explosions) {
    exp.timer -= dt;
  }

  // Check player damage from explosions
  for (const exp of state.explosions) {
    if (exp.timer <= 0) continue;
    for (const player of state.players) {
      if (!player.alive || player.invincibleTimer > 0) continue;
      const pgx = Math.floor(player.x / T);
      const pgy = Math.floor(player.y / T);
      if (pgx === exp.gx && pgy === exp.gy) {
        killPlayer(state, player);
      }
    }
  }

  // Tick down power-up immunity timers
  for (const pu of state.powerUps) {
    if (pu.immuneTimer > 0) pu.immuneTimer -= dt;
  }

  // Destroy power-ups caught in explosions (only if not immune)
  for (const exp of state.explosions) {
    if (exp.timer <= 0) continue;
    state.powerUps = state.powerUps.filter(
      pu => !(pu.gx === exp.gx && pu.gy === exp.gy && pu.immuneTimer <= 0)
    );
  }

  // Remove expired explosions
  state.explosions = state.explosions.filter(e => e.timer > 0);
}

function killPlayer(state: GameState, player: Player) {
  // Shield protection — survive one hit
  if (player.hasShield) {
    player.hasShield = false;
    // Remove ONE shield from inventory so the drop count stays accurate
    const si = player.inventory.indexOf('shield');
    if (si >= 0) player.inventory.splice(si, 1);
    player.invincibleTimer = 1.5;
    playShieldBreak();
    spawnShieldParticles(state, player.x, player.y);
    return;
  }

  player.alive = false;
  playDeath();
  spawnDeathParticles(state, player.x, player.y, player.color);

  // ---- Drop all collected power-ups onto the map ----
  scatterInventory(state, player);
}

/**
 * Scatter the dead player's entire inventory onto random empty,
 * safe tiles around the map so other players can pick them up.
 */
function scatterInventory(state: GameState, player: Player) {
  if (player.inventory.length === 0) return;

  // Build a set of tiles that already have something on them
  const occupied = new Set<string>();
  for (const b of state.bombs)      occupied.add(`${b.gx},${b.gy}`);
  for (const e of state.explosions) occupied.add(`${e.gx},${e.gy}`);
  for (const p of state.powerUps)   occupied.add(`${p.gx},${p.gy}`);

  // Collect every walkable, unoccupied tile
  const candidates: { gx: number; gy: number }[] = [];
  for (let gy = 1; gy < state.rows - 1; gy++) {
    for (let gx = 1; gx < state.cols - 1; gx++) {
      if (state.tiles[gy][gx].type !== 'empty') continue;
      if (occupied.has(`${gx},${gy}`)) continue;
      candidates.push({ gx, gy });
    }
  }

  // Shuffle (Fisher-Yates)
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  // Place each item on a unique tile (wrap if more items than tiles)
  const slots = Math.max(1, candidates.length);
  for (let i = 0; i < player.inventory.length; i++) {
    const slot = candidates[i % slots];
    if (!slot) break;
    state.powerUps.push({
      gx: slot.gx,
      gy: slot.gy,
      type: player.inventory[i],
      animTimer: 0,
      immuneTimer: state.params.explosionDuration + 0.2, // survive nearby blasts
    });
    // Small sparkle at drop site
    spawnDropParticle(state, slot.gx * T + T / 2, slot.gy * T + T / 2, player.color);
  }

  player.inventory = [];
}

/** Sparkle particle at a power-up drop site */
function spawnDropParticle(state: GameState, x: number, y: number, color: string) {
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI * 2 / 4) * i + Math.random() * 0.5;
    const sp = 40 + Math.random() * 30;
    state.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 30,
      life: 0.4,
      maxLife: 0.4,
      color,
      size: 2 + Math.random() * 2,
    });
  }
}

// ---- Power-up Pickup ----

// SkullEffect imported at top of file

function checkPowerUpPickup(state: GameState, player: Player) {
  const pgx = Math.floor(player.x / T);
  const pgy = Math.floor(player.y / T);

  const idx = state.powerUps.findIndex(pu => pu.gx === pgx && pu.gy === pgy);
  if (idx >= 0) {
    const pu = state.powerUps[idx];
    let isSkull = false;

    switch (pu.type) {
      case 'bomb':
        player.maxBombs += 1;
        break;
      case 'flame':
        player.flameRange += 1;
        break;
      case 'speed':
        player.speed += SPEED_BOOST;
        break;
      case 'bomb2':
        player.maxBombs += 2;
        break;
      case 'flame2':
        player.flameRange += 2;
        break;
      case 'speed2':
        player.speed += SPEED_BOOST * 2;
        break;
      case 'fullfire':
        player.flameRange += 8;
        break;
      case 'pierce':
        player.hasPierce = true;
        break;
      case 'shield':
        player.hasShield = true;
        break;
      case 'skull':
        // Apply random skull effect
        const effects: SkullEffect[] = ['slow', 'constipation', 'diarrhea', 'short', 'reverse'];
        player.skullEffect = effects[Math.floor(Math.random() * effects.length)];
        player.skullTimer = SKULL_DURATION;
        isSkull = true;
        break;
    }

    // Record the power-up in inventory (except skulls — those are curses, not loot)
    if (!isSkull) {
      player.inventory.push(pu.type);
    }

    state.powerUps.splice(idx, 1);
    if (isSkull) {
      playSkull();
    } else {
      playPowerUp();
    }
  }
}

// ---- Win Condition ----

function checkWinCondition(state: GameState) {
  const alive = state.players.filter(p => p.alive);
  if (alive.length <= 1) {
    state.gameOver = true;
    state.gameOverTime = state.gameTime;
    if (alive.length === 1) {
      state.winner = `${alive[0].name} Wins!`;
      state.winnerColor = alive[0].color;
    } else {
      state.winner = 'Draw!';
      state.winnerColor = '#ffdd44';
    }
    playWin();
  }
}

// ---- Particle Effects ----

function spawnExplosionParticles(state: GameState, x: number, y: number) {
  const colors = ['#ff4400', '#ff6600', '#ffaa00', '#ffdd00'];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.5;
    const speed = 80 + Math.random() * 60;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.4 + Math.random() * 0.3,
      maxLife: 0.7,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 3,
    });
  }
}

function spawnDebrisParticles(state: GameState, x: number, y: number) {
  const colors = ['#b85c2c', '#8b4420', '#d47040', '#666666'];
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 80;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 3,
    });
  }
}

function spawnDeathParticles(state: GameState, x: number, y: number, color: string) {
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 100;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 50,
      life: 0.6 + Math.random() * 0.4,
      maxLife: 1.0,
      color: i % 2 === 0 ? color : '#ffffff',
      size: 3 + Math.random() * 4,
    });
  }
}

function spawnShieldParticles(state: GameState, x: number, y: number) {
  const colors = ['#88ccff', '#aaddff', '#ffffff', '#66aaee'];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * 2 / 16) * i;
    const speed = 100 + Math.random() * 60;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.8,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 3,
    });
  }
}

function updateParticles(state: GameState, dt: number) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 200 * dt; // gravity
    p.life -= dt;
    p.size *= 0.98;
  }
  state.particles = state.particles.filter(p => p.life > 0);
}

// ---- Toggle Pause ----

export function togglePause(state: GameState) {
  state.paused = !state.paused;
}
