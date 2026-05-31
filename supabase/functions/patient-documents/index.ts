import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;
const corsHeaders = {'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const jsonResponse = (status:number,payload:Json)=>new Response(JSON.stringify(payload),{status,headers:corsHeaders});
const mapStatus=(s:string)=>{const v=s.toLowerCase(); if(v.includes('sign')) return 'assinado'; if(v.includes('sent')||v.includes('pending')) return 'pendente_assinatura'; if(v.includes('expir')) return 'vencido'; if(v.includes('cancel')) return 'cancelado'; if(v.includes('draft')) return 'em_analise'; return 'disponivel';};

Deno.serve(async (req)=>{
 const timestamp=new Date().toISOString();
 if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST') return jsonResponse(405,{ok:false,error:{code:'method_not_allowed'},meta:{timestamp}});
 try{
  const auth=req.headers.get('Authorization')??''; const token=auth.startsWith('Bearer ')?auth.slice(7):''; if(!token) return jsonResponse(401,{ok:false,error:{code:'unauthorized'},meta:{timestamp}});
  const supabase=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'',{global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data:{user}}=await supabase.auth.getUser(); if(!user) return jsonResponse(401,{ok:false,error:{code:'unauthorized'},meta:{timestamp}});
  const body=await req.json().catch(()=>({})); const patientId=typeof body.patient_id==='string'?body.patient_id:'';
  if(!patientId) return jsonResponse(400,{ok:false,error:{code:'invalid_request',message:'patient_id required'},meta:{timestamp}});
  const {data:patient}=await supabase.from('patients').select('id, tenant_id').eq('id',patientId).maybeSingle(); if(!patient) return jsonResponse(404,{ok:false,error:{code:'not_found'},meta:{timestamp}});
  const tenantId=patient.tenant_id as string;
  const {data:membership}=await supabase.from('tenant_memberships').select('tenant_id').eq('tenant_id',tenantId).eq('user_id',user.id).eq('status','active').maybeSingle();
  if(!membership) return jsonResponse(403,{ok:false,error:{code:'forbidden'},meta:{timestamp,tenant_id:tenantId}});
  const {data:canRead}=await supabase.rpc('has_clinical_permission',{p_tenant_id:tenantId,p_permission:'documents.read'});
  if(canRead!==true) return jsonResponse(403,{ok:false,error:{code:'forbidden',message:'Missing documents.read permission.'},meta:{timestamp,tenant_id:tenantId}});
  const {data:rows,error}=await supabase.from('generated_documents').select('id,patient_id,name,category,status,generated_at,created_at,signature_requests(id,status,created_at)').eq('tenant_id',tenantId).eq('patient_id',patientId).order('created_at',{ascending:false});
  if(error) throw error;
  const documents=(rows??[]).map((row:any)=>{const sr=Array.isArray(row.signature_requests)?row.signature_requests[0]:null;const status=mapStatus(String(sr?.status??row.status??''));return {id:row.id,patientId:row.patient_id,name:row.name,category:row.category,tipo:String(row.category??''),status,assinatura:status==='assinado'?'assinado':sr?'pendente':'nao_requerido',emitidoEm:new Date(row.generated_at??row.created_at).toLocaleDateString('pt-BR'),emitidoPor:'Equipe clínica',hasEvidencePackage:false};});
  return jsonResponse(200,{ok:true,data:{documents},meta:{timestamp,tenant_id:tenantId,patient_id:patientId,count:documents.length}});
 }catch(error){console.error('[patient-documents] unexpected_error',{message:error instanceof Error?error.message:String(error)});return jsonResponse(500,{ok:false,error:{code:'internal_error',message:'Unexpected server error.'},meta:{timestamp}})}
});
