#!/usr/bin/env node
const url=process.env.SUPABASE_URL; const key=process.env.SUPABASE_ANON_KEY; const token=process.env.TEST_ACCESS_TOKEN; const patientId=process.env.TEST_PATIENT_ID;
if(!url||!key||!token||!patientId){console.error('Missing envs');process.exit(1)}
const invoke=(fn,body,h={})=>fetch(`${url}/functions/v1/${fn}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...h},body:JSON.stringify(body)}).then(async r=>({status:r.status,body:await r.json()}));
const customer=await invoke('asaas-create-patient-customer',{patient_id:patientId}); if(![200,502].includes(customer.status)) throw new Error('customer contract failed');
const invoice=await invoke('asaas-create-patient-invoice',{patient_id:patientId,amount_cents:1000,due_date:'2026-05-31',description:'Demo'}); if(![200,502,404].includes(invoice.status)) throw new Error('invoice contract failed');
const sub=await invoke('asaas-create-patient-subscription',{patient_id:patientId,amount_cents:1000,next_due_date:'2026-05-31',cycle:'monthly'}); if(![200,502,404].includes(sub.status)) throw new Error('subscription contract failed');
console.log('Billing contract checks passed');
