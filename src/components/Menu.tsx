// ============================================================
// Master Blaster - Main Menu
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, GameMode, KeyBindings, MapSize } from '../game/types';
import { DEFAULT_KEYS } from '../game/constants';
import { playMenuSelect, resumeAudio } from '../game/audio';

interface MenuProps {
  onStart: (config: GameConfig) => void;
}

/** Friendly key name display */
function keyName(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  if (key === 'ArrowLeft') return '←';
  if (key === 'ArrowRight') return '→';
  return key.toUpperCase();
}

export default function Menu({ onStart }: MenuProps) {
  const [mapSize, setMapSize] = useState<MapSize>('medium');
  const [mode, setMode] = useState<GameMode>('solo');
  const [keys1, setKeys1] = useState<KeyBindings>({ ...DEFAULT_KEYS[0] });
  const [keys2, setKeys2] = useState<KeyBindings>({ ...DEFAULT_KEYS[1] });
  const [rebinding, setRebinding] = useState<{ player: number; action: keyof KeyBindings } | null>(null);
  const [titleAnim, setTitleAnim] = useState(0);

  // Title animation
  useEffect(() => {
    const interval = setInterval(() => {
      setTitleAnim(prev => prev + 1);
    }, 150);
    return () => clearInterval(interval);
  }, []);

  // Key rebinding listener
  const rebindRef = useRef(rebinding);
  rebindRef.current = rebinding;

  const handleRebind = useCallback((e: KeyboardEvent) => {
    if (!rebindRef.current) return;
    e.preventDefault();
    const { player, action } = rebindRef.current;
    const newKey = e.key;

    if (player === 0) {
      setKeys1(prev => ({ ...prev, [action]: newKey }));
    } else {
      setKeys2(prev => ({ ...prev, [action]: newKey }));
    }
    setRebinding(null);
  }, []);

  useEffect(() => {
    if (rebinding) {
      window.addEventListener('keydown', handleRebind);
      return () => window.removeEventListener('keydown', handleRebind);
    }
  }, [rebinding, handleRebind]);

  const handleStart = () => {
    resumeAudio();
    playMenuSelect();
    // Force appropriate map for AI battle modes
    let finalMapSize = mapSize;
    if (mode === 'ai10') finalMapSize = 'huge';
    if (mode === 'ai20' || mode === 'ai40') finalMapSize = 'mega';
    onStart({
      mapSize: finalMapSize,
      mode,
      playerKeys: [keys1, keys2],
    });
  };

  // Auto-switch to appropriate map when selecting AI battle modes
  const handleModeChange = (newMode: GameMode) => {
    setMode(newMode);
    if (newMode === 'ai10') {
      setMapSize('huge');
    } else if (newMode === 'ai20' || newMode === 'ai40') {
      setMapSize('mega');
    }
    playMenuSelect();
  };

  const mapSizes: MapSize[] = ['small', 'medium', 'large', 'huge', 'mega'];
  const modes: { value: GameMode; label: string; desc: string }[] = [
    { value: 'solo', label: '🎮 Solo vs AI', desc: 'You vs 3 AI opponents' },
    { value: 'pvp', label: '👥 1v1 PvP', desc: '2 Players + 2 AI' },
    { value: 'aionly', label: '🤖 AI Battle', desc: 'Watch 4 AI fight' },
    { value: 'ai10', label: '🔥 10 AI WAR', desc: '10 AI battle royale' },
    { value: 'ai20', label: '💀 20 AI MEGA', desc: '20 AI chaos on 60×40' },
    { value: 'ai40', label: '☢️ 40 AI INSANE', desc: '40 AI meltdown on 60×40' },
  ];

  const titleColors = ['#ff4444', '#ff8844', '#ffdd44', '#44ff44', '#44aaff', '#8844ff', '#ff44aa'];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a1a] text-white p-4 select-none">
      {/* Title */}
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-bold font-mono tracking-widest mb-2"
            style={{ textShadow: '0 0 20px rgba(255,100,0,0.5), 0 4px 8px rgba(0,0,0,0.8)' }}>
          {'MASTER BLASTER'.split('').map((ch, i) => (
            <span key={i} style={{
              color: titleColors[(i + titleAnim) % titleColors.length],
              display: 'inline-block',
              transform: `translateY(${Math.sin((i + titleAnim) * 0.5) * 3}px)`,
            }}>
              {ch === ' ' ? '\u00A0' : ch}
            </span>
          ))}
        </h1>
        <p className="text-gray-400 font-mono text-sm tracking-wider">
          ── A Retro Bomberman Experience ──
        </p>
      </div>

      {/* Main menu card */}
      <div className="bg-[#1a1a2e] border border-[#333] rounded-xl p-6 w-full max-w-lg shadow-2xl">

        {/* Map Size */}
        <div className="mb-5">
          <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
            Map Size
          </label>
          <div className="flex gap-2 flex-wrap">
            {mapSizes.map(size => {
              const sizeLabels: Record<string, string> = {
                small: '13×11',
                medium: '17×13',
                large: '21×15',
                huge: '31×21',
                mega: '60×40',
              };
              const isBig = size === 'huge' || size === 'mega';
              return (
                <button
                  key={size}
                  onClick={() => { setMapSize(size); playMenuSelect(); }}
                  className={`flex-1 min-w-[55px] py-2 px-1 rounded font-mono text-xs uppercase tracking-wide transition-all duration-150
                    ${mapSize === size
                      ? size === 'mega'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 animate-pulse'
                        : isBig 
                          ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                          : 'bg-orange-600 text-white shadow-lg shadow-orange-600/30'
                      : 'bg-[#252540] text-gray-400 hover:bg-[#303050]'
                    }`}
                >
                  {size}
                  <span className="block text-[10px] mt-0.5 opacity-70">
                    {sizeLabels[size]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Game Mode */}
        <div className="mb-5">
          <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
            Game Mode
          </label>
          <div className="flex flex-col gap-2">
            {modes.map(m => (
              <button
                key={m.value}
                onClick={() => handleModeChange(m.value)}
                className={`py-2 px-4 rounded font-mono text-left transition-all duration-150
                  ${mode === m.value
                    ? m.value === 'ai40'
                      ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/50 animate-pulse'
                      : m.value === 'ai20'
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/50 animate-pulse'
                        : m.value === 'ai10' 
                          ? 'bg-red-600 text-white shadow-lg shadow-red-600/40 animate-pulse'
                          : 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-[#252540] text-gray-400 hover:bg-[#303050]'
                  }`}
              >
                <span className="text-sm">{m.label}</span>
                <span className="block text-xs mt-0.5 opacity-70">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Key Bindings */}
        {mode !== 'aionly' && mode !== 'ai10' && mode !== 'ai20' && mode !== 'ai40' && (
          <div className="mb-5">
            <label className="block text-sm font-mono text-gray-400 mb-2 uppercase tracking-wider">
              Controls
            </label>

            {/* Player 1 */}
            <KeyBindingEditor
              label="Player 1 (Blue)"
              keys={keys1}
              playerIdx={0}
              rebinding={rebinding}
              onRebind={(action) => setRebinding({ player: 0, action })}
            />

            {/* Player 2 (PvP only) */}
            {mode === 'pvp' && (
              <KeyBindingEditor
                label="Player 2 (Red)"
                keys={keys2}
                playerIdx={1}
                rebinding={rebinding}
                onRebind={(action) => setRebinding({ player: 1, action })}
              />
            )}
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={handleStart}
          className="w-full py-3 rounded-lg font-mono text-lg uppercase tracking-widest font-bold
            bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400
            text-white shadow-lg shadow-red-600/30 hover:shadow-red-500/40
            transition-all duration-200 hover:scale-[1.02] active:scale-95"
        >
          🔥 Start Game 🔥
        </button>
      </div>

      {/* Controls help */}
      <div className="mt-6 text-gray-600 font-mono text-xs text-center space-y-1">
        <p>P: Pause &nbsp;|&nbsp; ESC: Return to menu</p>
        <p className="text-gray-700">Master Blaster © 2024 – Retro Bomberman Tribute</p>
      </div>
    </div>
  );
}

/** Key binding editor sub-component */
function KeyBindingEditor({
  label,
  keys,
  playerIdx,
  rebinding,
  onRebind,
}: {
  label: string;
  keys: KeyBindings;
  playerIdx: number;
  rebinding: { player: number; action: keyof KeyBindings } | null;
  onRebind: (action: keyof KeyBindings) => void;
}) {
  const actions: { key: keyof KeyBindings; label: string }[] = [
    { key: 'up', label: '↑' },
    { key: 'down', label: '↓' },
    { key: 'left', label: '←' },
    { key: 'right', label: '→' },
    { key: 'bomb', label: '💣' },
  ];

  return (
    <div className="mb-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div className="flex gap-1 flex-wrap">
        {actions.map(a => {
          const isRebinding = rebinding?.player === playerIdx && rebinding?.action === a.key;
          return (
            <button
              key={a.key}
              onClick={() => onRebind(a.key)}
              className={`px-2 py-1 rounded text-xs font-mono transition-all
                ${isRebinding
                  ? 'bg-yellow-500 text-black animate-pulse'
                  : 'bg-[#252540] text-gray-300 hover:bg-[#353560]'
                }`}
            >
              {a.label} {isRebinding ? '...' : keyName(keys[a.key])}
            </button>
          );
        })}
      </div>
    </div>
  );
}
