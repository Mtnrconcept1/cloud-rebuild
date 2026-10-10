import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LaunchGateProvider, useLaunchGate } from '@/components/launch/LaunchGateProvider';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/integrations/supabase/client',()=>({getSupabase:()=>({rpc})}));
function Probe(){const {state}=useLaunchGate();return <span>{state===null?'closed-unknown':state.enabled?'closed':'open'}</span>;}
const data=(enabled:boolean)=>({enabled,server_now:new Date().toISOString(),ends_at:new Date(Date.now()+10000).toISOString()});
const settle=async()=>{await act(async()=>{await Promise.resolve();await Promise.resolve();});};
describe('launch provider revalidation',()=>{
 afterEach(()=>{cleanup();vi.useRealTimers();rpc.mockReset();});
 it('relocks an existing session and closes on a later network error',async()=>{
 vi.useFakeTimers();let response:any={data:data(false),error:null};rpc.mockImplementation(()=>({abortSignal:()=>Promise.resolve(response)}));
 render(<LaunchGateProvider><Probe/></LaunchGateProvider>);await settle();expect(screen.getByText('open')).toBeInTheDocument();
 response={data:data(true),error:null};await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(screen.getByText('closed')).toBeInTheDocument();
 response={data:null,error:new Error('offline')};await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(screen.getByText('closed-unknown')).toBeInTheDocument();
 response={data:data(false),error:null};await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(screen.getByText('open')).toBeInTheDocument();
 });
});
