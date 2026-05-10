// ============================================================
// Master Blaster - Game Engine
// Handles: movement, collisions, bombs, explosions, power-ups
// ============================================================

import {
  GameState, Player, Bomb,
  Direction, GameConfig, Tile, KeyBindings, SkullEffect,
} from './types';
import {
  TILE_SIZE, BOMB_TIMER, EXPLOSION_DURATION, BASE_SPEED,
  SPEED_BOOST, START_BOMBS, START_FLAME, SPAWN_INVINCIBILITY,
  PLAYER_COLORS, PLAYER_NAMES, getSpawnPositions, MAP_SIZES,
  MAX_FLAME, MAX_BOMBS, MAX_SPEED_BOOSTS, SKULL_DURATION,
} from './constants';
import { generateMap } from './map';
import { decideAI, resetAI } from './ai';
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
  const { cols, rows } = MAP_SIZES[config.mapSize];
  const mapData = generateMap(config.mapSize, getPlayerCount(config));
  const spawns = getSpawnPositions(cols, rows);

  const players: Player[] = [];

  if (config.mode === 'solo') {
    players.push(createPlayer(0, spawns[0], false, config.playerKeys[0]));
    players.push(createPlayer(1, spawns[1], true, config.playerKeys[0]));
    players.push(createPlayer(2, spawns[2], true, config.playerKeys[0]));
    players.push(createPlayer(3, spawns[3], true, config.playerKeys[0]));
  } else if (config.mode === 'pvp') {
    players.push(createPlayer(0, spawns[0], false, config.playerKeys[0]));
    players.push(createPlayer(1, spawns[1], false, config.playerKeys[1]));
    players.push(createPlayer(2, spawns[2], true, config.playerKeys[0]));
    players.push(createPlayer(3, spawns[3], true, config.playerKeys[0]));
  } else if (config.mode === 'ai10') {
    for (let i = 0; i < 10; i++) players.push(createPlayer(i, spawns[i], true, config.playerKeys[0]));
  } else if (config.mode === 'ai20') {
    for (let i = 0; i < 20; i++) players.push(createPlayer(i, spawns[i], true, config.playerKeys[0]));
  } else if (config.mode === 'ai40') {
    for (let i = 0; i < 40; i++) players.push(createPlayer(i, spawns[i], true, config.playerKeys[0]));
  } else {
    players.push(createPlayer(0, spawns[0], true, config.playerKeys[0]));
    players.push(createPlayer(1, spawns[1], true, config.playerKeys[0]));
    players.push(createPlayer(2, spawns[2], true, config.playerKeys[0]));
    players.push(createPlayer(3, spawns[3], true, config.playerKeys[0]));
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
    paused: false,
    gameTime: 0,
    shakeTimer: 0,
    shakeIntensity: 0,
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
  keys: KeyBindings
): Player {
  return {
    id,
    x: spawn.gx * T + T / 2,
    y: spawn.gy * T + T / 2,
    speed: BASE_SPEED,
    bombCount: 0,
    maxBombs: START_BOMBS,
    flameRange: START_FLAME,
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
    hasPierce: false,
    hasShield: false,
    skullEffect: null,
    skullTimer: 0,
    inventory: [],
  };
}

// ---- AI State ----
const aiTimers = new Map<number, number>();

// ---- Main Update Loop ----

export function updateGame(state: GameState, dt: number): void {
  if (state.paused || state.gameOver) return;

  state.gameTime += dt;
  if (state.shakeTimer > 0) state.shakeTimer -= dt;

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

  const pgx = Math.floor(player.x / T);
  const pgy = Math.floor(player.y / T);

  if (timer <= 0) {
    // Throttle AI decision rate on ultra-large battles to keep runtime smooth.
    const decisionBase = state.players.length >= 40 ? 0.14 : state.players.length >= 20 ? 0.11 : 0.08;
    const decisionVar = state.players.length >= 40 ? 0.08 : 0.06;
    timer = decisionBase + Math.random() * decisionVar;
    let action = decideAI(state, player);

    if (action.placeBomb) {
      tryPlaceBomb(state, player);
      // CRITICAL: After placing a bomb the AI is now standing on
      // a live bomb. Re-query immediately so it starts escaping
      // on this very frame instead of waiting for the next tick.
      action = decideAI(state, player);
    }

    aiDirs.set(player.id, action.direction);
  }

  // Move AI smoothly toward target
  const dir = aiDirs.get(player.id) || 'none';
  if (dir !== 'none') {
    movePlayer(state, player, dir, dt);

    // Snap to grid center on the axis perpendicular to movement.
    // This prevents AI from getting misaligned and stuck on corners.
    const centerX = pgx * T + T / 2;
    const centerY = pgy * T + T / 2;
    const snapStrength = Math.min(1, 6 * dt);
    if (dir === 'up' || dir === 'down') {
      if (Math.abs(player.x - centerX) > 1) {
        player.x += (centerX - player.x) * snapStrength;
      }
    } else {
      if (Math.abs(player.y - centerY) > 1) {
        player.y += (centerY - player.y) * snapStrength;
      }
    }
  } else {
    player.direction = 'none';
  }

  aiTimers.set(player.id, timer);
  checkPowerUpPickup(state, player);
}

// ---- Movement with Pixel-Perfect Collision ----

function movePlayer(state: GameState, player: Player, dir: Direction, dt: number) {
  player.direction = dir;
  player.animTimer += dt;
  player.animFrame = Math.floor(player.animTimer * 8);

  // Apply slow skull effect (half speed)
  const effectiveSpeed = player.skullEffect === 'slow' ? player.speed * 0.5 : player.speed;
  const speed = effectiveSpeed * dt;
  let newX = player.x;
  let newY = player.y;

  // Calculate intended movement
  switch (dir) {
    case 'up': newY -= speed; break;
    case 'down': newY += speed; break;
    case 'left': newX -= speed; break;
    case 'right': newX += speed; break;
  }

  // Player collision box (slightly smaller than tile for fluid movement)
  const halfW = T * 0.38; // collision half-width
  const halfH = T * 0.38;

  // Check collision with new position
  const canMove = checkCollision(state, player, newX, newY, halfW, halfH);

  if (canMove) {
    player.x = newX;
    player.y = newY;
  } else {
    // Try sliding along walls (corner rounding)
    if (dir === 'up' || dir === 'down') {
      // Try sliding left or right
      const slideAmount = speed * 0.8;
      const gx = Math.floor(player.x / T);
      const centerX = gx * T + T / 2;
      const diff = player.x - centerX;

      if (Math.abs(diff) > 2) {
        const slideX = diff > 0 ? player.x - slideAmount : player.x + slideAmount;
        if (checkCollision(state, player, slideX, newY, halfW, halfH)) {
          player.x = slideX;
          player.y = newY;
        } else if (checkCollision(state, player, slideX, player.y, halfW, halfH)) {
          player.x = slideX;
        }
      }
    } else {
      // Try sliding up or down
      const slideAmount = speed * 0.8;
      const gy = Math.floor(player.y / T);
      const centerY = gy * T + T / 2;
      const diff = player.y - centerY;

      if (Math.abs(diff) > 2) {
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
  // Only remove a bomb-tile pass-through when the player's ENTIRE
  // collision box no longer overlaps that tile. This prevents the
  // player from getting stuck when their center has moved off but
  // a corner still overlaps.
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
    // AABB overlap test
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

    // Check bomb collision (owner can walk through if still on bomb tile)
    for (const bomb of state.bombs) {
      if (bomb.gx === gx && bomb.gy === gy) {
        // Owner can walk through only if they haven't left yet
        if (bomb.ownerId === player.id && player.placedBombTiles.has(`${gx},${gy}`)) {
          continue; // allow walk-through
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
    timer: BOMB_TIMER,
    range: effectiveRange,
    animTimer: 0,
    pierce: player.hasPierce,
  };

  state.bombs.push(bomb);
  // Mark that player is standing on this bomb (can walk through until they leave)
  player.placedBombTiles.add(`${gx},${gy}`);
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
  state.shakeTimer = 0.2;
  state.shakeIntensity = 4;

  // Remove from all players' placedBombTiles
  for (const p of state.players) {
    p.placedBombTiles.delete(`${bomb.gx},${bomb.gy}`);
  }

  // Center explosion
  state.explosions.push({
    gx: bomb.gx, gy: bomb.gy,
    timer: EXPLOSION_DURATION,
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
          timer: EXPLOSION_DURATION,
          direction: dir,
          isEnd: !bomb.pierce, // only end if not pierce
        });
        if (!bomb.pierce) break; // stop unless pierce
        continue; // pierce: continue to next tile
      }

      // Empty: add explosion
      state.explosions.push({
        gx: nx, gy: ny,
        timer: EXPLOSION_DURATION,
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
      immuneTimer: EXPLOSION_DURATION + 0.1,
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
      immuneTimer: EXPLOSION_DURATION + 0.2, // survive nearby blasts
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
        player.maxBombs = Math.min(player.maxBombs + 1, MAX_BOMBS);
        break;
      case 'flame':
        player.flameRange = Math.min(player.flameRange + 1, MAX_FLAME);
        break;
      case 'speed':
        if (player.speed < BASE_SPEED + SPEED_BOOST * MAX_SPEED_BOOSTS) {
          player.speed += SPEED_BOOST;
        }
        break;
      case 'bomb2':
        player.maxBombs = Math.min(player.maxBombs + 2, MAX_BOMBS);
        break;
      case 'flame2':
        player.flameRange = Math.min(player.flameRange + 2, MAX_FLAME);
        break;
      case 'speed2':
        player.speed = Math.min(player.speed + SPEED_BOOST * 2, BASE_SPEED + SPEED_BOOST * MAX_SPEED_BOOSTS);
        break;
      case 'fullfire':
        player.flameRange = MAX_FLAME;
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
    if (alive.length === 1) {
      state.winner = `${alive[0].name} Wins!`;
    } else {
      state.winner = 'Draw!';
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
