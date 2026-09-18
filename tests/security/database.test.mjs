import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const tenant = '10000000-0000-4000-8000-000000000001';
const otherTenant = '10000000-0000-4000-8000-000000000002';
const user = '20000000-0000-4000-8000-000000000001';
const otherUser = '20000000-0000-4000-8000-000000000002';
const membership = '30000000-0000-4000-8000-000000000001';

// Minimal synthetic Supabase contracts, NOT a substitute for replaying the full
// historical database or exercising GoTrue, PostgREST and Storage over HTTP.
const fixture = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema security; create schema storage;
grant usage on schema public,auth,security,storage to anon,authenticated,service_role;
alter default privileges grant execute on functions to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('request.jwt.claim.role',true) $$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create table public.tenants(id uuid primary key,status text);
create table public.profiles(id uuid primary key,is_active boolean,active_tenant_id uuid);
create table public.tenant_memberships(id uuid primary key,tenant_id uuid,user_id uuid,unit_id uuid,role_code text,status text,accepted_at timestamptz);
create table public.patient_accounts(tenant_id uuid,user_id uuid,status text,linked_at timestamptz,updated_at timestamptz);
create table public.guardian_links(tenant_id uuid,guardian_user_id uuid,status text,updated_at timestamptz);
create table public.patient_portal_access_invites(tenant_id uuid,user_id uuid,status text,activated_at timestamptz,updated_at timestamptz);
create table public.audit_logs(tenant_id uuid,user_id uuid,action text,entity_type text,entity_id uuid,metadata jsonb);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
create policy legacy_permissive on storage.objects for all to authenticated using(true) with check(true);
create function public.get_call_panel_snapshot(text) returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
create function public.ensure_default_agenda_service(uuid) returns void language plpgsql security definer as $$ begin return; end $$;
create function security.is_valid_uuid_text(text) returns boolean language sql immutable as $$ select $1 ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' $$;
create function security.is_valid_user_profile_avatar_path(text) returns boolean language sql immutable as $$ select $1 ~ '^[a-f0-9-]+/[a-f0-9-]+/[a-z0-9.-]+$' $$;
create function security.is_tenant_member(uuid) returns boolean language sql security definer as $$ select exists(select 1 from public.tenant_memberships m join public.profiles p on p.id=m.user_id where m.tenant_id=$1 and m.user_id=auth.uid() and m.status='active' and p.is_active) $$;
create function security.has_permission(uuid,text,boolean) returns boolean language sql security definer as $$ select exists(select 1 from public.tenant_memberships where tenant_id=$1 and user_id=auth.uid() and status='active' and role_code='tenant_owner') $$;
insert into auth.users values('${user}','synthetic@example.test',now()),('${otherUser}','other@example.test',now());
insert into public.tenants values('${tenant}','active'),('${otherTenant}','active');
insert into public.profiles values('${user}',true,null),('${otherUser}',true,null);
insert into public.tenant_memberships values('${membership}','${tenant}','${user}',null,'patient','invited',null);
insert into public.patient_accounts(tenant_id,user_id,status) values('${tenant}','${user}','pending');
insert into public.patient_portal_access_invites(tenant_id,user_id,status) values('${tenant}','${user}','pending');
insert into storage.buckets values('user-profile-avatars','user-profile-avatars',false,5242880,array['image/jpeg','image/png','image/webp']);
`;

test('actual forward migrations: invitation transaction, ACLs, quotas and restrictive Storage policies', async (t) => {
  const db = await PGlite.create();
  const query = async (sql, params = []) => (await db.query(sql, params)).rows;
  const claims = async (role, uid = user) => {
    await query(
      "select set_config('request.jwt.claim.role',$1,false),set_config('request.jwt.claim.sub',$2,false)",
      [role, uid]
    );
  };
  try {
    await db.exec(fixture);
    // Reuse the actual prerequisite invitation table, without unrelated 810 changes.
    await db.exec(
      migration('20260812160000_810_security_hardening_invites_rpcs_storage.sql').split(
        '-- PostgreSQL grants EXECUTE'
      )[0]
    );
    for (const name of [
      '20260918100000_830_security_transactions.sql',
      '20260918101000_831_security_function_grants.sql',
      '20260918102000_832_scanned_uploads.sql',
    ])
      await db.exec(migration(name));

    await t.test(
      'remove legacy authenticated helper grants and deny new functions by default',
      async () => {
        const [acl] = await query(
          "select has_function_privilege('authenticated','public.ensure_default_agenda_service(uuid)','execute') as helper,has_function_privilege('anon','public.get_call_panel_snapshot(text)','execute') as panel,has_function_privilege('authenticated','public.accept_tenant_invitation(text,uuid,uuid)','execute') as accept"
        );
        assert.deepEqual(acl, { helper: false, panel: true, accept: false });
        await db.exec(
          'create function public.synthetic_future() returns integer language sql security definer as $$ select 1 $$;'
        );
        const [future] = await query(
          "select has_function_privilege('authenticated','public.synthetic_future()','execute') as authenticated,has_function_privilege('anon','public.synthetic_future()','execute') as anon"
        );
        assert.deepEqual(future, { authenticated: false, anon: false });
      }
    );

    await t.test(
      'rate budget fails closed, rejects caller spoofing and resets after expiry',
      async () => {
        await claims('authenticated');
        await assert.rejects(
          query("select public.consume_security_rate_limit('test',$1,2,60)", ['a'.repeat(64)]),
          /service_role_required/
        );
        await claims('service_role');
        const allowed = [];
        for (let i = 0; i < 3; i++)
          allowed.push(
            (
              await query("select public.consume_security_rate_limit('test',$1,2,60) as r", [
                'a'.repeat(64),
              ])
            )[0].r.allowed
          );
        assert.deepEqual(allowed, [true, true, false]);
        await db.exec("update security.request_budgets set resets_at=now()-interval '1 second'");
        assert.equal(
          (
            await query("select public.consume_security_rate_limit('test',$1,2,60) as r", [
              'a'.repeat(64),
            ])
          )[0].r.allowed,
          true
        );
      }
    );

    async function issue(hash) {
      await claims('service_role');
      const [{ id }] = await query(
        "insert into public.tenant_invitation_tokens(tenant_id,email,role_code,token_hash,expires_at) values($1,'synthetic@example.test','patient',$2,now()+interval '1 day') returning id",
        [tenant, hash]
      );
      await query('select public.bind_tenant_invitation($1,$2,$3)', [id, membership, user]);
      return id;
    }
    const hash = 'b'.repeat(64);
    const invitation = await issue(hash);
    await t.test(
      'wrong identity, wrong tenant and unconfirmed email cannot consume a token',
      async () => {
        await assert.rejects(
          query('select public.accept_tenant_invitation($1,$2,$3)', [hash, tenant, otherUser]),
          /invalid_invitation/
        );
        await assert.rejects(
          query('select public.accept_tenant_invitation($1,$2,$3)', [hash, otherTenant, user]),
          /invalid_invitation/
        );
        await query('update auth.users set email_confirmed_at=null where id=$1', [user]);
        await assert.rejects(
          query('select public.accept_tenant_invitation($1,$2,$3)', [hash, tenant, user]),
          /confirmed_email_required/
        );
        await query('update auth.users set email_confirmed_at=now() where id=$1', [user]);
        assert.equal(
          (
            await query('select used_at from public.tenant_invitation_tokens where id=$1', [
              invitation,
            ])
          )[0].used_at,
          null
        );
      }
    );
    await t.test('audit failure rolls back membership, profile and token together', async () => {
      await db.exec(
        "create function public.synthetic_audit_failure() returns trigger language plpgsql as $$ begin raise exception 'synthetic_audit_failure'; end $$; create trigger synthetic_audit_failure before insert on public.audit_logs for each row execute function public.synthetic_audit_failure();"
      );
      await assert.rejects(
        query('select public.accept_tenant_invitation($1,$2,$3)', [hash, tenant, user]),
        /synthetic_audit_failure/
      );
      assert.equal(
        (await query('select status from public.tenant_memberships where id=$1', [membership]))[0]
          .status,
        'invited'
      );
      assert.equal(
        (
          await query('select used_at from public.tenant_invitation_tokens where id=$1', [
            invitation,
          ])
        )[0].used_at,
        null
      );
      await db.exec('drop trigger synthetic_audit_failure on public.audit_logs');
    });
    await t.test('accept once activates the portal; token replay fails', async () => {
      await query('select public.accept_tenant_invitation($1,$2,$3)', [hash, tenant, user]);
      assert.equal((await query('select status from public.patient_accounts'))[0].status, 'active');
      assert.equal(
        (await query('select status from public.patient_portal_access_invites'))[0].status,
        'active'
      );
      await assert.rejects(
        query('select public.accept_tenant_invitation($1,$2,$3)', [hash, tenant, user]),
        /invalid_invitation/
      );
    });
    await t.test('role changes and resends invalidate previously issued invitations', async () => {
      await issue('c'.repeat(64));
      await query("update public.tenant_memberships set role_code='guardian' where id=$1", [
        membership,
      ]);
      await assert.rejects(
        query('select public.accept_tenant_invitation($1,$2,$3)', ['c'.repeat(64), tenant, user]),
        /invalid_invitation/
      );
      await query("update public.tenant_memberships set role_code='patient' where id=$1", [
        membership,
      ]);
      await issue('d'.repeat(64));
      await issue('e'.repeat(64));
      await assert.rejects(
        query('select public.accept_tenant_invitation($1,$2,$3)', ['d'.repeat(64), tenant, user]),
        /invalid_invitation/
      );
    });
    await t.test(
      'restrictive policies stop console uploads even with legacy permissive policies',
      async () => {
        await claims('authenticated');
        await db.exec('set role authenticated');
        await assert.rejects(
          query("insert into storage.objects(bucket_id,name) values('user-profile-avatars',$1)", [
            `${tenant}/${user}/direct.png`,
          ]),
          /row-level security/
        );
        await assert.rejects(
          query("insert into storage.objects(bucket_id,name) values('upload-quarantine','leak')"),
          /row-level security/
        );
        await db.exec('reset role');
      }
    );
    await t.test(
      'upload reservations reject cross-tenant paths, duplicates and daily over-quota',
      async () => {
        await claims('authenticated');
        const reserve = (path, size = 5_242_880) =>
          query('select public.reserve_secure_upload($1,$2,$3,$4,$5)', [
            'user-profile-avatars',
            path,
            size,
            'image/png',
            'f'.repeat(64),
          ]);
        await assert.rejects(reserve(`${otherTenant}/${user}/cross.png`), /upload_forbidden/);
        await assert.rejects(reserve(`${tenant}/${user}/../escape.png`), /upload_forbidden/);
        await reserve(`${tenant}/${user}/first.png`);
        await assert.rejects(reserve(`${tenant}/${user}/first.png`), /duplicate key/);
        for (let i = 1; i < 20; i++) await reserve(`${tenant}/${user}/file-${i}.png`);
        await assert.rejects(reserve(`${tenant}/${user}/over.png`, 1), /upload_daily_quota/);
      }
    );
  } finally {
    await db.close();
  }
});
