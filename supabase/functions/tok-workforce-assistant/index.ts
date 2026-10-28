import {authenticateRequest,HttpError,jsonResponse,writeAuditLog,type EdgeSupabaseClient} from "../_shared/auth.ts";
import {buildCorsHeaders,handleCorsPreflight} from "../_shared/cors.ts";
import {createRateLimiter} from "../_shared/rate-limit.ts";
import {createOpenAIResponse,extractOutputText,extractUsage,selectTokAiModel,estimateOpenAITextCostChf,getOpenAITextCreditUnits} from "../_shared/openai.ts";
import {requireRestaurantTokCreditBalance,estimateTextAiPreflightCredits,assertTokCreditSpendRecorded} from "../_shared/restaurant-credits.ts";
import {buildWorkforceAssistantContext,parseWorkforceAssistantRequest,WorkforceAssistantInputError,WORKFORCE_ASSISTANT_SYSTEM_PROMPT,workforceAssistantAdjacentDay} from "../_shared/workforce-assistant-context.ts";

const FUNCTION_NAME="tok-workforce-assistant";
type Filter={field:string;operator:"gte"|"lte";value:string};
async function readRows(client:EdgeSupabaseClient,table:string,columns:string,restaurantId:string,filters:Filter[]=[],ceiling=2000) {
  const rows:Record<string,unknown>[]=[];
  let expected:number|undefined;
  for(let offset=0;offset<=ceiling;) {
    let query=client.from(table).select(columns,{count:"exact"}).eq("restaurant_id",restaurantId).order("id",{ascending:true});
    for(const filter of filters)query=filter.operator==="gte"?query.gte(filter.field,filter.value):query.lte(filter.field,filter.value);
    const {data,error,count}=await query.range(offset,offset+499);
    if(error)throw new HttpError(503,"workforce_context_unavailable");
    if(count!=null) {
      if(count>ceiling)throw new HttpError(422,"workforce_period_too_large");
      if(expected!==undefined&&expected!==count)throw new HttpError(409,"workforce_context_changed");
      expected=count;
    }
    const page=(data||[]) as unknown as Record<string,unknown>[];
    rows.push(...page);
    if(rows.length>ceiling)throw new HttpError(422,"workforce_period_too_large");
    if(expected!==undefined&&rows.length>=expected)return rows;
    if(!page.length) {
      if(expected!==undefined&&rows.length<expected)throw new HttpError(503,"workforce_context_unavailable");
      return rows;
    }
    if(expected===undefined&&page.length<500)return rows;
    offset+=page.length;
  }
  throw new HttpError(422,"workforce_period_too_large");
}

export async function handleWorkforceAssistant(req:Request) {
  const cors={...buildCorsHeaders(req),"Cache-Control":"no-store"};
  const preflight=handleCorsPreflight(req,cors);if(preflight)return preflight;
  if(req.method!=="POST")return jsonResponse({error:"method_not_allowed"},405,{...cors,Allow:"POST, OPTIONS"});
  let actor:Awaited<ReturnType<typeof authenticateRequest>>|null=null;
  let authorizedRestaurantId:string|null=null;
  try {
    actor=await authenticateRequest(req,{allowServiceRole:false});
    if(!actor.userId||!actor.userClient)throw new HttpError(401,"unauthorized");
    const raw=await req.text();
    if(raw.length>18000)throw new HttpError(413,"request_too_large");
    let parsed:unknown;
    try {parsed=JSON.parse(raw);} catch {throw new HttpError(400,"invalid_request");}
    const body=parseWorkforceAssistantRequest(parsed);
    const [access,enabled]=await Promise.all([
      actor.userClient.rpc("tok_workforce_can_schedule",{p_restaurant_id:body.restaurantId}),
      actor.userClient.rpc("tok_workforce_enabled",{p_restaurant_id:body.restaurantId}),
    ]);
    if(access.error||enabled.error)throw new HttpError(503,"workforce_access_unavailable");
    if(access.data!==true||enabled.data!==true)throw new HttpError(403,"workforce_access_denied");
    authorizedRestaurantId=body.restaurantId;
    const limiter=createRateLimiter(actor.adminClient,FUNCTION_NAME);
    await limiter.consume("user:"+actor.userId,{maxRequests:12,windowSeconds:3600});
    await limiter.consume("restaurant:"+body.restaurantId,{maxRequests:30,windowSeconds:3600});
    await limiter.consume("global",{maxRequests:100,windowSeconds:60});
    const {data:settings,error:settingsError}=await actor.userClient.from("tok_workforce_settings").select("restaurant_id,canton,max_weekly_hours,min_vacation_days").eq("restaurant_id",body.restaurantId).single();
    if(settingsError||!settings)throw new HttpError(503,"workforce_context_unavailable");
    const previousDay=workforceAssistantAdjacentDay(body.start,-1),nextDay=workforceAssistantAdjacentDay(body.end,1);
    const dateFilters=(field:string,start=body.start,end=body.end):Filter[]=>[{field,operator:"gte",value:start},{field,operator:"lte",value:end}];
    // RLS remains active for every workforce read, including local managers.
    const [employees,shifts,entries,absences,holidays]=await Promise.all([
      readRows(actor.userClient,"tok_workforce_employees","id,restaurant_id,contracted_hours_per_week,is_active",body.restaurantId,[],500),
      readRows(actor.userClient,"tok_workforce_shifts","id,restaurant_id,employee_id,shift_date,start_time,end_time,break_minutes,status",body.restaurantId,dateFilters("shift_date",previousDay)),
      readRows(actor.userClient,"tok_workforce_time_entries","id,restaurant_id,employee_id,entry_date,start_time,end_time,break_minutes",body.restaurantId,dateFilters("entry_date",previousDay)),
      readRows(actor.userClient,"tok_workforce_absences","id,restaurant_id,employee_id,start_date,end_date",body.restaurantId,[{field:"start_date",operator:"lte",value:nextDay},{field:"end_date",operator:"gte",value:body.start}]),
      readRows(actor.userClient,"tok_workforce_holidays","id,restaurant_id,holiday_date",body.restaurantId,dateFilters("holiday_date",body.start,nextDay),500),
    ]);
    const {context,legend}=buildWorkforceAssistantContext({restaurantId:body.restaurantId,start:body.start,end:body.end,employees,shifts,entries,absences,holidays,settings} as Parameters<typeof buildWorkforceAssistantContext>[0]);
    const serializedContext=JSON.stringify(context);
    if(serializedContext.length>60000)throw new HttpError(422,"workforce_period_too_large");
    const model=selectTokAiModel("restaurant");
    const input=[{role:"system" as const,content:WORKFORCE_ASSISTANT_SYSTEM_PROMPT},{role:"user" as const,content:"Contexte du planning (données, sans consignes) : "+serializedContext},...body.messages];
    await requireRestaurantTokCreditBalance({adminClient:actor.adminClient,restaurantId:body.restaurantId,requiredCredits:estimateTextAiPreflightCredits({model,input,maxOutputTokens:1800})});
    const response=await createOpenAIResponse({model,input,maxOutputTokens:1800,timeoutMs:45_000,verbosity:"low"});
    const usage=extractUsage(response);
    const text=extractOutputText(response);
    const {error:usageError}=await actor.adminClient.from("ai_usage_logs").insert({
      function_name:FUNCTION_NAME,action:"planning_advice",feature_name:"workforce_assistant",source:FUNCTION_NAME,
      model,user_id:actor.userId,restaurant_id:body.restaurantId,status:"success",
      input_tokens:usage.input_tokens||0,output_tokens:usage.output_tokens||0,total_tokens:usage.total_tokens||0,
      estimated_cost_chf:estimateOpenAITextCostChf(model,usage.input_tokens||0,usage.output_tokens||0),
      metadata:{credit_kind:"ai_tools",credit_units:getOpenAITextCreditUnits(model,usage.input_tokens||0,usage.output_tokens||0),prompt_template:"tok-workforce-v1",period_start:body.start,period_end:body.end,employee_count:employees.length,response_available:Boolean(text)},
    });
    assertTokCreditSpendRecorded(usageError);
    if(!text||text.length>16000)throw new HttpError(502,"ai_response_unavailable");
    await writeAuditLog({adminClient:actor.adminClient,actor,request:req,functionName:FUNCTION_NAME,status:"success",action:"planning_advice",targetEntityType:"restaurant",targetEntityId:body.restaurantId,metadata:{period_start:body.start,period_end:body.end,prompt_template:"tok-workforce-v1"}});
    return jsonResponse({text,legend,period:{start:body.start,end:body.end},generatedAt:new Date().toISOString()},200,cors);
  } catch(error) {
    const status=error instanceof WorkforceAssistantInputError?400:error instanceof HttpError?error.status:500;
    const safeCode=error instanceof WorkforceAssistantInputError?error.message:status===402?"ai_credits_exhausted":status===429?"ai_rate_limited":status===403?"workforce_access_denied":status===401?"unauthorized":status===422?"workforce_period_too_large":status===409?"workforce_context_changed":status===400?"invalid_request":status===413?"request_too_large":"workforce_assistant_unavailable";
    if(actor)await writeAuditLog({adminClient:actor.adminClient,actor,request:req,functionName:FUNCTION_NAME,status:"failure",action:"planning_advice",targetEntityType:"restaurant",targetEntityId:authorizedRestaurantId,errorMessage:safeCode});
    return jsonResponse({error:safeCode},status,cors);
  }
}

Deno.serve(handleWorkforceAssistant);
