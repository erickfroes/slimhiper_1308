# Document Templates Runbook

Document templates provide development-safe template records used by Patient 360
and document workflows.

## Bootstrap

Run only after authorized migrations and core auth bootstrap:

```bash
node scripts/supabase/bootstrap-document-templates-demo.mjs
```

This script seeds six development-safe `document_templates` rows for tenant
`demo-clinic` using only placeholder variables:

- `{{patient_name}}`
- `{{clinic_name}}`
- `{{program_name}}`
- `{{date}}`
- `{{professional_name}}`

It does not call D4Sign and does not upload files.

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
