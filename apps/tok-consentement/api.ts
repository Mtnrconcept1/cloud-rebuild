/** Native TOK consent service. No SDK or third-party signature provider. */
export const PUBLIC_URL = 'https://tok-consentement-restaurateurs.vercel.app';
export const CONTRACT = Object.freeze({
  version: 'tok-contact-v1-2026-10-27',
  title: 'Autorisation de contact par e-mail',
  controller: 'Responsable à renseigner', address: '', contact: '',
  text: 'Je déclare être habilité(e) à communiquer l’adresse e-mail professionnelle indiquée pour le restaurant renseigné. J’autorise le responsable identifié ci-dessus à utiliser cette adresse pour m’envoyer par e-mail des présentations, propositions de démonstration, nouveautés et offres commerciales concernant les services TOK destinés aux restaurateurs. Mon accord est libre et facultatif. Il n’entraîne ni abonnement, ni commande, ni obligation d’achat. Je peux retirer mon accord à tout moment et sans frais depuis mon reçu, via le lien de désabonnement des e-mails commerciaux ou en écrivant au contact indiqué ci-dessus. Cette autorisation ne couvre ni les SMS, ni les appels, ni la prospection de tiers.',
  privacy: 'Le nom du restaurant, votre nom et fonction, l’adresse e-mail, le tracé de signature, le texte accepté et les dates de validation sont enregistrés pour gérer les contacts TOK et documenter votre choix. Un e-mail de confirmation est envoyé à votre demande. Le registre est réservé aux administrateurs TOK autorisés ; votre reçu est accessible par un lien personnel confidentiel. La base Supabase TOK est située en Suisse. Vercel fournit la page et Resend achemine les e-mails ; leurs infrastructures peuvent traiter des données hors de Suisse, notamment dans l’UE et aux États-Unis. Aucun traceur publicitaire n’est ajouté à cet outil. Les demandes non confirmées sont supprimées après 7 jours ; les preuves sont conservées 24 mois après leur création, y compris en cas de retrait, puis supprimées du registre actif lors du nettoyage quotidien. Les sauvegardes et journaux techniques des prestataires suivent leurs durées de conservation propres. Une empreinte technique temporaire, et non votre adresse IP en clair dans ce registre, sert à limiter les abus. Vous pouvez demander l’accès, la rectification ou l’effacement de vos données au responsable indiqué ci-dessus, sous réserve des données strictement nécessaires à la preuve d’un choix ou d’une opposition. Une nouvelle autorisation est nécessaire après expiration. Le présent procédé enregistre une signature électronique simple, sans certificat qualifié ni vérification d’une pièce d’identité.'
});
type Contract = {version:string;title:string;controller:string;address:string;contact:string;text:string;privacy:string};
export async function configuredContract(settings: {controller:string;address:string;email:string}):Promise<Contract> {
 const controller=text(settings.controller,2,200,'responsable légal'),address=text(settings.address,8,500,'adresse professionnelle'),contact=email(settings.email);
 const version=CONTRACT.version+'-'+(await documentHash({controller,address,contact,text:CONTRACT.text,privacy:CONTRACT.privacy})).slice(0,16);
 return {...CONTRACT,controller,address,contact,version};
}
type Env = Record<string, string | undefined>;
type Submission = {restaurant:string;name:string;role:string;email:string;signature:number[][][];requestKey:string};
type Row = {id:string;email:string;payload:Record<string,unknown>;payload_hash:string;document_hash:string;receipt_hash:string;request_hash:string;created_at:string;confirmed_at:string|null;withdrawn_at:string|null;expires_at:string;email_status:string};
class PublicError extends Error { constructor(public status:number, message:string) { super(message); } }
function fail(status:number,message:string):never {throw new PublicError(status,message);}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
const canonical=(v:unknown):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null && typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}':JSON.stringify(v);
export async function documentHash(value:unknown):Promise<string> {return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))));}
async function hmac(secret:string,value:string):Promise<string> {const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)));}
function text(v:unknown,min:number,max:number,label:string):string {if(typeof v!=='string')fail(400,`Vérifiez le champ ${label}.`);const s=(v as string).normalize('NFC').trim();if(s.length<min||s.length>max||/[\u0000-\u001f\u007f]/u.test(s))fail(400,`Vérifiez le champ ${label}.`);return s;}
function email(v:unknown):string {const s=text(v,5,254,'e-mail').toLowerCase();const [local,domain,...rest]=s.split('@');if(rest.length||!local||local.length>64||!domain||!domain.includes('.')||!/^[-a-z0-9._+%]+$/i.test(local)||local.startsWith('.')||local.endsWith('.')||local.includes('..')||!domain.split('.').every(p=>p.length<=63&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(p))||!/[a-z]{2,}$/i.test(domain))fail(400,'Renseignez une adresse e-mail valide.');return s;}
function secretToken(v:unknown):string {if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))fail(400,'Lien personnel non valide.');return v as string;}
export function validateSubmission(input:unknown,version:string=CONTRACT.version):Submission {
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'Formulaire non valide.');
  const v=input as Record<string,unknown>;
  if(v.consent!==true)fail(400,'Votre accord explicite est nécessaire pour enregistrer cette autorisation.');
  if(v.version!==version)fail(409,'Le texte a changé. Rechargez la page et relisez-le avant de signer.');
  if(v.website)fail(400,'Formulaire non valide.');
  const mail=email(v.email);if(email(v.emailAgain)!==mail)fail(400,'Les deux adresses e-mail doivent être identiques.');
  if(!Array.isArray(v.signature)||v.signature.length<1||v.signature.length>64)fail(400,'Veuillez tracer votre signature.');
  let count=0, length=0, minX=1,maxX=0,minY=1,maxY=0;
  const signature=(v.signature as unknown[]).map(stroke=>{
    if(!Array.isArray(stroke)||stroke.length<2||stroke.length>2048)fail(400,'Signature non valide.');
    let previous:number[]|null=null;
    return (stroke as unknown[]).map(point=>{
      if(!Array.isArray(point)||point.length!==2||!point.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))fail(400,'Signature non valide.');
      const p=(point as number[]).map(n=>Math.round(n*10000)/10000);count++;
      if(count>2048)fail(400,'Signature trop longue. Effacez-la et signez à nouveau.');
      minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);
      if(previous)length+=Math.hypot(p[0]-previous[0],p[1]-previous[1]);previous=p;return p;
    });
  });
  if(count<10||length<.15||maxX-minX<.04||maxY-minY<.02)fail(400,'Tracez une signature complète, pas uniquement un point.');
  return {restaurant:text(v.restaurant,2,200,'restaurant'),name:text(v.name,2,160,'nom'),role:text(v.role,2,100,'fonction'),email:mail,signature,requestKey:secretToken(v.requestKey)};
}
export function escapeHtml(value:string):string {return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));}
export function toCsv(rows:unknown[][]):string {return '\ufeff'+rows.map(row=>row.map(value=>{let s=String(value??'').replace(/\r?\n/g,' ');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';')).join('\r\n');}
const query=(values:Record<string,string|number>)=>new URLSearchParams(Object.entries(values).map(([k,v])=>[k,String(v)])).toString();
function status(row:Row):string {return row.withdrawn_at?'withdrawn':new Date(row.expires_at).getTime()<=Date.now()?'expired':row.confirmed_at?'confirmed':'pending';}
function proof(row:Row) {return {id:row.id,document:row.payload,documentHash:row.document_hash,createdAt:row.created_at,confirmedAt:row.confirmed_at,withdrawnAt:row.withdrawn_at,expiresAt:row.expires_at,status:status(row)};}
async function limitedJson(req:Request):Promise<Record<string,unknown>> {
  if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))fail(415,'Format de requête non pris en charge.');
  if(Number(req.headers.get('content-length'))>70000)fail(413,'Formulaire trop volumineux.');
  const reader=req.body?.getReader();if(!reader)fail(400,'Requête vide.');let bytes=0;const chunks:Uint8Array[]=[];
  while(true){const part=await reader!.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>70000){await reader!.cancel();fail(413,'Formulaire trop volumineux.');}chunks.push(part.value);}
  const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
  try {const data=JSON.parse(new TextDecoder().decode(all));if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Requête non valide.');return data;}catch{fail(400,'Requête non valide.');}
}
export function createHandler(env:Env,fetcher:typeof fetch=fetch):(req:Request)=>Promise<Response> {
 const base=env.SUPABASE_URL?.replace(/\/$/,'')||'',key=env.SUPABASE_SERVICE_ROLE_KEY||'';
 const publicKey=env.SUPABASE_ANON_KEY||'sb_publishable_hkHF8kMZXlRpsWKafVDQ4A_OeUiiGkG';
 const table='tok_contact_permissions';
 async function db(path:string,method='GET',body?:unknown):Promise<any> {
   if(!base||!key)fail(503,'Le service est temporairement indisponible.');
   const r=await fetcher(`${base}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   if(!r.ok)fail(503,'L’enregistrement n’a pas pu être effectué. Réessayez sans fermer le formulaire.');
   return r.status===204?null:r.json();
 }
 async function contract():Promise<Contract|null> {const rows=await db('tok_consent_settings?select=controller,address,email&limit=1');return rows[0]?configuredContract(rows[0]):null;}
 async function getByToken(token:unknown):Promise<Row> {const hash=await documentHash(secretToken(token));const rows=await db(table+'?'+query({select:'*',receipt_hash:`eq.${hash}`,limit:1}));if(!rows[0])fail(404,'Ce reçu est introuvable ou a été supprimé.');return rows[0];}
 async function admin(req:Request):Promise<string> {
   const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))fail(401,'Connectez-vous avec votre compte administrateur TOK.');
   const r=await fetcher(`${base}/auth/v1/user`,{headers:{apikey:publicKey,Authorization:authorization!},signal:AbortSignal.timeout(10000)});
   if(!r.ok)fail(401,'Session expirée. Reconnectez-vous.');const user=await r.json();
   if(!user.id||user.is_anonymous)fail(403,'Accès administrateur requis.');
   let claims:Record<string,unknown>={};try {const part=authorization!.slice(7).split('.')[1];claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));}catch{fail(401,'Session non valide.');}
   if(claims.sub!==user.id||claims.aal!=='aal2')fail(403,'Validez votre code de double authentification TOK pour ouvrir le registre.');
   const roles=await db('user_roles?'+query({select:'role',user_id:`eq.${user.id}`,role:'eq.admin',limit:1}));if(!roles.length)fail(403,'Accès administrateur requis.');return user.id;
 }
 async function audit(actor:string,action:string,offset=0){await db('tok_consent_admin_audit','POST',{actor_user_id:actor,action,page_offset:offset});}
 async function sendConfirmation(row:Row,token:string):Promise<boolean> {
   if(row.email_status==='sent')return true;
   if(!env.RESEND_API_KEY||!env.EMAIL_FROM)return false;
   const link=`${PUBLIC_URL}/#receipt=${token}`;
   const plain=`Une autorisation de contact TOK a été signée pour ${String(row.payload.restaurant)}.\n\nConsultez votre reçu et confirmez votre adresse pour activer l’autorisation :\n${link}\n\nLa simple ouverture du lien ne confirme rien. Aucun abonnement ni achat n’est créé. Si vous n’êtes pas à l’origine de cette demande, ne confirmez pas ; vous pouvez la retirer depuis le même lien. Ce lien est personnel : ne le transférez pas. La confirmation expire après 48 heures.\n\n${String(row.payload.text)}\n\nContact : ${String(row.payload.contact)}\nRetirer mon autorisation / me désabonner : ${link}`;
   let ok=false;
   try {const r=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`tok-consent-${row.id}`},body:JSON.stringify({from:env.EMAIL_FROM,to:[row.email],subject:'Confirmez votre autorisation de contact TOK',text:plain,html:`<!doctype html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#191919;padding:24px"><h1 style="font-family:Georgia,serif;color:#191919;font-size:28px">Votre autorisation TOK</h1><p>Une demande a été signée pour ${escapeHtml(String(row.payload.restaurant))}.</p><p><a style="color:#b83a00" href="${link}">Consulter le reçu et confirmer mon adresse</a></p><p>Aucun abonnement ni achat. La simple ouverture de ce lien ne confirme rien. Si vous n’êtes pas à l’origine de la demande, ne confirmez pas.</p><p>${escapeHtml(String(row.payload.text))}</p><p>Ce lien est personnel et confidentiel. Confirmation possible pendant 48 heures.</p><hr><p><a href="${link}">Retirer mon autorisation / me désabonner</a></p></td></tr></table></body></html>`}),signal:AbortSignal.timeout(15000)});ok=r.ok;}catch{ok=false;}
   await db(table+'?'+query({id:`eq.${row.id}`}), 'PATCH',{email_status:ok?'sent':'failed'});return ok;
 }
 async function submit(v:Record<string,unknown>,req:Request) {
   const current=await contract();if(!current)fail(503,'La collecte attend la validation du responsable légal dans l’espace administrateur.');
   const input=validateSubmission(v,current.version),{requestKey,...fields}=input;
   const payloadHash=await documentHash({fields,contract:current});
   const requestHash=await documentHash(requestKey),token=await hmac(key,'tok-consent-receipt:'+requestKey);
   let row:Row=(await db(table+'?'+query({select:'*',request_hash:`eq.${requestHash}`,limit:1})))[0];
   if(row&&row.payload_hash!==payloadHash)fail(409,'Cette demande existe déjà avec un contenu différent. Rechargez la page.');
   if(!row||row.email_status!=='sent'){
     const ip=(req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')?.split(',')[0]||'unknown').trim();
     const allowed=await db('rpc/tok_consent_take_slot','POST',{p_ip:await hmac(key,'ip:'+ip),p_email:await hmac(key,'email:'+fields.email)});
     if(allowed!==true)fail(429,'Trop de demandes. Réessayez plus tard ou contactez TOK.');
   }
   if(!row){
     const id=crypto.randomUUID(),receivedAt=new Date().toISOString();
     const payload={id,...fields,version:current.version,text:current.text,privacy:current.privacy,controller:current.controller,address:current.address,contact:current.contact,receivedAt,signatureType:'Signature électronique simple — tracé manuscrit'};
     // Upsert ignores races; a retry retrieves the original immutable document.
     const r=await fetcher(`${base}/rest/v1/${table}?on_conflict=request_hash`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({id,email:fields.email,payload,payload_hash:payloadHash,request_hash:requestHash,receipt_hash:await documentHash(token),document_hash:await documentHash(payload)}),signal:AbortSignal.timeout(15000)});
     if(!r.ok)fail(503,'L’enregistrement a échoué. Réessayez sans fermer le formulaire.');
     const inserted=await r.json();row=inserted[0]||(await db(table+'?'+query({select:'*',request_hash:`eq.${requestHash}`,limit:1})))[0];
     if(!row||row.payload_hash!==payloadHash)fail(409,'Demande concurrente différente. Rechargez la page.');
   }
   const emailSent=await sendConfirmation(row,token);
   return {id:row.id,createdAt:row.created_at,documentHash:row.document_hash,status:status(row),emailSent,message:emailSent?'Signature enregistrée. Ouvrez l’e-mail reçu et confirmez votre adresse pour activer votre autorisation.':'Signature enregistrée, mais l’e-mail de confirmation n’a pas pu être envoyé. Votre adresse reste exclue de l’export de contacts autorisés. Réessayez avec ce formulaire ou contactez TOK.'};
 }
 return async(req:Request):Promise<Response>=>{
   const origin=req.headers.get('origin');const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
   if(origin===PUBLIC_URL){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
   const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
   try {
     if(origin&&origin!==PUBLIC_URL)fail(403,'Origine non autorisée.');
     if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
     if(req.method==='GET'){const current=await contract();return response({contract:current,configured:Boolean(current),supabaseUrl:base,publicKey,mailConfigured:Boolean(env.RESEND_API_KEY&&env.EMAIL_FROM)});}
     if(req.method!=='POST')fail(405,'Méthode non autorisée.');
     const v=await limitedJson(req);
     if(v.action==='submit')return response(await submit(v,req));
     if(v.action==='configure'){
       const actor=await admin(req);if(v.accept!==true)fail(400,'Confirmez l’identité du responsable avant d’activer la collecte.');
       const current=await configuredContract({controller:v.controller as string,address:v.address as string,email:v.email as string});
       await audit(actor,'configure');
       const r=await fetcher(`${base}/rest/v1/tok_consent_settings?on_conflict=id`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:true,controller:current.controller,address:current.address,email:current.contact,updated_by:actor,updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(15000)});
       if(!r.ok)fail(503,'La configuration n’a pas pu être enregistrée.');return response({contract:current,configured:true});
     }
     if(['receipt','confirm','withdraw'].includes(String(v.action))){
       let row=await getByToken(v.token);
       if(v.action==='withdraw'){await db('rpc/tok_consent_withdraw','POST',{p_receipt_hash:row.receipt_hash});row=await getByToken(v.token);}
       if(v.action==='confirm'){
         if(v.accept!==true)fail(400,'Cliquez sur la confirmation explicite.');
         if(row.withdrawn_at)fail(409,'Cette autorisation a été retirée. Remplissez une nouvelle demande pour redonner votre accord.');
         if(new Date(row.expires_at).getTime()<=Date.now())fail(410,'Cette autorisation a expiré.');
         if(!row.confirmed_at){
           if(new Date(row.created_at).getTime()<Date.now()-48*3600000)fail(410,'Le délai de confirmation de 48 heures est dépassé. Remplissez une nouvelle demande.');
           await db(table+'?'+query({id:`eq.${row.id}`,withdrawn_at:'is.null',confirmed_at:'is.null'}),'PATCH',{confirmed_at:new Date().toISOString()});row=await getByToken(v.token);
           if(row.withdrawn_at||!row.confirmed_at)fail(409,'Cette autorisation ne peut plus être confirmée.');
         }
       }
       return response(proof(row));
     }
     if(['list','detail','export'].includes(String(v.action))){
       const actor=await admin(req);
       const offset=Number(v.offset??0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)fail(400,'Pagination non valide.');
       await audit(actor,String(v.action),offset);
       if(v.action==='detail'){
         if(typeof v.id!=='string'||!/^[0-9a-f-]{36}$/.test(v.id))fail(400,'Référence non valide.');
         const rows=await db(table+'?'+query({select:'*',id:`eq.${v.id}`,limit:1}));if(!rows[0])fail(404,'Reçu introuvable.');return response(proof(rows[0]));
       }
       const filters:Record<string,string|number>={select:'*',order:'created_at.desc,id.desc',limit:51,offset};
       if(v.action==='export'){filters.withdrawn_at='is.null';filters.confirmed_at='not.is.null';filters.expires_at='gt.'+new Date().toISOString();}
       const rows:Row[]=await db(table+'?'+query(filters));const page=rows.slice(0,50);
       const emails=[...new Set(page.map(r=>r.email))];
       const suppressions=emails.length?await db('marketing_contacts?'+query({select:'email_normalized,opted_out_at,lifecycle_status,suppression_reason,metadata',email_normalized:`in.(${emails.join(',')})`,limit:101})):[];
       if(suppressions.length>100)fail(503,'La vérification des oppositions nécessite une revue administrative. Aucun export n’est autorisé.');
       const suppressed=new Set(suppressions.filter((r:any)=>r.opted_out_at||r.lifecycle_status==='opted_out'||r.suppression_reason||r.metadata?.email_suppressed===true).map((r:any)=>r.email_normalized));
       const items=page.map(r=>({id:r.id,restaurant:r.payload.restaurant,name:r.payload.name,role:r.payload.role,email:r.email,createdAt:r.created_at,confirmedAt:r.confirmed_at,expiresAt:r.expires_at,withdrawnAt:r.withdrawn_at,documentHash:r.document_hash,status:status(r),emailStatus:r.email_status,sendable:status(r)==='confirmed'&&!suppressed.has(r.email),suppressed:suppressed.has(r.email)}));
       if(v.action==='export')return response({csv:toCsv([['Restaurant','Nom','Fonction','Email','Signature enregistrée','Email confirmé','Expire le','Référence','Empreinte du document'],...items.filter(i=>i.sendable).map(i=>[i.restaurant,i.name,i.role,i.email,i.createdAt,i.confirmedAt,i.expiresAt,i.id,i.documentHash])]),emails:items.filter(i=>i.sendable).map(i=>i.email),count:items.filter(i=>i.sendable).length,hasMore:rows.length>50,nextOffset:offset+50});
       return response({items,hasMore:rows.length>50,nextOffset:offset+50});
     }
     fail(400,'Action inconnue.');
   }catch(error){return response({error:error instanceof PublicError?error.message:'Le service est temporairement indisponible. Réessayez sans fermer le formulaire.'},error instanceof PublicError?error.status:503);}
 };
}
// Deno Edge runtime entry; the factory above is also tested under Node without a server.
declare const Deno: {env:{toObject():Env};serve(handler:(req:Request)=>Promise<Response>):void}|undefined;
if(typeof Deno!=='undefined')Deno.serve(createHandler(Deno.env.toObject()));
