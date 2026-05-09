#!/usr/bin/env node
const url=process.env.SUPABASE_URL; const key=process.env.SUPABASE_ANON_KEY; const token=process.env.TEST_ACCESS_TOKEN; const patientId=process.env.TEST_PATIENT_ID;
if(!url||!key||!token||!patientId){console.error('Missing envs');process.exit(1)}
const invoke=(fn,body,auth=true)=>fetch(`${url}/functions/v1/${fn}`,{method:'POST',headers:{apikey:key,...(auth?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json().catch(()=>null)}));
const assertEnvelope=(name,r)=>{ if(!r.body||typeof r.body!=='object'||typeof r.body.ok!=='boolean'){ throw new Error(`${name} did not return safe envelope`) } };
for (const [name, body] of [
  ['asaas-create-patient-customer',{patient_id:patientId}],
  ['asaas-create-patient-invoice',{patient_id:patientId,amount_cents:1000,due_date:'2026-05-31',description:'Demo'}],
  ['asaas-create-patient-subscription',{patient_id:patientId,amount_cents:1000,next_due_date:'2026-05-31',cycle:'monthly'}],
]) {
  const okRes=await invoke(name,body,true); if(![200,401,403,404,502].includes(okRes.status)) throw new Error(`${name} unexpected status ${okRes.status}`); assertEnvelope(name,okRes);
  const unauth=await invoke(name,body,false); if(![401,403].includes(unauth.status)) throw new Error(`${name} should enforce auth`);
}
console.log('Billing contract checks passed');
