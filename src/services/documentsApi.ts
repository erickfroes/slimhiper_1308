import type { PatientDocument360Item, PatientDocumentSignatureStatus } from '@/domain/types';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { getPatientDocuments360 } from '@/services/mockApi';

interface SafeServiceError { message: string; code?: string; details?: string; }
interface DocumentSigner { name: string; email: string; role?: string; }
interface GeneratedDocumentResult { generatedDocumentId: string; status: string; }
interface SendForSignatureResult { requestId: string; providerDocumentId?: string; status: string; }

const isMockEnabled = () => process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
const getSupabaseClient = () => createBrowserSupabaseClient();
const safeError=(error:unknown,fallback:string):SafeServiceError=>error instanceof Error?{message:error.message||fallback}:{message:fallback};

async function invokeSafe<T>(fn:string, body:Record<string,unknown>): Promise<{data:T|null;meta?:Record<string,unknown>;error:SafeServiceError|null}> {
  const supabase=getSupabaseClient();
  const {data,error}=await supabase.functions.invoke(fn,{body});
  if (error) return {data:null,error:{message:'Falha na operação de documentos.',code:error.name,details:error.message}};
  if (data?.ok===false) return {data:null,error:{message:String(data?.error?.message??'Falha na operação.'),code:String(data?.error?.code??'unknown')}};
  return {data:(data?.data??null) as T,meta:data?.meta as Record<string,unknown>|undefined,error:null};
}

export async function getPatientDocuments(patientId: string): Promise<{ data: PatientDocument360Item[]; error: SafeServiceError | null }> {
  try {
    if (isMockEnabled()) return { data: await getPatientDocuments360(patientId), error: null };
    const res=await invokeSafe<{documents:PatientDocument360Item[]}>('patient-documents',{patient_id:patientId});
    return { data: Array.isArray(res.data?.documents)?res.data!.documents:[], error: res.error };
  } catch (error) { return { data: [], error: safeError(error,'Não foi possível carregar documentos no momento.') }; }
}

export async function generatePatientDocument(patientId: string, templateId: string): Promise<{ data: GeneratedDocumentResult | null; error: SafeServiceError | null }> {
  try {
    const res=await invokeSafe<{generatedDocument:{id:string;status:string}}>('generate-document',{patient_id:patientId,template_id:templateId});
    if(res.error) return {data:null,error:res.error};
    return { data: { generatedDocumentId: String(res.data?.generatedDocument?.id ?? ''), status: String(res.data?.generatedDocument?.status ?? 'draft') }, error: null };
  } catch (error) { return { data: null, error: safeError(error,'Não foi possível gerar o documento no momento.') }; }
}

export async function sendDocumentForSignature(generatedDocumentId:string,patientId:string,signers:Array<{name:string;email:string;role?:string;assinatura?:PatientDocumentSignatureStatus}>): Promise<{ data: SendForSignatureResult | null; error: SafeServiceError | null }> {
  try {
    const normalizedSigners: DocumentSigner[] = signers.map(({name,email,role})=>({name,email,role}));
    const res=await invokeSafe<{signature_request_id:string;provider_document_id?:string;status:string}>('d4sign-send-document',{generated_document_id:generatedDocumentId,patient_id:patientId,signers:normalizedSigners});
    if(res.error) return {data:null,error:res.error};
    return { data: { requestId: String(res.data?.signature_request_id ?? ''), providerDocumentId: res.data?.provider_document_id ? String(res.data.provider_document_id) : undefined, status: String(res.data?.status ?? 'sent') }, error: null };
  } catch (error) { return { data: null, error: safeError(error,'Não foi possível enviar para assinatura no momento.') }; }
}

export async function getDocumentSignedUrl(generatedDocumentId:string, patientId:string): Promise<{data:{url:string;expiresInSeconds:number}|null;error:SafeServiceError|null}> {
  try {
    const res=await invokeSafe<{url:string;expiresInSeconds:number}>('document-signed-url',{generated_document_id:generatedDocumentId,patient_id:patientId});
    if(res.error) return {data:null,error:res.error};
    return {data:res.data,error:null};
  } catch (error) { return { data: null, error: safeError(error,'Não foi possível gerar link temporário.') }; }
}
