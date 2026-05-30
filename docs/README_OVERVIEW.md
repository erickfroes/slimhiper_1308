# Project Overview

SlimHiper Clinic OS is a Next.js 15 application built with TypeScript, React 19,
Tailwind CSS 3, and Supabase. It provides clinic operations screens, Patient 360
clinical context, document-template workflows, D4Sign document signing, billing
foundation through Asaas, and development bootstraps for Supabase data.

## Features

- Next.js 15 App Router.
- React 19.
- Tailwind CSS utility-first styling.
- Supabase Auth/RBAC and multi-tenant role testing.
- Auth/RBAC session contract documentation.
- Clinical workspace routes under `src/app/clinic`.
- Platform admin routes under `src/app/admin`.
- Patient 360 screens and Edge Function contract checks.
- Document templates and D4Sign integration runbooks.
- Billing and Asaas integration runbooks.
- Environment hygiene guidance in `docs/security/ENV_HYGIENE.md`.

## Installation

Install dependencies:

```bash
npm install
```

The original scaffold also mentioned Yarn:

```bash
yarn install
```

This repo is currently operated with npm. Prefer npm unless a task explicitly
changes the package-manager policy.

Start the development server:

```bash
npm run dev
```

The original scaffold also mentioned:

```bash
yarn dev
```

Open [http://localhost:4028](http://localhost:4028) in the browser.

## Project Structure

```text
slimhiper_1308/
├── public/                         # Static assets
├── src/
│   ├── app/                        # Next.js App Router routes/layouts
│   ├── components/                 # Reusable UI components
│   ├── data/                       # Mock and builder data
│   ├── domain/                     # Shared domain types
│   ├── lib/                        # Auth/Supabase helpers
│   ├── services/                   # Frontend service facades
│   └── styles/                     # Global styles and Tailwind utilities
├── scripts/supabase/               # Bootstrap and contract-check scripts
├── supabase/
│   ├── functions/                  # Edge Functions
│   ├── migrations/                 # Database migrations
│   └── tests/                      # Manual SQL/checklist test assets
├── next.config.mjs                 # Next.js configuration
├── package.json                    # Dependencies and scripts
├── postcss.config.js               # PostCSS configuration
└── tailwind.config.js              # Tailwind CSS configuration
```

## Page Editing

The original scaffold suggested starting with `src/app/page.tsx`. In this app,
that route redirects to `/auth/login`; most product work happens in:

- `src/app/auth`
- `src/app/admin`
- `src/app/clinic`
- `src/app/paciente-360`
- `src/components`
- `src/services`

## Styling

This project uses Tailwind CSS with:

- Utility-first styling.
- Custom theme configuration in `tailwind.config.js`.
- Global utilities and component classes in `src/styles/tailwind.css`.
- Responsive design utilities.
- PostCSS and Autoprefixer integration.

## Available Scripts

- `npm run dev`: start development server on port `4028`.
- `npm run build`: build the application for production.
- `npm run start`: currently starts the development server.
- `npm run serve`: start the production server after a build.
- `npm run lint`: run ESLint CLI over `src/**/*.{ts,tsx}`.
- `npm run lint:fix`: run ESLint CLI with `--fix` over `src/**/*.{ts,tsx}`.
- `npm run format`: format `src/**/*.{ts,tsx,css,md,json}` with Prettier.
- `npm run type-check`: run `tsc --noEmit`.
- `npm run supabase:bootstrap:core-auth`: run the core auth bootstrap script.

## Security And Env Hygiene

Use `docs/security/ENV_HYGIENE.md` as the source of truth for `.env.local`,
`.env.example`, public `NEXT_PUBLIC_*` variables, server-only secrets, and
`package-lock.json` versioning.

Use `docs/auth/AUTH_RBAC_SESSION_CONTRACT.md` as the source of truth for app
session shape, Auth/RBAC tables, guards, and known contract gaps.

## Deployment

Build the application for production:

```bash
npm run build
```

Run production server after building:

```bash
npm run serve
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
- [Next.js GitHub repository](https://github.com/vercel/next.js)

## Acknowledgments

- Built with Rocket.new.
- Powered by Next.js and React.
- Styled with Tailwind CSS.
