import { describe, expect, it } from 'vitest';
import { parseLaunchState, launchRemaining } from '@/lib/launchGate';
import { getPostAuthTargetForRole } from '@/lib/authPostLogin';
describe('server launch clock',()=>{
 const now=Date.parse('2026-10-10T12:00:00Z');
 const state=parseLaunchState({enabled:true,server_now:new Date(now).toISOString(),ends_at:new Date(now+1728000000).toISOString()},now);
 it('counts exactly one second including DST and day rollover',()=>{expect(launchRemaining(state,now)).toBe(1728000);expect(launchRemaining(state,now+1000)).toBe(1727999);expect(launchRemaining(state,now+86400000)).toBe(19*86400);});
 it('expired countdown never disables the flag',()=>{expect(launchRemaining(state,now+1728000001)).toBe(0);expect(state.enabled).toBe(true);});
 it('corrects the viewer clock from server time',()=>{const skew=parseLaunchState({enabled:true,server_now:new Date(now).toISOString(),ends_at:new Date(now+2000).toISOString()},now+300000);expect(launchRemaining(skew,now+300000)).toBe(2);});
 it.each([null,{}, {enabled:false}, {enabled:true,ends_at:'bad',server_now:'bad'}, {enabled:true,ends_at:null,server_now:new Date(now).toISOString()}])('rejects unverifiable state %j',value=>expect(()=>parseLaunchState(value)).toThrow());
 it.each(['client','restaurateur'] as const)('takes %s to animation during launch',role=>expect(getPostAuthTargetForRole(role,null,{launchEnabled:true})).toBe('/coming-soon'));
 it('keeps admin and open launch routing intact',()=>{expect(getPostAuthTargetForRole('admin',null,{launchEnabled:true})).toBe('/espaces');expect(getPostAuthTargetForRole('client',null,{launchEnabled:false})).toBe('/espaces');});
});
