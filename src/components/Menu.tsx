// ============================================================
// Master Blaster - Main Menu with full options panel
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameConfig, GameMode, GameParams, KeyBindings, MapSize } from '../game/types';
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

/** Default game parameters */
function defaultParams(): GameParams {
  return {
    startBombs: 1,
    startFlame: 1,
    startSpeed: 0,
    bombTimer: 2.5,
    explosionDuration: 0.5,
    brickDensity: 0.7,
    powerUpChance: 0.35,
    suddenDeath: false,
    startPierce: false,
    startShield: false,
  };
}

export default function Menu({ onStart }: MenuProps) {
  const [mapSize, setMapSize] = useState<MapSize>('medium');
  const [mode, setMode] = useState<GameMode>('solo');
  const [keys1, setKeys1] = useState<KeyBindings>({ ...DEFAULT_KEYS[0] });
  const [keys2, setKeys2] = useState<KeyBindings>({ ...DEFAULT_KEYS[1] });
  const [rebinding, setRebinding] = useState<{ player: number; action: keyof KeyBindings } | null>(null);
  const [titleAnim, setTitleAnim] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [params, setParams] = useState<GameParams>(defaultParams);

  // Title animation
  useEffect(() => {
    const interval = setInterval(() => setTitleAnim(prev => prev + 1), 150);
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
    if (player === 0) setKeys1(prev => ({ ...prev, [action]: newKey }));
    else setKeys2(prev => ({ ...prev, [action]: newKey }));
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
    let finalMapSize = mapSize;
    if (mode === 'ai10') finalMapSize = 'huge';
    if (mode === 'ai20' || mode === 'ai40') finalMapSize = 'mega';
    onStart({ mapSize: finalMapSize, mode, playerKeys: [keys1, keys2], params });
  };

  const handleModeChange = (newMode: GameMode) => {
    setMode(newMode);
    if (newMode === 'ai10') setMapSize('huge');
    else if (newMode === 'ai20' || newMode === 'ai40') setMapSize('mega');
    playMenuSelect();
  };

  const setParam = <K extends keyof GameParams>(key: K, val: GameParams[K]) => {
    setParams(prev => ({ ...prev, [key]: val }));
  };

  const mapSizes: MapSize[] = ['small', 'medium', 'large', 'huge', 'mega'];
  const sizeLabels: Record<string, string> = {
    small: '13×11', medium: '17×13', large: '21×15', huge: '31×21', mega: '60×40',
  };
  const modes: { value: GameMode; label: string; desc: string }[] = [
    { value: 'solo',   label: '🎮 Solo vs AI',   desc: 'You vs 3 AI' },
    { value: 'pvp',    label: '👥 1v1 PvP',       desc: '2 Players + 2 AI' },
    { value: 'aionly', label: '🤖 AI Battle',     desc: '4 AI fight' },
    { value: 'ai10',   label: '🔥 10 AI WAR',    desc: '10 AI battle royale' },
    { value: 'ai20',   label: '💀 20 AI MEGA',    desc: '20 AI chaos 60×40' },
    { value: 'ai40',   label: '☢️ 40 AI INSANE', desc: '40 AI meltdown 60×40' },
  ];

  const titleColors = ['#ff4444', '#ff8844', '#ffdd44', '#44ff44', '#44aaff', '#8844ff', '#ff44aa'];
  const isAIOnly = mode === 'aionly' || mode === 'ai10' || mode === 'ai20' || mode === 'ai40';
  const modeColor = (m: GameMode) =>
    m === 'ai40' ? 'bg-fuchsia-600 shadow-fuchsia-600/50 animate-pulse'
    : m === 'ai20' ? 'bg-purple-600 shadow-purple-600/50 animate-pulse'
    : m === 'ai10' ? 'bg-red-600 shadow-red-600/40 animate-pulse'
    : 'bg-blue-600 shadow-blue-600/30';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a1a] text-white p-4 select-none overflow-auto">
      {/* Title */}
      <div className="mb-6 text-center">
        <h1 className="text-5xl font-bold font-mono tracking-widest mb-2"
            style={{ textShadow: '0 0 20px rgba(255,100,0,0.5), 0 4px 8px rgba(0,0,0,0.8)' }}>
          {'MASTER BLASTER'.split('').map((ch, i) => (
            <span key={i} style={{
              color: titleColors[(i + titleAnim) % titleColors.length],
              display: 'inline-block',
              transform: `translateY(${Math.sin((i + titleAnim) * 0.5) * 3}px)`,
            }}>{ch === ' ' ? '\u00A0' : ch}</span>
          ))}
        </h1>
        <p className="text-gray-400 font-mono text-sm tracking-wider">── A Retro Bomberman Experience ──</p>
      </div>

      {/* Main menu card */}
      <div className="bg-[#1a1a2e] border border-[#333] rounded-xl p-5 w-full max-w-lg shadow-2xl space-y-4">

        {/* Map Size */}
        <div>
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Map Size</label>
          <div className="flex gap-1.5 flex-wrap">
            {mapSizes.map(size => (
              <button key={size}
                onClick={() => { setMapSize(size); playMenuSelect(); }}
                className={`flex-1 min-w-[50px] py-1.5 px-1 rounded font-mono text-xs uppercase transition-all
                  ${mapSize === size
                    ? size === 'mega' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40'
                    : size === 'huge' ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-orange-600 text-white shadow-lg shadow-orange-600/30'
                    : 'bg-[#252540] text-gray-400 hover:bg-[#303050]'
                  }`}>
                {size}
                <span className="block text-[10px] opacity-70">{sizeLabels[size]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Game Mode */}
        <div>
          <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Game Mode</label>
          <div className="grid grid-cols-2 gap-1.5">
            {modes.map(m => (
              <button key={m.value}
                onClick={() => handleModeChange(m.value)}
                className={`py-1.5 px-3 rounded font-mono text-left transition-all
                  ${mode === m.value ? `${modeColor(m.value)} text-white shadow-lg` : 'bg-[#252540] text-gray-400 hover:bg-[#303050]'}`}>
                <span className="text-xs">{m.label}</span>
                <span className="block text-[10px] opacity-70">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Key Bindings (only for human modes) */}
        {!isAIOnly && (
          <div>
            <label className="block text-xs font-mono text-gray-400 mb-1.5 uppercase tracking-wider">Controls</label>
            <KeyBindingEditor label="Player 1" keys={keys1} playerIdx={0} rebinding={rebinding}
              onRebind={(a) => setRebinding({ player: 0, action: a })} />
            {mode === 'pvp' && (
              <KeyBindingEditor label="Player 2" keys={keys2} playerIdx={1} rebinding={rebinding}
                onRebind={(a) => setRebinding({ player: 1, action: a })} />
            )}
          </div>
        )}

        {/* Options Toggle */}
        <button onClick={() => { setShowOptions(!showOptions); playMenuSelect(); }}
          className="w-full py-1.5 rounded font-mono text-xs uppercase tracking-wider
            bg-[#252540] text-gray-300 hover:bg-[#353560] transition-all flex items-center justify-center gap-2">
          ⚙️ Game Options {showOptions ? '▲' : '▼'}
        </button>

        {/* Options Panel */}
        {showOptions && (
          <div className="bg-[#12122a] border border-[#2a2a4a] rounded-lg p-4 space-y-3">

            {/* Slider row helper */}
            <div className="grid grid-cols-2 gap-3">
              <NumberOption label="Start Bombs" min={1} value={params.startBombs}
                onChange={(v: number) => setParam('startBombs', v)} />
              <NumberOption label="Start Flame" min={1} value={params.startFlame}
                onChange={(v: number) => setParam('startFlame', v)} />
              <NumberOption label="Start Speed" min={0} value={params.startSpeed}
                onChange={(v: number) => setParam('startSpeed', v)} display={(v: number) => `+${v}`} />
              <SliderOption label="Bomb Timer" min={0.5} max={5} step={0.25} value={params.bombTimer}
                onChange={v => setParam('bombTimer', v)} display={v => `${v.toFixed(1)}s`} />
              <SliderOption label="Explosion" min={0.2} max={2} step={0.1} value={params.explosionDuration}
                onChange={v => setParam('explosionDuration', v)} display={v => `${v.toFixed(1)}s`} />
              <SliderOption label="Brick Density" min={0.1} max={0.9} step={0.05} value={params.brickDensity}
                onChange={v => setParam('brickDensity', v)} display={v => `${Math.round(v * 100)}%`} />
              <SliderOption label="Power-Up %" min={0} max={1} step={0.05} value={params.powerUpChance}
                onChange={v => setParam('powerUpChance', v)} display={v => `${Math.round(v * 100)}%`} />
            </div>

            {/* Toggle options */}
            <div className="flex flex-wrap gap-2 pt-1">
              <ToggleOption label="🛡 Start Shield" value={params.startShield}
                onChange={v => setParam('startShield', v)} />
              <ToggleOption label="⚡ Start Pierce" value={params.startPierce}
                onChange={v => setParam('startPierce', v)} />
            </div>

            {/* Presets */}
            <div className="pt-2 border-t border-[#2a2a4a]">
              <label className="block text-[10px] font-mono text-gray-500 mb-1 uppercase">Presets</label>
              <div className="flex gap-1.5 flex-wrap">
                <PresetBtn label="🟢 Default" onClick={() => setParams(defaultParams())} />
                <PresetBtn label="💣 Bomb Party" onClick={() => setParams({
                  ...defaultParams(), startBombs: 5, startFlame: 3, startSpeed: 2, powerUpChance: 0.6,
                })} />
                <PresetBtn label="🔥 Inferno" onClick={() => setParams({
                  ...defaultParams(), startFlame: 8, startPierce: true, explosionDuration: 1.0,
                  bombTimer: 1.5, brickDensity: 0.5, powerUpChance: 0.5,
                })} />
                <PresetBtn label="⚡ Speed Demon" onClick={() => setParams({
                  ...defaultParams(), startSpeed: 5, bombTimer: 1.0, explosionDuration: 0.3,
                  startBombs: 3, brickDensity: 0.4,
                })} />
                <PresetBtn label="🛡 Tank Mode" onClick={() => setParams({
                  ...defaultParams(), startShield: true, startBombs: 3, startFlame: 2,
                  bombTimer: 3.5, explosionDuration: 1.5, powerUpChance: 0.5,
                })} />
                <PresetBtn label="☠️ Chaos" onClick={() => setParams({
                  ...defaultParams(), startBombs: 8, startFlame: 8, startSpeed: 4,
                  startPierce: true, startShield: true, bombTimer: 1.0, explosionDuration: 0.3,
                  brickDensity: 0.3, powerUpChance: 0.8,
                })} />
              </div>
            </div>
          </div>
        )}

        {/* Start Button */}
        <button onClick={handleStart}
          className="w-full py-3 rounded-lg font-mono text-lg uppercase tracking-widest font-bold
            bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400
            text-white shadow-lg shadow-red-600/30 hover:shadow-red-500/40
            transition-all duration-200 hover:scale-[1.02] active:scale-95">
          🔥 Start Game 🔥
        </button>
      </div>

      {/* Footer */}
      <div className="mt-4 text-gray-600 font-mono text-xs text-center space-y-1">
        <p>P: Pause &nbsp;|&nbsp; ESC: Return to menu</p>
        <p className="text-gray-700">Master Blaster – Retro Bomberman Tribute</p>
      </div>
    </div>
  );
}

// ================================================================
// Sub-components
// ================================================================

function SliderOption({ label, min, max, step, value, onChange, display }: {
  label: string; min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; display?: (v: number) => string;
}) {
  const show = display ? display(value) : step >= 1 ? String(value) : value.toFixed(step < 0.1 ? 2 : 1);
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-0.5">
        <span>{label}</span>
        <span className="text-orange-400">{show}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer
          bg-[#333355] accent-orange-500" />
    </div>
  );
}

function NumberOption({ label, min, value, onChange, display }: {
  label: string; min: number; value: number;
  onChange: (v: number) => void; display?: (v: number) => string;
}) {
  const show = display ? display(value) : String(value);
  return (
    <div>
      <div className="flex justify-between text-[10px] font-mono text-gray-400 mb-0.5">
        <span>{label}</span>
        <span className="text-orange-400">{show}</span>
      </div>
      <input
        type="number"
        min={min}
        step={1}
        value={value}
        onChange={e => onChange(Math.max(min, parseInt(e.target.value || '0', 10) || min))}
        className="w-full rounded bg-[#252540] border border-[#3a3a5a] px-2 py-1 text-xs font-mono text-white outline-none focus:border-orange-500"
      />
    </div>
  );
}

function ToggleOption({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button onClick={() => { onChange(!value); playMenuSelect(); }}
      className={`px-3 py-1 rounded font-mono text-xs transition-all
        ${value ? 'bg-green-600 text-white shadow shadow-green-600/30' : 'bg-[#252540] text-gray-400 hover:bg-[#353560]'}`}>
      {label} {value ? '✓' : '✗'}
    </button>
  );
}

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={() => { onClick(); playMenuSelect(); }}
      className="px-2 py-1 rounded font-mono text-[10px] bg-[#252540] text-gray-300
        hover:bg-[#404060] transition-all">
      {label}
    </button>
  );
}

function KeyBindingEditor({ label, keys, playerIdx, rebinding, onRebind }: {
  label: string; keys: KeyBindings; playerIdx: number;
  rebinding: { player: number; action: keyof KeyBindings } | null;
  onRebind: (action: keyof KeyBindings) => void;
}) {
  const actions: { key: keyof KeyBindings; label: string }[] = [
    { key: 'up', label: '↑' }, { key: 'down', label: '↓' },
    { key: 'left', label: '←' }, { key: 'right', label: '→' },
    { key: 'bomb', label: '💣' },
  ];
  return (
    <div className="mb-2">
      <p className="text-[10px] text-gray-500 mb-0.5">{label}</p>
      <div className="flex gap-1 flex-wrap">
        {actions.map(a => {
          const isRebinding = rebinding?.player === playerIdx && rebinding?.action === a.key;
          return (
            <button key={a.key} onClick={() => onRebind(a.key)}
              className={`px-2 py-0.5 rounded text-xs font-mono transition-all
                ${isRebinding ? 'bg-yellow-500 text-black animate-pulse' : 'bg-[#252540] text-gray-300 hover:bg-[#353560]'}`}>
              {a.label} {isRebinding ? '...' : keyName(keys[a.key])}
            </button>
          );
        })}
      </div>
    </div>
  );
}
