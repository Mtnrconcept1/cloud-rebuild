import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {ReactNode} from "react";
import WorkforceSettingsPanel from "@/components/workforce/WorkforceSettingsPanel";
import WorkforceAssistant from "@/components/workforce/WorkforceAssistant";

const mocks=vi.hoisted(()=>({insert:vi.fn(),invoke:vi.fn(),toast:vi.fn(),refresh:vi.fn(),query:{data:[],isPending:false,isError:false,refetch:vi.fn()}}));
vi.mock("@/lib/auth-context",()=>({useAuth:()=>({user:{id:"owner-1"}})}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:mocks.toast})}));
vi.mock("@/hooks/useTokWorkforce",()=>({
  useWorkforceHolidays:()=>mocks.query,useWorkforceEmployees:()=>mocks.query,useWorkforceRefresh:()=>mocks.refresh,
  workforceDb:()=>({from:()=>({insert:mocks.insert}),functions:{invoke:mocks.invoke}}),
}));
const settings={restaurant_id:"restaurant-1",enabled:true,canton:"GE",max_weekly_hours:50,min_vacation_days:20};
const clients:QueryClient[]=[];
function show(node:ReactNode) {const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});clients.push(client);return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);}
beforeEach(()=>{vi.clearAllMocks();Object.assign(mocks.query,{data:[],isPending:false,isError:false});mocks.insert.mockResolvedValue({error:null});mocks.refresh.mockResolvedValue(undefined);});
afterEach(()=>{cleanup();clients.splice(0).forEach(client=>client.clear());});

describe("Calendrier équipe",()=>{
  it("laisse consulter les règles au responsable sans proposer une écriture",()=>{
    show(<WorkforceSettingsPanel restaurantId="restaurant-1" settings={settings}/>);
    expect(screen.getByText("GE")).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Ajouter le jour férié"})).not.toBeInTheDocument();expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("enregistre dans le restaurant actif et bloque une seconde soumission pendant l’attente",async()=>{
    let finish!:(value:{error:null})=>void;mocks.insert.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    show(<WorkforceSettingsPanel restaurantId="restaurant-1" settings={settings} canEdit/>);
    fireEvent.change(screen.getByLabelText("Date"),{target:{value:"2027-08-01"}});fireEvent.change(screen.getByLabelText("Nom"),{target:{value:"Fête nationale"}});
    const form=screen.getByRole("button",{name:"Ajouter le jour férié"}).closest("form")!;
    fireEvent.submit(form);await waitFor(()=>expect(screen.getByLabelText("Date")).toBeDisabled());fireEvent.submit(form);expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({restaurant_id:"restaurant-1",holiday_date:"2027-08-01",name:"Fête nationale",created_by:"owner-1"}));
    finish({error:null});await waitFor(()=>expect(screen.getByLabelText("Année du calendrier")).toHaveValue(2027));expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("conserve la saisie et explique un doublon de date",async()=>{
    mocks.insert.mockResolvedValue({error:{code:"23505",message:"SQL internal detail"}});show(<WorkforceSettingsPanel restaurantId="restaurant-1" settings={settings} canEdit/>);
    fireEvent.change(screen.getByLabelText("Date"),{target:{value:"2027-08-01"}});fireEvent.change(screen.getByLabelText("Nom"),{target:{value:"Fête nationale"}});fireEvent.click(screen.getByRole("button",{name:"Ajouter le jour férié"}));
    await waitFor(()=>expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({description:expect.stringContaining("date figure déjà")})));expect(screen.getByLabelText("Nom")).toHaveValue("Fête nationale");expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("ne présente pas un calendrier vide pour une année invalide",()=>{
    show(<WorkforceSettingsPanel restaurantId="restaurant-1" settings={settings}/>);fireEvent.change(screen.getByLabelText("Année du calendrier"),{target:{value:"1900"}});expect(screen.getByRole("alert")).toHaveTextContent("2000 et 2100");
  });
});

describe("Assistant de planning",()=>{
  it("attend une action explicite, conserve la question en cas d’échec et permet la reprise",async()=>{
    mocks.invoke.mockResolvedValueOnce({data:null,error:{context:new Response(JSON.stringify({error:"ai_credits_exhausted"}),{status:402})}});
    mocks.invoke.mockImplementationOnce(async(_name:string,{body}:{body:{start:string;end:string}})=>({data:{text:"Contrôlez le repos avant vendredi.",legend:[],period:{start:body.start,end:body.end},generatedAt:"2026-10-28T12:00:00Z"},error:null}));
    show(<WorkforceAssistant restaurantId="restaurant-1"/>);expect(mocks.invoke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Votre question"),{target:{value:"Comment répartir les repos ?"}});fireEvent.click(screen.getByRole("button",{name:"Demander une analyse"}));
    await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("crédits IA"));expect(screen.getByLabelText("Votre question")).toHaveValue("Comment répartir les repos ?");
    fireEvent.click(screen.getByRole("button",{name:"Demander une analyse"}));await screen.findByText("Contrôlez le repos avant vendredi.");expect(screen.getByLabelText("Votre question")).toHaveValue("");
    expect(mocks.invoke.mock.calls[1][1].body.restaurantId).toBe("restaurant-1");
    fireEvent.change(screen.getByLabelText("Début de la période"),{target:{value:"2026-10-01"}});expect(screen.queryByText("Contrôlez le repos avant vendredi.")).not.toBeInTheDocument();
  });
  it("empêche l’envoi sur une période invalide",()=>{
    show(<WorkforceAssistant restaurantId="restaurant-1"/>);fireEvent.change(screen.getByLabelText("Début de la période"),{target:{value:"2026-01-01"}});fireEvent.change(screen.getByLabelText("Fin de la période"),{target:{value:"2026-12-31"}});fireEvent.change(screen.getByLabelText("Votre question"),{target:{value:"Analyse"}});expect(screen.getByRole("button",{name:"Demander une analyse"})).toBeDisabled();expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
