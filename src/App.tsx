// ============================================================
// Master Blaster - Main App Entry Point
// A retro Bomberman game inspired by classic 1994 gameplay
// ============================================================

import { useState, useCallback } from 'react';
import Menu from './components/Menu';
import Game from './components/Game';
import { GameConfig } from './game/types';

type Screen = 'menu' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [config, setConfig] = useState<GameConfig | null>(null);

  const handleStart = useCallback((cfg: GameConfig) => {
    setConfig(cfg);
    setScreen('game');
  }, []);

  const handleReturnToMenu = useCallback(() => {
    setScreen('menu');
    setConfig(null);
  }, []);

  if (screen === 'game' && config) {
    return <Game config={config} onReturnToMenu={handleReturnToMenu} />;
  }

  return <Menu onStart={handleStart} />;
}
