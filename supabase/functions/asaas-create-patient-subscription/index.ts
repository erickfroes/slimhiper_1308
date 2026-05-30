import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};
const h={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const j=(s:number,p:Record<string,unknown>)=>new Response(JSON.stringify(p),{status:s,headers:h});
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:h});if(req.method!=='POST')return j(405,{ok:false});
const t=(req.headers.get('Authorization')||'').replace('Bearer ',''); if(!t) return j(401,{ok:false}); const sb=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${t}`}}});
const u=(await sb.auth.getUser()).data.user; if(!u) return j(401,{ok:false}); const m=await sb.from('tenant_memberships').select('tenant_id').eq('user_id',u.id).eq('status','active').limit(1).single(); if(m.error)return j(403,{ok:false}); const tenantId=m.data.tenant_id;
if((await sb.rpc('has_permission',{p_tenant_id:tenantId,p_permission:'financial.write'})).data!==true) return j(403,{ok:false}); const b=await req.json();
const c=await sb.from('patient_customers').select('id,asaas_customer_id').eq('tenant_id',tenantId).eq('patient_id',b.patient_id).single(); if(c.error) return j(404,{ok:false});
const asaas=await fetch(`${Deno.env.get('ASAAS_BASE_URL')||'https://api.asaas.com/v3'}/subscriptions`,{method:'POST',headers:{'Content-Type':'application/json',access_token:Deno.env.get('ASAAS_API_KEY')!},body:JSON.stringify({customer:c.data.asaas_customer_id,billingType:b.billing_type||'PIX',value:(b.amount_cents||0)/100,nextDueDate:b.next_due_date,cycle:b.cycle||'MONTHLY',description:b.description,externalReference:b.patient_id})});
if(!asaas.ok) return j(502,{ok:false,error:'asaas_error'}); const d=await asaas.json();
await sb.from('patient_subscriptions').insert({tenant_id:tenantId,patient_id:b.patient_id,patient_customer_id:c.data.id,asaas_subscription_id:d.id,status:(d.status||'ACTIVE').toLowerCase(),cycle:(b.cycle||'monthly').toLowerCase(),amount_cents:b.amount_cents,next_due_date:b.next_due_date,metadata:{description:b.description}});
return j(200,{ok:true,data:{asaas_subscription_id:d.id,status:d.status}});
});
