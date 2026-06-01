# Communications Governance Runbook

This runbook covers Phase 8.4 communication retention, moderation, and audit
rules for clinical chat, in-app notifications, report-export events, billing
operational notices, and provider payload references.

## Scope

Governed tables and functions:

- `patient_chat_threads`
- `patient_chat_messages`
- `notifications`
- `communication_governance_events`
- `moderate_patient_chat_message(...)`
- `moderate_notification(...)`
- `archive_expired_communications(...)`
- `scripts/supabase/check-communications-retention.mjs`

Provider webhooks remain governed by their integration runbooks. This module
must not store raw D4Sign/Asaas payloads in communication records.

## Retention policy

| Category                    |      Default retention | Purpose / legal basis                                                | Expiration action                                                                                      |
| --------------------------- | ---------------------: | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Clinical chat messages      |                6 years | Clinical continuity, patient safety, auditability, and legal defense | Archive message/thread metadata after the retention date.                                              |
| Operational notifications   |                2 years | Operational follow-up, delivery evidence, and support diagnostics    | Archive notification and hide it from inbox/header/portal.                                             |
| Financial notifications     |                5 years | Billing support and accounting/legal evidence                        | Archive notification after the retention date; billing source records follow the billing runbook.      |
| Report export notifications |                5 years | Audit trail for generated/downloaded exports                         | Archive notification; report export tokens still expire independently.                                 |
| Provider payload references | Minimum necessary only | Webhook/provider support without exposing raw payloads               | Store redacted summaries in provider tables/runbooks; never copy raw payloads into chat/notifications. |

Retention timestamps are stored in `retention_until`; expired items are marked
with `archived_at` and are filtered from clinical and portal surfaces.

## Moderation policy

Moderation is fail-closed:

1. New messages and notifications start as `moderation_status = 'approved'`.
2. A moderator with `chat.write` can call `moderate_patient_chat_message`.
3. A moderator with `notifications.write` can call `moderate_notification`.
4. `pending_review` or `removed` requires a non-empty reason.
5. Moderated content is not deleted, but UI/RPC payloads replace title/body with
   safe placeholders such as `Conteudo removido ou sob revisao de moderacao.`
6. Moderation writes an audit log and a `communication_governance_events` row
   with non-sensitive metadata only.

Do not include message bodies, patient free text, provider IDs, tokens, secrets,
or raw webhook payloads in moderation reasons or governance event metadata.

## Read receipts

`read_receipts` is a JSONB governance field for future channel-specific delivery
tracking. Until a dedicated mutator is introduced, browser clients should keep
using audited RPCs such as `mark_thread_read`, `mark_notification_read`, and
`mark_patient_portal_notification_read`.

## Expiration / archive operation

The read-only retention script can be used by operations to inspect expiration
volume without mutating data:

```bash
node scripts/supabase/check-communications-retention.mjs
```

It requires backend environment variables and must not print secrets. It reports
aggregate counts only.

The mutating archive path is the service-role-only RPC:

```sql
select public.archive_expired_communications(false);
```

Run the mutating RPC only from an explicitly authorized backend/scheduled job in
the target environment. For dry-run counts through the same RPC:

```sql
select public.archive_expired_communications(true);
```

## Data subject requests

For LGPD/data-subject handling:

1. Confirm requester identity and tenant/patient scope outside the browser.
2. Use `communication_governance_events` and `audit_logs` to identify moderated
   or archived communication records without exposing bodies broadly.
3. Prefer redaction/archival over hard delete when clinical/legal retention is
   still required.
4. If deletion is legally approved, perform it only via a documented backend
   operation with tenant, patient, requester, reason, and approver recorded in
   audit logs.
5. Never send raw communication bodies or provider payloads to third-party tools
   during request triage.

## Safe error and logging rules

- Edge/RPC/browser errors should return stable codes or generic messages.
- Logs must not include message bodies, tokens, secrets, provider document IDs,
  billing provider IDs, raw webhook payloads, signed URLs, or patient free text.
- Communication notification metadata should strip keys such as `providerPayload`,
  `rawPayload`, `token`, and `secret` before insert.
