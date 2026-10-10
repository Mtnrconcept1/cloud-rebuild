import { useEffect, useRef, useState } from 'react';
import { LaunchArtwork } from './LaunchArtwork';
import { useLaunchGate } from './LaunchGateProvider';
import { launchRemaining } from '@/lib/launchGate';
import './LaunchExperience.css';
export default function LaunchExperience() {
  const { state } = useLaunchGate();
  const area = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ portrait: window.innerWidth < 768, scale: 1 });
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [paused, setPaused] = useState(false);
  const [clock, setClock] = useState({ now: Date.now(), motion: 0 });
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!area.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const portrait = entry.contentRect.width < 768;
      setLayout({ portrait, scale: entry.contentRect.width / (portrait ? 900 : 1672) });
    });
    observer.observe(area.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let last = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(.1, (now - last) / 1000);
      last = now;
      setClock(previous => ({ now: Date.now(), motion: previous.motion + (paused || reduced ? 0 : elapsed) }));
    }, paused || reduced ? 250 : 1000 / 30);
    return () => window.clearInterval(interval);
  }, [paused, reduced]);
  return <>
    <div className="launch-artwork" ref={area} style={{ aspectRatio: layout.portrait ? '9 / 16' : '1672 / 940' }}
      onPointerMove={event => {
        if (paused || reduced || event.pointerType === 'touch') return;
        const rect = event.currentTarget.getBoundingClientRect();
        setPointer({ x: (event.clientX - rect.left) / rect.width * 2 - 1, y: (event.clientY - rect.top) / rect.height * 2 - 1 });
      }} onPointerLeave={() => setPointer({ x: 0, y: 0 })}>
      <div style={{ transform: `scale(${layout.scale})`, transformOrigin: '0 0' }}>
        <LaunchArtwork portrait={layout.portrait} remaining={launchRemaining(state, clock.now)} time={clock.motion} reducedMotion={reduced} pointer={pointer} />
      </div>
    </div>
    <button type="button" className="launch-motion-button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>
      {paused ? 'Reprendre l’animation' : 'Mettre l’animation en pause'}
    </button>
  </>;
}
