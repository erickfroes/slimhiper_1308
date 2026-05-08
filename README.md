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

The script will create or upsert:
- 1 platform admin
- 1 demo tenant
- 1 clinic admin
- 1 physician
- 1 nutritionist
- 1 financial user
- 1 patient

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
3. **Creates `tenant_memberships`** for all non-platform users in the demo tenant.
4. **Assigns roles/permissions** by upserting tenant-scoped `roles`, `permissions`, and `role_permissions`.

### 5) Manual flow (alternative to script)

If you prefer manual setup in Supabase Dashboard:

1. Go to **Authentication → Users** and create each user with placeholder email + temporary password.
2. In SQL Editor, insert/update `public.profiles` where `profiles.id = auth.users.id`.
3. Insert a demo row in `public.tenants`.
4. Insert rows in `public.tenant_memberships` for clinic users and patient.
5. Insert role/permission rows in `public.roles`, `public.permissions`, then relation rows in `public.role_permissions`.

The bootstrap script automates this exact flow for local development/testing.
