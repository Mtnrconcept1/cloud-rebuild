import {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Scene, WIDTH, HEIGHT} from './Scene';
import {deadlineRemaining, frameRemaining, getDeadline, splitSeconds, STORAGE_KEY, TWENTY_DAYS} from './countdown';
import './viewer.css';

function readStorage() { try { return window.localStorage; } catch { return null; } }
function App() {
  const [mode, setMode] = useState<'demo' | 'live'>('demo');
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [time, setTime] = useState(0);
  const [clock] = useState(() => {
    const storage = readStorage();
    const deadline = getDeadline(storage, Date.now());
    let persisted = false;
    try { persisted = storage?.getItem(STORAGE_KEY) === String(deadline); } catch { /* Session mode. */ }
    return {deadline, persisted};
  });
  const {deadline} = clock;
  const [now, setNow] = useState(Date.now);
  const [pointer, setPointer] = useState({x: 0, y: 0});
  const [scale, setScale] = useState(1);
  const [fullscreenError, setFullscreenError] = useState('');
  const area = useRef<HTMLDivElement>(null);
  const start = useRef(performance.now());
  const motion = useRef(0);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const node = area.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / WIDTH));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let last = performance.now();
    let previous = 0;
    let id = 0;
    function tick(stamp: number) {
      if (stamp - previous >= 1000 / 30) {
        if (!paused && !reduced) motion.current += Math.min(.1, (stamp - last) / 1000);
        last = stamp;
        previous = stamp;
        setTime((stamp - start.current) / 1000);
        setNow(Date.now());
      }
      id = requestAnimationFrame(tick);
    }
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [paused, reduced]);
  const remaining = mode === 'demo' ? frameRemaining(Math.floor(time * 30), 30) : deadlineRemaining(deadline, now);
  const digits = splitSeconds(remaining).map(n => String(n).padStart(2, '0')).join(' : ');
  const tickProgress = mode === 'demo' ? time % 1 : ((now - (deadline - TWENTY_DAYS * 1000)) % 1000 + 1000) % 1000 / 1000;
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await area.current?.requestFullscreen(); }
    catch { setFullscreenError('Le plein écran n’est pas disponible dans ce navigateur.'); }
  }
  return <main>
    <header><div className="wordmark">TOK<span>Le grand lancement.</span></div><button onClick={fullscreen}>Plein écran <span aria-hidden="true">⛶</span></button></header>
    <div className="artwork" ref={area} onPointerMove={event => {
      if (paused || reduced) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      setPointer({x: (event.clientX - bounds.left) / bounds.width * 2 - 1, y: (event.clientY - bounds.top) / bounds.height * 2 - 1});
    }} onPointerLeave={() => {if (!paused) setPointer({x: 0, y: 0});}}>
      <div className="scaled-scene" style={{width: WIDTH, height: HEIGHT, transform: `scale(${scale})`}}>
        <Scene time={motion.current} remaining={remaining} previousRemaining={remaining < TWENTY_DAYS && remaining > 0 ? remaining + 1 : remaining}
          tickProgress={tickProgress} assetBase="./assets" pointer={pointer} reducedMotion={reduced}/>
      </div>
    </div>
    <footer>
      <div className="mode-control" aria-label="Mode du compteur">
        <button aria-pressed={mode === 'demo'} onClick={() => setMode('demo')}>Démonstration</button>
        <button aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Décompte réel</button>
      </div>
      <output role="timer" aria-live="off" aria-label="Jours, heures, minutes, secondes">{digits}</output>
      <div className="actions"><button onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? 'Reprendre le mouvement' : 'Figer le mouvement'}</button>
        {mode === 'demo' && <button onClick={() => {start.current = performance.now(); setTime(0);}}>Repartir de 20 jours</button>}</div>
    </footer>
    <p className="note">{mode === 'demo' ? '20 jours au départ. Une seconde écoulée, une seconde en moins. Déplacez le pointeur pour explorer la profondeur.' :
      clock.persisted ? `Échéance enregistrée sur ce navigateur : ${new Date(deadline).toLocaleString('fr-CH', {timeZone: 'Europe/Paris'})}. Le décompte continue après fermeture.` :
      'Stockage indisponible : le décompte fonctionne pour cette session et recommencera après rechargement.'}</p>
    {reduced && <p className="note">Mouvements réduits selon les préférences de votre appareil. Le compteur reste actif.</p>}
    {fullscreenError && <p role="status" className="note">{fullscreenError}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
