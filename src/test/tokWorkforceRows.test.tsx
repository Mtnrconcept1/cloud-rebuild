import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkforceEntriesInRange } from "@/hooks/useTokWorkforce";

const fake=vi.hoisted(()=>({from:vi.fn(),userId:"user-1"}));
vi.mock("@/lib/auth-context",()=>({useAuth:()=>({user:{id:fake.userId}})}));
vi.mock("@/integrations/supabase/client",()=>({getSupabase:()=>({from:fake.from})}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
function setup(failSecondPage=false){
  const pages:number[][]=[];
  const filters:Array<Record<string,string>>=[];
  fake.from.mockImplementation(()=>{
    let range=[0,0];const conditions:Record<string,string>={};
    const query={select:()=>query,eq:(k:string,v:string)=>{conditions[k]=v;return query;},
      gte:(k:string,v:string)=>{conditions[k+":from"]=v;return query;},
      lte:(k:string,v:string)=>{conditions[k+":to"]=v;return query;},order:()=>query,
      range:(start:number,end:number)=>{range=[start,end];return query;},
      then:(resolve:(value:unknown)=>unknown)=>{
        pages.push(range);filters.push(conditions);
        return Promise.resolve(resolve(failSecondPage&&range[0]>0?{data:null,error:new Error("Page unavailable")}
          :{data:Array.from({length:Math.max(0,Math.min(range[1]+1,600)-range[0])},(_,i)=>({id:String(range[0]+i)})),error:null}));
      },
    };return query;
  });
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  const wrapper=({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return {pages,filters,wrapper};
}
describe("complete workforce period queries",()=>{
  it("includes more than one backend page with the same tenant, person and date filters",async()=>{
    const h=setup();
    const {result}=renderHook(()=>useWorkforceEntriesInRange("restaurant-1",true,"2026-10-01","2026-10-31","employee-1"),{wrapper:h.wrapper});
    await waitFor(()=>expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(600);
    expect(h.pages).toEqual([[0,499],[500,999]]);
    for(const filter of h.filters)expect(filter).toEqual({restaurant_id:"restaurant-1",employee_id:"employee-1","entry_date:from":"2026-10-01","entry_date:to":"2026-10-31"});
  });
  it("returns an error instead of a partial payroll total when a later page fails",async()=>{
    const h=setup(true);
    const {result}=renderHook(()=>useWorkforceEntriesInRange("restaurant-1",true,"2026-10-01","2026-10-31"),{wrapper:h.wrapper});
    await waitFor(()=>expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
