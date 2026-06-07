# Document Templates Runbook

Document templates provide development-safe template records used by Patient 360
and document workflows.

## Bootstrap

Run only after authorized migrations and core auth bootstrap:

```bash
node scripts/supabase/bootstrap-document-templates-demo.mjs
```

This script upserts six development-safe `document_templates` rows for tenant
`demo-clinic` using only placeholder variables:

- `{{patient_name}}`
- `{{clinic_name}}`
- `{{program_name}}`
- `{{date}}`
- `{{professional_name}}`

It does not call D4Sign and does not upload files. It intentionally uses upsert
by `tenant_id,name` instead of deleting/reinserting rows, so generated document
history can keep foreign-key references to existing templates.

`generate-document` can generate only templates with `status='active'`. It
accepts custom values only for template variables that are not protected system
variables. Protected values such as patient name, clinic name, date and
professional name are resolved server-side by the Edge Function.

## Relationship To Other Runbooks

Document templates are part of the setup chain for:

- [Patient 360](PATIENT360_RUNBOOK.md)
- [D4Sign documents](../integrations/D4SIGN_RUNBOOK.md)
- [Contract tests](../testing/CONTRACT_TESTS.md)

## Safety Rules

- Do not seed real patient data.
- Do not insert real provider credentials in templates.
- Keep placeholders generic and development-safe.
- If template schema changes, update this runbook and relevant document
  services/functions in the same task.

## M11 Library Contract

M11 adds a template library layer on top of the original document contracts:

- `document_templates.current_version` stores the active library version number.
- `document_template_versions` stores immutable snapshots when template content,
  status, category, variables, name or signature enablement changes.
- `duplicate_document_template(template_id, name)` duplicates an existing
  template into a draft and writes audit records.
- Generated document patient access is changed through
  `set_generated_document_patient_release(...)`, not direct browser updates to
  `generated_documents`.
- `document_audit_events` records generation, status changes, release/hide
  actions, template duplication and signature request/status changes without
  raw provider payloads, signed URLs or private storage paths.

Common clinical UI should say "assinatura digital". Provider names stay limited
to admin/integration surfaces and runbooks where they are operationally needed.
