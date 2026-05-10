// ============================================================
// Master Blaster - Constants
// ============================================================

import { KeyBindings, MapDimensions, MapSize } from './types';

/** Tile size in pixels */
export const TILE_SIZE = 40;

/** Map dimensions for each size */
export const MAP_SIZES: Record<MapSize, MapDimensions> = {
  small:  { cols: 13, rows: 11 },
  medium: { cols: 17, rows: 13 },
  large:  { cols: 21, rows: 15 },
  huge:   { cols: 31, rows: 21 },
  mega:   { cols: 60, rows: 40 }, // exact 60x40 board for 20/40 AI chaos
};

/** Default bomb timer in seconds */
export const BOMB_TIMER = 2.5;

/** Explosion duration in seconds */
export const EXPLOSION_DURATION = 0.5;

/** Base player speed (pixels per second) */
export const BASE_SPEED = 120;

/** Speed boost per power-up */
export const SPEED_BOOST = 20;

/** Default starting bombs */
export const START_BOMBS = 1;

/** Default starting flame range */
export const START_FLAME = 1;

/** Probability that a brick hides a power-up */
export const POWERUP_CHANCE = 0.35;

/** Max flame range */
export const MAX_FLAME = 8;

/** Max speed boosts */
export const MAX_SPEED_BOOSTS = 6;

/** Max bombs */
export const MAX_BOMBS = 8;

/** Skull effect duration */
export const SKULL_DURATION = 8.0;

/** AI decision interval in seconds */
export const AI_TICK = 0.12;

/** Player invincibility on spawn (seconds) */
export const SPAWN_INVINCIBILITY = 1.5;

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Player colors - 40 bright distinct hex colors */
export const PLAYER_COLORS = Array.from({ length: 40 }, (_, i) => hslToHex((i * 360) / 40, 88, 62));

/** Player names */
export const PLAYER_NAMES = Array.from({ length: 40 }, (_, i) => `P${i + 1}`);

/** Default key bindings for two players */
export const DEFAULT_KEYS: KeyBindings[] = [
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', bomb: ' ' },
  { up: 'w', down: 's', left: 'a', right: 'd', bomb: 'q' },
];

/** Spawn positions (grid coords) - supports up to 40 players.
 *  Uses an ordered set of anchors first, then fills from a spread grid. */
export function getSpawnPositions(cols: number, rows: number): { gx: number; gy: number }[] {
  const maxOddX = (cols - 2) % 2 === 1 ? cols - 2 : cols - 3;
  const maxOddY = (rows - 2) % 2 === 1 ? rows - 2 : rows - 3;
  const oddClamp = (n: number, max: number) => {
    let v = Math.max(1, Math.min(max, Math.round(n)));
    if (v % 2 === 0) v += v === max ? -1 : 1;
    return Math.max(1, Math.min(max, v));
  };

  const result: { gx: number; gy: number }[] = [];
  const seen = new Set<string>();
  const push = (gx: number, gy: number) => {
    const x = oddClamp(gx, maxOddX);
    const y = oddClamp(gy, maxOddY);
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ gx: x, gy: y });
    }
  };

  const mx = oddClamp(cols / 2, maxOddX);
  const my = oddClamp(rows / 2, maxOddY);
  const q1x = oddClamp(cols / 4, maxOddX);
  const q3x = oddClamp((cols * 3) / 4, maxOddX);
  const q1y = oddClamp(rows / 4, maxOddY);
  const q3y = oddClamp((rows * 3) / 4, maxOddY);

  // Strong first 20 anchors
  [
    [1, 1], [maxOddX, maxOddY], [maxOddX, 1], [1, maxOddY],
    [mx, 1], [mx, maxOddY], [1, my], [maxOddX, my],
    [q1x, 1], [q3x, 1], [q1x, maxOddY], [q3x, maxOddY],
    [1, q1y], [1, q3y], [maxOddX, q1y], [maxOddX, q3y],
    [q1x, q1y], [q3x, q1y], [q1x, q3y], [q3x, q3y],
  ].forEach(([x, y]) => push(x, y));

  // Fill remaining up to 40 from a spread 8x5 lattice
  const colsCount = 8;
  const rowsCount = 5;
  for (let ry = 0; ry < rowsCount; ry++) {
    for (let rx = 0; rx < colsCount; rx++) {
      const x = 1 + (rx * (maxOddX - 1)) / Math.max(1, colsCount - 1);
      const y = 1 + (ry * (maxOddY - 1)) / Math.max(1, rowsCount - 1);
      push(x, y);
    }
  }

  return result;
}
