import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/integrations/supabase/client';
import { parseLaunchState, type LaunchState } from '@/lib/launchGate';
type LaunchContextValue = { state: LaunchState | null; error: boolean; refresh: () => void };
const LaunchContext = createContext<LaunchContextValue>({ state: null, error: false, refresh: () => {} });
export const useLaunchGate = () => useContext(LaunchContext);
export function LaunchGateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LaunchState | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 8000);
      try {
        const { data, error: requestError } = await (getSupabase() as SupabaseClient)
          .rpc('get_launch_gate_state').abortSignal(controller.signal);
        if (requestError) throw requestError;
        const next = parseLaunchState(data);
        if (!disposed) { setState(next); setError(false); }
      } catch {
        if (!disposed) { setState(null); setError(true); }
      } finally { window.clearTimeout(timeout); inFlight = false; }
    };
    const check = () => { void load(); };
    check();
    const interval = window.setInterval(check, 5000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    window.addEventListener('feature-flags-changed', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      disposed = true; controller?.abort(); window.clearInterval(interval);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      window.removeEventListener('feature-flags-changed', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [revision]);
  return <LaunchContext.Provider value={{ state, error, refresh }}>{children}</LaunchContext.Provider>;
}
