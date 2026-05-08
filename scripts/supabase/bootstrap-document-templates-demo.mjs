#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const requiredEnv = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEMPLATE_VARIABLES = {
  patient_name: '{{patient_name}}',
  clinic_name: '{{clinic_name}}',
  program_name: '{{program_name}}',
  date: '{{date}}',
  professional_name: '{{professional_name}}',
};

const templates = [
  {
    name: 'Contrato de prestação de serviço',
    category: 'contract',
    template_body: `
CONTRATO DE PRESTAÇÃO DE SERVIÇO

Paciente: {{patient_name}}
Clínica: {{clinic_name}}
Programa: {{program_name}}
Data: {{date}}
Profissional responsável: {{professional_name}}

Este documento é um modelo de demonstração para ambiente de desenvolvimento, sem dados pessoais reais.
`.trim(),
  },
  {
    name: 'Termo de consentimento do protocolo',
    category: 'consent',
    template_body: `
TERMO DE CONSENTIMENTO DO PROTOCOLO

Eu, {{patient_name}}, declaro ciência das etapas do programa {{program_name}} conduzido por {{professional_name}} na {{clinic_name}}, em {{date}}.

Este documento é apenas um template de demonstração para desenvolvimento.
`.trim(),
  },
  {
    name: 'Termo de privacidade e tratamento de dados',
    category: 'privacy',
    template_body: `
TERMO DE PRIVACIDADE E TRATAMENTO DE DADOS

Paciente: {{patient_name}}
Clínica: {{clinic_name}}
Data: {{date}}

Autorizo, para fins do programa {{program_name}}, o tratamento dos dados estritamente necessários pela equipe liderada por {{professional_name}}.

Modelo demonstrativo sem PII real.
`.trim(),
  },
  {
    name: 'Autorização de compartilhamento com nutricionista/educador físico',
    category: 'authorization',
    template_body: `
AUTORIZAÇÃO DE COMPARTILHAMENTO

Eu, {{patient_name}}, autorizo a {{clinic_name}} a compartilhar informações pertinentes ao programa {{program_name}} com nutricionista e/ou educador físico designados.

Data: {{date}}
Profissional responsável: {{professional_name}}

Template de desenvolvimento sem dados pessoais reais.
`.trim(),
  },
  {
    name: 'Termo de teleatendimento',
    category: 'telehealth',
    template_body: `
TERMO DE TELEATENDIMENTO

Paciente: {{patient_name}}
Clínica: {{clinic_name}}
Programa: {{program_name}}
Profissional: {{professional_name}}
Data: {{date}}

Declaro ciência sobre as orientações de teleatendimento neste modelo de demonstração.
`.trim(),
  },
  {
    name: 'Orientações gerais do programa',
    category: 'guidelines',
    template_body: `
ORIENTAÇÕES GERAIS DO PROGRAMA

Paciente: {{patient_name}}
Programa: {{program_name}}
Clínica: {{clinic_name}}
Profissional responsável: {{professional_name}}
Data: {{date}}

Este material apresenta orientações gerais em formato de template para uso em desenvolvimento.
`.trim(),
  },
];

async function run() {
  const tenantSlug = 'demo-clinic';

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, slug')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (tenantError) throw tenantError;
  if (!tenant) {
    throw new Error(`Tenant with slug "${tenantSlug}" was not found. Run bootstrap-core-auth first.`);
  }

  const payload = templates.map((template) => ({
    tenant_id: tenant.id,
    name: template.name,
    category: template.category,
    status: 'active',
    template_body: template.template_body,
    variables: TEMPLATE_VARIABLES,
    d4sign_enabled: false,
  }));

  const templateNames = templates.map((template) => template.name);

  const { error: deleteError } = await supabase
    .from('document_templates')
    .delete()
    .eq('tenant_id', tenant.id)
    .in('name', templateNames);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from('document_templates').insert(payload);

  if (insertError) throw insertError;

  console.log(`Seeded ${payload.length} document templates for tenant ${tenantSlug}.`);
}

run().catch((error) => {
  console.error('Failed to seed document templates demo data.', error);
  process.exit(1);
});
