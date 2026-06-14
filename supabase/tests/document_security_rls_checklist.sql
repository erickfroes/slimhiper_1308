-- Document security RLS and audit checklist
--
-- Purpose: executable/manual pgTAP-style checklist for validating document
-- template/document access without calling D4Sign, Asaas, or any external
-- provider API. Run only against a disposable local/staging Supabase database
-- seeded with synthetic tenants, users, patients, guardians, templates, and
-- generated documents.
--
-- Safety gates:
-- - Do not use real patient, provider, document, billing, or webhook data.
-- - Do not configure D4SIGN_* or ASAAS_* secrets for this checklist run.
-- - Do not invoke Edge Functions that can call providers. Validate table/RLS
--   visibility and local audit rows only.
-- - Prefer local Supabase with fixture UUIDs and storage object placeholders.

begin;

-- 1. Synthetic actors and minimum fixture shape
--    Replace the UUIDs below in a local throwaway seed/transaction only.
--    Keep all names/emails fake and non-deliverable.
--
--    tenant_a:        00000000-0000-4000-8000-0000000000a1
--    tenant_b:        00000000-0000-4000-8000-0000000000b1
--    staff_a:         00000000-0000-4000-8000-0000000000a2 (documents.read/write)
--    staff_b:         00000000-0000-4000-8000-0000000000b2 (other tenant)
--    patient_a:       00000000-0000-4000-8000-0000000000a3
--    guardian_a:      00000000-0000-4000-8000-0000000000a4 (active linked contact)
--    unrelated_user:  00000000-0000-4000-8000-0000000000c1
--    template_active: 00000000-0000-4000-8000-0000000000a5
--    doc_released:    00000000-0000-4000-8000-0000000000a6
--    doc_restricted:  00000000-0000-4000-8000-0000000000a7

-- 2. document_templates RLS
--    [ ] As staff_a with documents.read, SELECT returns only tenant_a templates.
--    [ ] As staff_b, SELECT does not return tenant_a templates.
--    [ ] As unrelated_user, SELECT returns zero tenant_a templates.
--    [ ] As patient_a or guardian_a, SELECT on document_templates returns zero
--        rows unless a future product requirement explicitly grants template
--        metadata to portal users.
--    [ ] INSERT/UPDATE/ARCHIVE/PUBLISH are accepted only for tenant_a staff with
--        documents.write and create sanitized audit rows.
--    [ ] INSERT/UPDATE by staff_b, patient_a, guardian_a, or unrelated_user is
--        rejected by RLS/RBAC.

-- 3. generated_documents RLS for clinic staff
--    [ ] As staff_a with documents.read, SELECT returns tenant_a generated docs
--        including doc_released and doc_restricted metadata.
--    [ ] As staff_b, SELECT does not return tenant_a generated docs.
--    [ ] As unrelated_user, SELECT returns zero tenant_a generated docs.
--    [ ] INSERT/UPDATE release/status operations are accepted only through the
--        approved server/RPC/Edge path or staff with documents.write, according
--        to the current schema contract.

-- 4. Patient/guardian released-document read path
--    [ ] As patient_a, SELECT from generated_documents returns doc_released
--        where released_to_patient = true.
--    [ ] As guardian_a with an active patient link, SELECT returns doc_released.
--    [ ] As patient_a/guardian_a, returned columns/portal APIs never expose
--        storage_path, raw provider payloads, D4Sign ids, signed URLs, tokens,
--        or signer PII beyond approved safe UI hints.
--    [ ] A short-lived signed URL is only requested through document-signed-url;
--        direct storage SELECT/DOWNLOAD remains blocked by policy.

-- 5. Restricted-document blocking
--    [ ] As patient_a, SELECT does not return doc_restricted where
--        released_to_patient = false.
--    [ ] As guardian_a, SELECT does not return doc_restricted.
--    [ ] As unrelated_user, SELECT returns neither doc_released nor
--        doc_restricted.
--    [ ] document-signed-url rejects doc_restricted for patient/guardian actors.

-- 6. Audit expectations for generation, release, and status transitions
--    [ ] Generating a document records document_audit_events action
--        'document.generated' with tenant_id, patient_id, generated_document_id,
--        template_id, actor/source, and a minimized summary.
--    [ ] Releasing a document records action 'document.released_to_patient'.
--    [ ] Hiding/restricting a document records action 'document.hidden_from_patient'.
--    [ ] Status changes record action 'document.status_changed' or
--        'document.signature_status_changed' as applicable.
--    [ ] audit_logs and document_audit_events summaries do not contain raw
--        provider payloads, storage paths, signed URLs, tokens, secrets, cookies,
--        authorization headers, CPF, or real email addresses.

-- 7. Provider isolation assertions
--    [ ] No statement in this checklist calls D4Sign or Asaas.
--    [ ] Webhook validation uses local fixture payloads only.
--    [ ] D4Sign sandbox sending remains disabled unless a separate, explicitly
--        authorized sandbox test sets RUN_D4SIGN_SANDBOX_SEND=true.

rollback;
