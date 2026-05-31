import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type Json = Record<string, unknown>;
const corsHeaders={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const jsonResponse=(status:number,payload:Json)=>new Response(JSON.stringify(payload),{status,headers:corsHeaders});
const allowedBuckets=new Set(['patient-documents','signed-documents','clinical-attachments','evidence-packages']);
const isValidStoragePath=(path:string,tenantId:string,patientId:string,documentId:string)=>{const parts=path.split('/');return parts.length===4&&parts[0]===tenantId&&parts[1]===patientId&&parts[2]===documentId&&parts[3].length>0;};

Deno.serve(async(req)=>{const timestamp=new Date().toISOString(); if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders}); if(req.method!=='POST') return jsonResponse(405,{ok:false,error:{code:'method_not_allowed'},meta:{timestamp}});
try{
 const auth=req.headers.get('Authorization')??'';const token=auth.startsWith('Bearer ')?auth.slice(7):''; if(!token) return jsonResponse(401,{ok:false,error:{code:'unauthorized'},meta:{timestamp}});
 const supabase=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_ANON_KEY')??'',{global:{headers:{Authorization:`Bearer ${token}`}}});
 const admin=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'');
 const {data:{user}}=await supabase.auth.getUser(); if(!user) return jsonResponse(401,{ok:false,error:{code:'unauthorized'},meta:{timestamp}});
 const body=await req.json().catch(()=>({})); const generatedDocumentId=typeof body.generated_document_id==='string'?body.generated_document_id:''; const patientId=typeof body.patient_id==='string'?body.patient_id:'';
 if(!generatedDocumentId||!patientId) return jsonResponse(400,{ok:false,error:{code:'invalid_request'},meta:{timestamp}});
 const {data:doc}=await supabase.from('generated_documents').select('id,tenant_id,patient_id,storage_bucket,storage_path').eq('id',generatedDocumentId).eq('patient_id',patientId).maybeSingle();
 if(!doc) return jsonResponse(404,{ok:false,error:{code:'not_found'},meta:{timestamp}});
 if(!allowedBuckets.has(String(doc.storage_bucket))) return jsonResponse(500,{ok:false,error:{code:'invalid_storage_bucket'},meta:{timestamp}});
 if(!isValidStoragePath(String(doc.storage_path),String(doc.tenant_id),String(doc.patient_id),String(doc.id))) return jsonResponse(500,{ok:false,error:{code:'invalid_storage_path'},meta:{timestamp}});
 const {data:membership}=await supabase.from('tenant_memberships').select('tenant_id').eq('tenant_id',doc.tenant_id).eq('user_id',user.id).eq('status','active').maybeSingle(); if(!membership) return jsonResponse(403,{ok:false,error:{code:'forbidden'},meta:{timestamp}});
 const {data:canRead}=await supabase.rpc('has_clinical_permission',{p_tenant_id:doc.tenant_id,p_permission:'documents.read'}); if(canRead!==true) return jsonResponse(403,{ok:false,error:{code:'forbidden'},meta:{timestamp}});
 const expiresInSeconds=300; const {data,error}=await admin.storage.from(String(doc.storage_bucket)).createSignedUrl(String(doc.storage_path),expiresInSeconds); if(error) throw error;
 return jsonResponse(200,{ok:true,data:{url:data.signedUrl,expiresInSeconds},meta:{timestamp,tenant_id:doc.tenant_id,patient_id:doc.patient_id,generated_document_id:doc.id}});
}catch(error){console.error('[document-signed-url] unexpected_error',{message:error instanceof Error?error.message:String(error)});return jsonResponse(500,{ok:false,error:{code:'internal_error',message:'Unexpected server error.'},meta:{timestamp}})}
});
