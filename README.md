# Next.js

A modern Next.js 15 application built with TypeScript and Tailwind CSS.

## 🚀 Features

- **Next.js 15** - Latest version with improved performance and features
- **React 19** - Latest React version with enhanced capabilities
- **Tailwind CSS** - Utility-first CSS framework for rapid UI development

## 🛠️ Installation

1. Install dependencies:

```bash
npm install
# or
yarn install
```

2. Start the development server:

```bash
npm run dev
# or
yarn dev
```

3. Open [http://localhost:4028](http://localhost:4028) with your browser to see the result.

## 📁 Project Structure

```
nextjs/
├── public/             # Static assets
├── src/
│   ├── app/            # App router components
│   │   ├── layout.tsx  # Root layout component
│   │   └── page.tsx    # Main page component
│   ├── components/     # Reusable UI components
│   ├── styles/         # Global styles and Tailwind configuration
├── next.config.mjs     # Next.js configuration
├── package.json        # Project dependencies and scripts
├── postcss.config.js   # PostCSS configuration
└── tailwind.config.js  # Tailwind CSS configuration

```

## 🧩 Page Editing

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

## 🎨 Styling

This project uses Tailwind CSS for styling with the following features:

- Utility-first approach for rapid development
- Custom theme configuration
- Responsive design utilities
- PostCSS and Autoprefixer integration

## 📦 Available Scripts

- `npm run dev` - Start development server on port 4028
- `npm run build` - Build the application for production
- `npm run start` - Start the development server
- `npm run serve` - Start the production server
- `npm run lint` - Run ESLint to check code quality
- `npm run lint:fix` - Fix ESLint issues automatically
- `npm run format` - Format code with Prettier

## 📱 Deployment

Build the application for production:

```bash
npm run build
```

## 📚 Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial

You can check out the [Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 🙏 Acknowledgments

- Built with [Rocket.new](https://rocket.new)
- Powered by Next.js and React
- Styled with Tailwind CSS

Built with ❤️ on Rocket.new

## 🔐 Supabase Core Auth Dev Bootstrap

This project includes a development bootstrap script for **core auth + multi-tenant role testing** only (no UI changes, no clinical table creation).

### 1) Environment variables

Create a local env file (for example `.env.local`) and set:

```bash
# Public web client vars (safe for frontend)
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
# Preferred public key variable
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
# Backward compatibility fallback
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Service-role vars (bootstrap script only; NEVER expose to frontend)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_BOOTSTRAP_PASSWORD=<temporary-dev-password>

# Optional bootstrap overrides
SUPABASE_BOOTSTRAP_TENANT_SLUG=demo-clinic
SUPABASE_BOOTSTRAP_TENANT_NAME=Demo Clinic
```

> Use service-role credentials only in trusted server-side scripts such as `scripts/supabase/bootstrap-core-auth.mjs`. Never expose service-role keys in browser code or any `NEXT_PUBLIC_*` variable.

### 2) Run migrations first

```bash
supabase db push
```

### 3) Run the bootstrap script

```bash
node scripts/supabase/bootstrap-core-auth.mjs
```

### 3b) Run the Paciente 360 demo data bootstrap

```bash
node scripts/supabase/bootstrap-patient360-demo.mjs
```

This script seeds development-safe Paciente 360 clinical data for tenant `demo-clinic`, including Juliana Pereira demo records across patients, appointments, encounters, SOAP notes, measurements, bioimpedance, labs, prescriptions placeholder, alerts, tasks, and timeline events.

### 3c) Run the document templates demo bootstrap

```bash
node scripts/supabase/bootstrap-document-templates-demo.mjs
```

This script seeds six development-safe `document_templates` rows for tenant `demo-clinic` using only placeholder variables (`{{patient_name}}`, `{{clinic_name}}`, `{{program_name}}`, `{{date}}`, `{{professional_name}}`). It does not call D4Sign and does not upload files.

The script will create or upsert:
- 1 platform admin profile (`platform_role = platform_admin`)
- 1 demo tenant
- 1 clinic admin tenant membership (`clinic_admin`)
- 1 physician tenant membership (`physician`)
- 1 nutritionist tenant membership (`nutritionist`)
- 1 financial user tenant membership (`financial_user`)
- 1 patient auth user + profile only (no tenant membership yet)

Using placeholder emails:
- `platform.admin@example.com`
- `clinic.admin@example.com`
- `physician.demo@example.com`
- `nutritionist.demo@example.com`
- `finance.demo@example.com`
- `patient.demo@example.com`

### 4) What the script does (mapping to Supabase core auth model)

1. **Creates users in Supabase Auth** (`auth.users`) using the Admin API.
2. **Links `auth.users` to `public.profiles`** by upserting profile rows with matching `id`.
3. **Creates `tenant_memberships`** only for clinic roles supported by the current migration (`clinic_admin`, `physician`, `nutritionist`, `financial_user`), with `tenant_memberships.role` mirroring `role_code`.
4. **Skips patient tenant membership** for now, seeding only auth + profile for a future patient-profile linking flow.
5. **Assigns roles/permissions** by upserting tenant-scoped `roles`, `permissions`, and `role_permissions` for clinic roles above.

### 5) Manual flow (alternative to script)

If you prefer manual setup in Supabase Dashboard:

1. Go to **Authentication → Users** and create each user with placeholder email + temporary password.
2. In SQL Editor, insert/update `public.profiles` where `profiles.id = auth.users.id`.
3. Insert a demo row in `public.tenants`.
4. Insert rows in `public.tenant_memberships` for clinic users only (using valid constrained role values).
5. Seed patient as auth user + `public.profiles` row only until a valid patient membership schema exists.
6. Insert role/permission rows in `public.roles`, `public.permissions`, then relation rows in `public.role_permissions` for clinic roles.

The bootstrap script automates this exact flow for local development/testing.

### 6) Manual RBAC smoke tests (after bootstrap)

A lightweight manual SQL test checklist is available at:

- `supabase/tests/core_rbac_smoke_tests.sql`

How to run:

1. Run migrations and bootstrap first:
   - `supabase db push`
   - `node scripts/supabase/bootstrap-core-auth.mjs`
2. Open **Supabase Dashboard → SQL Editor**.
3. Open/copy `supabase/tests/core_rbac_smoke_tests.sql`.
4. Replace all placeholder IDs (`USER_*_UUID`, `TENANT_*_UUID`) with values from your own seeded environment.
5. Run each numbered test block and verify the expected result comments.

Notes:
- This file is intentionally **manual/commented** and does not depend on hard-coded real UUIDs.
- It focuses only on core RBAC behavior and metadata access checks.
- It does **not** create UI changes or new clinical tables.

## 🧪 Paciente 360 contract checks

You can validate Paciente 360 Edge Function response contracts and authorization behavior using:

- `supabase/tests/patient360_contract_checks.md` (manual checklist)
- `scripts/supabase/test-patient360-contract.mjs` (scripted smoke checks)

### What is validated

1. `patient-360-summary` returns `{ ok:true, data, meta }`
2. `data.profile.name` exists
3. `data.profile.id` exists
4. `data.activePackage.status` exists
5. `data.clinicalStatus.currentWeightKg` or safe fallback exists
6. `data.financial.status` exists
7. `data.upcomingAppointments` is an array
8. `data.recentTimeline` is an array
9. `patient-timeline` returns `{ ok:true, data:{events,page,page_size,total}, meta }`
10. `category` filter does not error
11. user without `patients.read` receives 403
12. tenant A user cannot fetch tenant B patient

### Environment variables

Required:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
TOKEN_WITH_PATIENTS_READ=<jwt-of-tenant-a-user-with-patients.read>
PATIENT_ID_TENANT_A=<tenant-a-patient-id>
```

Optional (for checks 11 and 12):

```bash
TOKEN_WITHOUT_PATIENTS_READ=<jwt-of-user-without-patients.read>
TOKEN_TENANT_B=<jwt-of-tenant-b-user>
PATIENT_ID_TENANT_B=<tenant-b-patient-id>
```

### Setup and run (end-to-end)

1. Run migrations:

```bash
supabase db push
```

2. Bootstrap core auth and tenant RBAC seed:

```bash
node scripts/supabase/bootstrap-core-auth.mjs
```

3. Bootstrap Paciente 360 demo records:

```bash
node scripts/supabase/bootstrap-patient360-demo.mjs
```

4. Bootstrap document templates demo records:

```bash
node scripts/supabase/bootstrap-document-templates-demo.mjs
```

5. Obtain a test access token (`TOKEN_WITH_PATIENTS_READ`) for a seeded user.

Example using Supabase Auth password sign-in API:

```bash
export SUPABASE_URL=https://<project-ref>.supabase.co
export SUPABASE_PUBLISHABLE_KEY=<your-publishable-or-anon-key>

curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password"   -H "apikey: $SUPABASE_PUBLISHABLE_KEY"   -H "Content-Type: application/json"   -d '{"email":"clinic.admin@example.com","password":"<bootstrap-password>"}'
```

From the JSON response, copy `access_token`.

6. Run the Paciente 360 contract script:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co TOKEN_WITH_PATIENTS_READ=<access_token> PATIENT_ID_TENANT_A=<tenant-a-patient-id> node scripts/supabase/test-patient360-contract.mjs
```

If optional vars are not provided, checks 14 and/or 15 are reported as skipped.

## Paciente 360 baseline checkpoint

Before continuing implementation work for D4Sign/Storage integration, ensure this repository baseline is green by running:

- `npm run type-check`
- `npm run build`
- `supabase db push`
- `node scripts/supabase/bootstrap-core-auth.mjs`
- `node scripts/supabase/bootstrap-patient360-demo.mjs`
- `node scripts/supabase/bootstrap-document-templates-demo.mjs`
- `node scripts/supabase/test-patient360-contract.mjs`

Recommended checkpoint label:

- `baseline-patient360-contract-green`
