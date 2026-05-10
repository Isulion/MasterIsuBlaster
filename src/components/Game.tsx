// ============================================================
// Master Blaster - Game Canvas Component
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { GameConfig, GameState } from '../game/types';
import { MAP_SIZES, TILE_SIZE } from '../game/constants';
import { createGameState, updateGame, handleKeyDown, handleKeyUp, togglePause } from '../game/engine';
import { render } from '../game/renderer';
import { resumeAudio } from '../game/audio';

interface GameProps {
  config: GameConfig;
  onReturnToMenu: () => void;
}

export default function Game({ config, onReturnToMenu }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const { cols, rows } = MAP_SIZES[config.mapSize];
  const canvasW = cols * TILE_SIZE;
  const canvasH = rows * TILE_SIZE;
  // Extra space for HUD - larger for many-player modes (HUD at bottom)
  const isManyPlayers = config.mode === 'ai10' || config.mode === 'ai20' || config.mode === 'ai40';
  const hudH = config.mode === 'ai40' ? 92 : config.mode === 'ai20' ? 70 : config.mode === 'ai10' ? 54 : 32;

  const init = useCallback(() => {
    resumeAudio();
    stateRef.current = createGameState(config);
    lastTimeRef.current = performance.now();
  }, [config]);

  useEffect(() => {
    init();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Key handlers
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();

      // Pause toggle
      if (e.key === 'p' || e.key === 'P') {
        if (stateRef.current) togglePause(stateRef.current);
        return;
      }

      // Return to menu
      if (e.key === 'Enter' && stateRef.current?.gameOver) {
        onReturnToMenu();
        return;
      }

      // Escape to menu
      if (e.key === 'Escape') {
        onReturnToMenu();
        return;
      }

      handleKeyDown(e);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      handleKeyUp(e);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Game loop
    function gameLoop(timestamp: number) {
      const state = stateRef.current;
      if (!state) return;

      // Cap dt to avoid spiral of death
      let dt = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;
      if (dt > 0.05) dt = 0.05; // max 50ms step

      // Update game logic
      updateGame(state, dt);

      // Render
      ctx!.save();
      // Offset for HUD space (top HUD for normal, no offset for many-player modes - HUD at bottom)
      if (!isManyPlayers) {
        ctx!.translate(0, hudH);
      }
      render(ctx!, state);
      ctx!.restore();

      rafRef.current = requestAnimationFrame(gameLoop);
    }

    rafRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [init, onReturnToMenu]);

  // For mega maps, calculate a scale factor so the whole map fits on screen
  const isMega = config.mapSize === 'mega';
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a1a] overflow-hidden p-2">
      <canvas
        ref={canvasRef}
        width={canvasW}
        height={canvasH + hudH}
        className="border-2 border-[#333] rounded shadow-2xl"
        style={{
          imageRendering: 'pixelated',
          maxWidth: isMega ? '98vw' : '95vw',
          maxHeight: isMega ? '92vh' : '95vh',
          width: isMega ? '98vw' : undefined,
        }}
      />
      {!isManyPlayers && (
        <div className="mt-2 text-gray-500 text-xs font-mono">
          ESC: Menu &nbsp;|&nbsp; P: Pause &nbsp;|&nbsp; Arrows/WASD: Move &nbsp;|&nbsp; Space/Q: Bomb
        </div>
      )}
    </div>
  );
}
