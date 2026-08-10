import { createPrivateKey, sign } from "node:crypto";
const API="https://api.appstoreconnect.apple.com", AUD="appstoreconnect-v1";
const env=n=>{const v=process.env[n]?.trim();if(!v)throw new Error(`${n} is required.`);return v;};
const key=v=>`${(v.includes("\\n")&&!v.includes("\n")?v.replaceAll("\\n","\n"):v).trim()}\n`;
const b64=v=>Buffer.from(v).toString("base64url");
const iat=Math.floor(Date.now()/1000)-5;
const input=`${b64(JSON.stringify({alg:"ES256",kid:env("APP_STORE_CONNECT_KEY_ID"),typ:"JWT"}))}.${b64(JSON.stringify({iss:env("APP_STORE_CONNECT_ISSUER_ID"),iat,exp:iat+300,aud:AUD}))}`;
const auth=`${input}.${sign("sha256",Buffer.from(input),{key:createPrivateKey(key(env("APP_STORE_CONNECT_PRIVATE_KEY"))),dsaEncoding:"ieee-p1363"}).toString("base64url")}`;
async function req(path,opt={}){const r=await fetch(API+path,{headers:{Accept:"application/json",Authorization:`Bearer ${auth}`}});let p=null;try{p=await r.json();}catch{}if(opt.optional404&&r.status===404)return null;if(!r.ok)throw new Error(`${path}: ${p?.errors?.[0]?.detail||p?.errors?.[0]?.title||r.status}`);return p;}
const app=(await req(`/v1/apps?filter[bundleId]=ch.thetok.app&limit=2`)).data[0];
const price=await req(`/v1/apps/${app.id}/appPriceSchedule?include=baseTerritory`);
console.log("PRICE_SCHEDULE",JSON.stringify({id:price.data.id,included:(price.included||[]).map(x=>({type:x.type,id:x.id,...x.attributes}))}));
const manual=await req(`/v1/appPriceSchedules/${price.data.id}/manualPrices?include=appPricePoint,territory&limit=50`);
console.log("MANUAL_PRICES",JSON.stringify({data:(manual.data||[]).map(x=>({id:x.id,...x.attributes,pricePointId:x.relationships?.appPricePoint?.data?.id,territoryId:x.relationships?.territory?.data?.id})),included:(manual.included||[]).map(x=>({type:x.type,id:x.id,...x.attributes}))}));
console.log("AUDIT_COMPLETE");
