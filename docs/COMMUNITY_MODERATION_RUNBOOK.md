# Community Moderation Runbook

Status: M03 implemented as a program-scoped, moderated community.

## Scope

- Patient portal tab: `/patient`, tab `Comunidade`.
- Clinic moderation route: `/clinic/community`.
- Backend migration:
  `supabase/migrations/20260606220000_240_program_community_moderation.sql`.
- Frontend service: `src/services/communityApi.ts`.

## Contracts

- Tables: `community_posts`, `community_comments`, `weekly_prompts`,
  `community_reports`.
- Patient RPCs:
  - `get_patient_community_feed(p_patient_id, p_program_id)`
  - `submit_patient_community_post(p_patient_id, p_program_id, p_body)`
  - `get_patient_community_comments(p_post_id)`
  - `submit_patient_community_comment(p_post_id, p_body)`
  - `report_community_content(p_item_type, p_item_id, p_reason)`
- Clinic RPCs:
  - `get_clinic_community_moderation(p_status_filter, p_program_id)`
  - `moderate_community_item(p_item_type, p_item_id, p_action, p_reason)`
  - `upsert_weekly_prompt(...)`

## Access Rules

- Patients and guardians read only communities for active linked patients whose
  active program has the `comunidade` or `community` entitlement enabled.
- Patients without that benefit receive a blocked envelope, not feed data.
- New posts/comments are pending by default unless the program entitlement
  explicitly sets `config.moderationEnabled=false`; risk terms still force
  pending.
- Moderation requires `community.moderate`.
- New tenants and bootstrap scripts seed `community.read`, `community.write`,
  and `community.moderate`.

## Safety

- The feed stores no images in this cut; optional community image storage remains
  out of scope.
- Author labels use `patients.preferred_name` only, never broad `patient_pii`.
  If entitlement config sets `anonymousByDefault=true`, the backend stores
  `Participante`.
- Risk terms create pending content plus a generic `patient_alert`; raw content
  is not copied into audit metadata.
- Approval, rejection, hiding/removal, reports, and prompts write audit records.
- Rejection/hiding/removal sends a generic patient notification with the
  moderator reason when provided.
- Rate limits are enforced in RPCs: 5 posts/hour and 20 comments/hour per user.

## Checks

Required for this cut:

- `npm run type-check`
- `npm run lint`
- `npm run build`
- `git diff --check`

Do not run `supabase db push` unless that exact operation is explicitly
authorized for the current environment.
