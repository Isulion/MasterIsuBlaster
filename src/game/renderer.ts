// ============================================================
// Master Blaster - Canvas Renderer (Retro pixel art style)
// ============================================================

import { GameState, Player, Bomb, Explosion, PowerUp, Particle } from './types';

const T = 40; // tile size alias

// ---- Color palette (retro NES/SNES inspired) ----
const COL_FLOOR = '#3a5a2c';
const COL_FLOOR2 = '#2e4e22';
const COL_WALL = '#555555';
const COL_WALL_TOP = '#777777';
const COL_WALL_SHADOW = '#333333';
const COL_BRICK = '#b85c2c';
const COL_BRICK_LINE = '#8b4420';
const COL_BRICK_HI = '#d47040';

/** Main render function */
export function render(ctx: CanvasRenderingContext2D, state: GameState) {
  const { cols, rows, tileSize: _ts } = state;
  const W = cols * T;
  const H = rows * T;

  ctx.save();

  // Screen shake
  if (state.shakeTimer > 0) {
    const intensity = state.shakeIntensity * (state.shakeTimer / 0.3);
    ctx.translate(
      (Math.random() - 0.5) * intensity,
      (Math.random() - 0.5) * intensity
    );
  }

  // Clear
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(-10, -10, W + 20, H + 20);

  // Draw floor
  drawFloor(ctx, cols, rows);

  // Draw tiles (walls, bricks)
  drawTiles(ctx, state);

  // Draw power-ups
  for (const pu of state.powerUps) {
    drawPowerUp(ctx, pu, state.gameTime);
  }

  // Draw bombs
  for (const bomb of state.bombs) {
    drawBomb(ctx, bomb);
  }

  // Draw explosions
  for (const exp of state.explosions) {
    drawExplosion(ctx, exp, state.gameTime);
  }

  // Draw players
  for (const player of state.players) {
    if (player.alive) {
      drawPlayer(ctx, player, state.gameTime);
    }
  }

  // Draw particles
  for (const p of state.particles) {
    drawParticle(ctx, p);
  }

  // Draw HUD
  drawHUD(ctx, state, W, H);

  // Game over overlay
  if (state.gameOver) {
    drawGameOver(ctx, state, W, H);
  }

  // Pause overlay
  if (state.paused && !state.gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.font = '16px monospace';
    ctx.fillText('Press P to resume', W / 2, H / 2 + 30);
  }

  ctx.restore();
}

function drawFloor(ctx: CanvasRenderingContext2D, cols: number, rows: number) {
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      ctx.fillStyle = (gx + gy) % 2 === 0 ? COL_FLOOR : COL_FLOOR2;
      ctx.fillRect(gx * T, gy * T, T, T);
    }
  }
}

function drawTiles(ctx: CanvasRenderingContext2D, state: GameState) {
  for (let gy = 0; gy < state.rows; gy++) {
    for (let gx = 0; gx < state.cols; gx++) {
      const tile = state.tiles[gy][gx];
      const x = gx * T;
      const y = gy * T;

      if (tile.type === 'wall') {
        // 3D wall block
        ctx.fillStyle = COL_WALL_SHADOW;
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = COL_WALL;
        ctx.fillRect(x + 1, y + 1, T - 2, T - 4);
        ctx.fillStyle = COL_WALL_TOP;
        ctx.fillRect(x + 2, y + 2, T - 4, T - 8);
        // Highlight
        ctx.fillStyle = '#999999';
        ctx.fillRect(x + 3, y + 3, T - 8, 2);
      } else if (tile.type === 'brick') {
        // Brick pattern
        ctx.fillStyle = COL_BRICK;
        ctx.fillRect(x, y, T, T);
        ctx.fillStyle = COL_BRICK_LINE;
        // Horizontal lines
        ctx.fillRect(x, y + Math.floor(T / 3), T, 1);
        ctx.fillRect(x, y + Math.floor(2 * T / 3), T, 1);
        // Vertical lines offset per row
        ctx.fillRect(x + Math.floor(T / 2), y, 1, Math.floor(T / 3));
        ctx.fillRect(x + Math.floor(T / 4), y + Math.floor(T / 3), 1, Math.floor(T / 3));
        ctx.fillRect(x + Math.floor(3 * T / 4), y + Math.floor(T / 3), 1, Math.floor(T / 3));
        ctx.fillRect(x + Math.floor(T / 2), y + Math.floor(2 * T / 3), 1, Math.floor(T / 3));
        // Highlight
        ctx.fillStyle = COL_BRICK_HI;
        ctx.fillRect(x + 1, y + 1, T - 2, 2);
      }
    }
  }
}

function drawPowerUp(ctx: CanvasRenderingContext2D, pu: PowerUp, time: number) {
  const x = pu.gx * T;
  const y = pu.gy * T;
  const bounce = Math.sin(time * 4 + pu.gx * 2) * 3;

  ctx.save();
  ctx.translate(x + T / 2, y + T / 2 + bounce);

  // Color and icon mapping for all power-up types
  const colorMap: Record<string, string> = {
    bomb: '#ff6666',
    flame: '#ffaa44',
    speed: '#44ddff',
    bomb2: '#ffcc00',    // golden
    flame2: '#ffcc00',   // golden
    speed2: '#ffcc00',   // golden
    fullfire: '#ff00ff', // magenta
    pierce: '#00ff88',   // green
    shield: '#88ccff',   // light blue
    skull: '#aa44aa',    // purple
  };

  const iconMap: Record<string, string> = {
    bomb: 'B+',
    flame: 'F+',
    speed: 'S+',
    bomb2: 'B++',
    flame2: 'F++',
    speed2: 'S++',
    fullfire: '🔥',
    pierce: '⚡',
    shield: '🛡',
    skull: '💀',
  };

  const color = colorMap[pu.type] || '#ffffff';
  const icon = iconMap[pu.type] || '?';
  const isGolden = pu.type === 'bomb2' || pu.type === 'flame2' || pu.type === 'speed2';
  const isSkull = pu.type === 'skull';

  // Glow effect
  const glow = 0.3 + Math.sin(time * 6) * 0.15;
  ctx.globalAlpha = glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, T / 2 + 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Golden sparkle effect
  if (isGolden) {
    const sparkle = Math.sin(time * 12) * 0.5 + 0.5;
    ctx.globalAlpha = sparkle * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, T / 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Skull pulsing effect
  if (isSkull) {
    const pulse = Math.sin(time * 8) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
  }

  // Background circle
  ctx.fillStyle = isSkull ? '#331133' : '#222244';
  ctx.strokeStyle = color;
  ctx.lineWidth = isGolden ? 3 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, T / 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Icon
  ctx.fillStyle = color;
  ctx.font = icon.length > 2 ? 'bold 12px monospace' : 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 0, 1);

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBomb(ctx: CanvasRenderingContext2D, bomb: Bomb) {
  const x = bomb.gx * T + T / 2;
  const y = bomb.gy * T + T / 2;

  // Pulsing scale
  const pulse = 1 + Math.sin(bomb.animTimer * 8) * 0.1;
  const r = (T / 3) * pulse;

  ctx.save();
  ctx.translate(x, y);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.7, r * 0.8, r * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bomb body - pierce bombs are green-tinted
  ctx.fillStyle = bomb.pierce ? '#113322' : '#222222';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // Pierce ring
  if (bomb.pierce) {
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r + 1, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Highlight
  ctx.fillStyle = bomb.pierce ? '#335544' : '#444444';
  ctx.beginPath();
  ctx.arc(-r * 0.2, -r * 0.2, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // Fuse spark
  const sparkPulse = Math.sin(bomb.animTimer * 20) > 0;
  if (sparkPulse) {
    ctx.fillStyle = '#ffff44';
    ctx.beginPath();
    ctx.arc(0, -r - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, -r - 3, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fuse line
  ctx.strokeStyle = '#885522';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -r + 2);
  ctx.quadraticCurveTo(3, -r - 4, 0, -r - 3);
  ctx.stroke();

  ctx.restore();
}

function drawExplosion(ctx: CanvasRenderingContext2D, exp: Explosion, time: number) {
  const x = exp.gx * T;
  const y = exp.gy * T;
  const progress = 1 - (exp.timer / 0.5);
  const alpha = exp.timer / 0.5;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Outer fire
  const fireColors = ['#ff4400', '#ff6600', '#ffaa00', '#ffdd00', '#ffffff'];
  const colorIdx = Math.floor((time * 20 + exp.gx + exp.gy) % fireColors.length);
  ctx.fillStyle = fireColors[colorIdx];
  ctx.fillRect(x + 1, y + 1, T - 2, T - 2);

  // Inner core
  ctx.fillStyle = '#ffffff';
  const shrink = progress * 6;
  ctx.fillRect(x + 4 + shrink, y + 4 + shrink, T - 8 - shrink * 2, T - 8 - shrink * 2);

  ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: Player, time: number) {
  const { x, y, color, direction, animFrame, invincibleTimer } = player;

  ctx.save();
  ctx.translate(x, y);

  // Invincibility blink
  if (invincibleTimer > 0 && Math.floor(time * 10) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  const bodyH = T * 0.5;
  const headR = T * 0.25;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, bodyH * 0.6, headR * 1.1, headR * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Walk animation - leg movement
  const legOffset = Math.sin(animFrame * 0.3) * 4;

  // Legs
  ctx.fillStyle = '#333333';
  ctx.fillRect(-6, bodyH * 0.1, 4, bodyH * 0.45 + (direction !== 'none' ? legOffset : 0));
  ctx.fillRect(2, bodyH * 0.1, 4, bodyH * 0.45 - (direction !== 'none' ? legOffset : 0));

  // Body
  ctx.fillStyle = color;
  ctx.fillRect(-8, -bodyH * 0.4, 16, bodyH * 0.7);

  // Body highlight
  ctx.fillStyle = lightenColor(color, 40);
  ctx.fillRect(-6, -bodyH * 0.35, 5, bodyH * 0.3);

  // Head
  ctx.fillStyle = '#ffddbb';
  ctx.beginPath();
  ctx.arc(0, -bodyH * 0.45, headR, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (direction-aware)
  const eyeOffX = direction === 'left' ? -2 : direction === 'right' ? 2 : 0;
  const eyeOffY = direction === 'up' ? -2 : direction === 'down' ? 2 : 0;
  ctx.fillStyle = '#000000';
  ctx.fillRect(-4 + eyeOffX, -bodyH * 0.48 + eyeOffY, 2, 3);
  ctx.fillRect(2 + eyeOffX, -bodyH * 0.48 + eyeOffY, 2, 3);

  // Hat/helmet (retro style)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, -bodyH * 0.55, headR * 0.9, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = lightenColor(color, 60);
  ctx.fillRect(-headR * 0.5, -bodyH * 0.55 - headR * 0.6, headR, 3);

  // Shield ring
  if (player.hasShield) {
    ctx.strokeStyle = '#88ccff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5 + Math.sin(time * 4) * 0.3;
    ctx.beginPath();
    ctx.arc(0, 0, T * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Skull curse overlay
  if (player.skullEffect) {
    ctx.globalAlpha = 0.4 + Math.sin(time * 6) * 0.2;
    ctx.fillStyle = '#aa44aa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💀', 0, -bodyH * 0.8);
    ctx.globalAlpha = 1;
  }

  // Pierce indicator (lightning icon above head)
  if (player.hasPierce) {
    ctx.fillStyle = '#00ff88';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡', 8, -bodyH * 0.8);
  }

  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.globalAlpha = p.life / p.maxLife;
  ctx.fillStyle = p.color;
  ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  ctx.globalAlpha = 1;
}

function drawHUD(ctx: CanvasRenderingContext2D, state: GameState, W: number, H: number) {
  const playerCount = state.players.length;
  const isManyPlayers = playerCount > 6;
  
  // For many-player modes, draw HUD at bottom of screen in rows
  if (isManyPlayers) {
    const is40 = playerCount > 20;
    const is20 = playerCount > 10 && playerCount <= 20;
    const cols = is40 ? 10 : is20 ? 10 : 5;
    const rows = Math.ceil(playerCount / cols);
    const rowH = is40 ? 16 : 22;
    const hudH = rows * rowH + (is40 ? 22 : 8);
    const yBase = H + 4;
    
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, yBase, W, hudH);
    
    const slotW = W / cols;
    
    for (let i = 0; i < playerCount; i++) {
      const p = state.players[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const sx = col * slotW + 2;
      const sy = yBase + row * rowH + 2;
      
      ctx.fillStyle = p.alive ? p.color : '#444';
      ctx.beginPath();
      ctx.arc(sx + 3, sy + 5, is40 ? 3 : 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.font = is40 ? '6px monospace' : is20 ? '7px monospace' : 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const nameLen = is40 ? 3 : is20 ? 5 : 6;
      ctx.fillStyle = p.alive ? '#dddddd' : '#777777';
      ctx.fillText(p.name.slice(0, nameLen), sx + 8, sy);
      
      if (!p.alive) {
        ctx.fillStyle = '#aa3333';
        ctx.font = is40 ? '6px monospace' : '8px monospace';
        ctx.fillText('☠', sx + 8, sy + (is40 ? 6 : 10));
        continue;
      }
      
      ctx.fillStyle = '#aaa';
      ctx.font = is40 ? '6px monospace' : is20 ? '7px monospace' : '8px monospace';
      let info = `${p.maxBombs}/${p.flameRange}`;
      if (p.hasPierce) info += '⚡';
      if (p.hasShield) info += '🛡';
      if (p.skullEffect) info += '💀';
      ctx.fillText(info, sx + 8, sy + (is40 ? 6 : 10));
    }
    
    const alive = state.players.filter(p => p.alive).length;
    ctx.fillStyle = alive <= 5 ? '#ff4444' : '#ffaa00';
    ctx.font = is40 ? 'bold 12px monospace' : 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`🔥 ALIVE: ${alive}/${playerCount} 🔥`, W / 2, yBase + hudH - (is40 ? 16 : 18));
    return;
  }

  // Standard HUD for 4-6 players (above the map)
  const yBase = -32;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, yBase, W, 32);

  const slotW = W / playerCount;
  for (let i = 0; i < playerCount; i++) {
    const p = state.players[i];
    const sx = i * slotW + 4;

    // Name
    ctx.fillStyle = p.alive ? p.color : '#555';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(p.name.slice(0, 6), sx, yBase + 2);

    if (!p.alive) {
      ctx.fillStyle = '#aa3333';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('DEAD', sx, yBase + 14);
      continue;
    }

    // Stats row
    ctx.font = '9px monospace';
    const speedLvl = Math.round((p.speed - 120) / 20);
    let stats = `B${p.maxBombs} F${p.flameRange} S${speedLvl}`;
    // Special badges
    if (p.hasPierce) stats += ' ⚡';
    if (p.hasShield) stats += ' 🛡';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(stats, sx, yBase + 14);

    // Skull effect indicator
    if (p.skullEffect) {
      ctx.fillStyle = '#aa44aa';
      ctx.font = 'bold 9px monospace';
      const secs = Math.ceil(p.skullTimer);
      ctx.fillText(`💀${p.skullEffect.slice(0,4)} ${secs}s`, sx, yBase + 23);
    }
  }
}

function drawGameOver(ctx: CanvasRenderingContext2D, state: GameState, W: number, H: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#ffdd44';
  ctx.font = 'bold 40px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 40);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(state.winner || 'Draw!', W / 2, H / 2 + 10);

  ctx.fillStyle = '#aaaaaa';
  ctx.font = '16px monospace';
  ctx.fillText('Press ENTER to return to menu', W / 2, H / 2 + 50);
}

/** Lighten a hex color */
function lightenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + amount);
  const g = Math.min(255, ((num >> 8) & 0xff) + amount);
  const b = Math.min(255, (num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
