import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const h={'Content-Type':'application/json'}; const j=(s:number,p:Record<string,unknown>)=>new Response(JSON.stringify(p),{status:s,headers:h});
async function sha256(v:string){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(req)=>{ if(req.method!=='POST') return j(405,{ok:false}); const token=req.headers.get('asaas-access-token'); if(!token||token!==Deno.env.get('ASAAS_WEBHOOK_TOKEN')) return j(401,{ok:false,error:'invalid_webhook_token'});
const body=await req.json(); const hash=await sha256(JSON.stringify(body));
const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const exists=await sb.from('billing_webhook_events').select('id').eq('event_hash',hash).maybeSingle(); if(exists.data?.id) return j(200,{ok:true,idempotent:true});
await sb.from('billing_webhook_events').insert({provider:'asaas',event_hash:hash,event_type:body.event||'unknown',payload:body,processed_at:new Date().toISOString()});
const payment=body.payment||{}; const extRef=payment.externalReference; let tenantId:string|undefined; let patientId:string|undefined;
if(extRef){ const inv=await sb.from('patient_invoices').select('tenant_id,patient_id,id').eq('asaas_invoice_id',payment.id).maybeSingle(); tenantId=inv.data?.tenant_id; patientId=inv.data?.patient_id; }
await sb.from('asaas_events').insert({tenant_id:tenantId??null,event_type:body.event||'unknown',asaas_event_id:body.id??null,external_reference:extRef??null,payload:body,processed_at:new Date().toISOString()});
if(tenantId&&patientId){
  if(['PAYMENT_RECEIVED','PAYMENT_CONFIRMED'].includes(body.event)) await sb.from('patient_timeline_events').insert({tenant_id:tenantId,patient_id:patientId,event_type:'pagamento_recebido',category:'financial',title:'Pagamento recebido',description:'Pagamento confirmado via Asaas',occurred_at:new Date().toISOString(),payload:{asaas_event:body.event}});
  if(['PAYMENT_OVERDUE'].includes(body.event)) await sb.from('patient_timeline_events').insert({tenant_id:tenantId,patient_id:patientId,event_type:'pagamento_atrasado',category:'financial',title:'Pagamento atrasado',description:'Pagamento marcado como atrasado no Asaas',occurred_at:new Date().toISOString(),payload:{asaas_event:body.event}});
  if(['PAYMENT_CREATED'].includes(body.event)) await sb.from('patient_timeline_events').insert({tenant_id:tenantId,patient_id:patientId,event_type:'pagamento',category:'financial',title:'Pagamento criado',description:'Cobrança criada no Asaas',occurred_at:new Date().toISOString(),payload:{asaas_event:body.event}});
}
return j(200,{ok:true}); });
