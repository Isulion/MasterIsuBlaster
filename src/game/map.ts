// ============================================================
// Master Blaster - Map Generation
// ============================================================

import { Tile, PowerUpType, MapSize } from './types';
import { MAP_SIZES, POWERUP_CHANCE, getSpawnPositions } from './constants';

/** Generate the game map grid */
export function generateMap(
  mapSize: MapSize,
  numPlayers: number,
  brickDensity: number = 0.7,
  powerUpChance: number = POWERUP_CHANCE,
): { tiles: Tile[][]; cols: number; rows: number } {
  const { cols, rows } = MAP_SIZES[mapSize];
  const tiles: Tile[][] = [];
  const spawns = getSpawnPositions(cols, rows).slice(0, numPlayers);

  // Build set of protected tiles around each spawn (spawn + adjacent + diagonals for bigger safety zone)
  const protectedSet = new Set<string>();
  for (const sp of spawns) {
    // 3x3 area around spawn
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        protectedSet.add(`${sp.gx + dx},${sp.gy + dy}`);
      }
    }
    // Extra tiles for escape routes
    protectedSet.add(`${sp.gx + 2},${sp.gy}`);
    protectedSet.add(`${sp.gx - 2},${sp.gy}`);
    protectedSet.add(`${sp.gx},${sp.gy + 2}`);
    protectedSet.add(`${sp.gx},${sp.gy - 2}`);
  }

  for (let gy = 0; gy < rows; gy++) {
    tiles[gy] = [];
    for (let gx = 0; gx < cols; gx++) {
      // Border walls
      if (gx === 0 || gy === 0 || gx === cols - 1 || gy === rows - 1) {
        tiles[gy][gx] = { type: 'wall' };
      }
      // Pillar pattern (every other cell in both directions)
      else if (gx % 2 === 0 && gy % 2 === 0) {
        tiles[gy][gx] = { type: 'wall' };
      }
      // Protected spawn areas
      else if (protectedSet.has(`${gx},${gy}`)) {
        tiles[gy][gx] = { type: 'empty' };
      }
      // Random bricks with power-ups hidden
      else if (Math.random() < brickDensity) {
        const tile: Tile = { type: 'brick' };
        if (Math.random() < powerUpChance) {
          // Weighted power-up selection
          const roll = Math.random();
          let powerUp: PowerUpType;
          if (roll < 0.25) {
            powerUp = 'bomb';        // 25% - +1 bomb
          } else if (roll < 0.50) {
            powerUp = 'flame';       // 25% - +1 flame
          } else if (roll < 0.70) {
            powerUp = 'speed';       // 20% - +1 speed
          } else if (roll < 0.77) {
            powerUp = 'bomb2';       // 7% - +2 bombs (golden)
          } else if (roll < 0.84) {
            powerUp = 'flame2';      // 7% - +2 flame (golden)
          } else if (roll < 0.88) {
            powerUp = 'speed2';      // 4% - +2 speed (golden)
          } else if (roll < 0.91) {
            powerUp = 'fullfire';    // 3% - max flame
          } else if (roll < 0.94) {
            powerUp = 'pierce';      // 3% - pierce bombs
          } else if (roll < 0.97) {
            powerUp = 'shield';      // 3% - survive one hit
          } else {
            powerUp = 'skull';       // 3% - random curse
          }
          tile.powerUp = powerUp;
        }
        tiles[gy][gx] = tile;
      }
      // Empty
      else {
        tiles[gy][gx] = { type: 'empty' };
      }
    }
  }

  return { tiles, cols, rows };
}
