# SlimHiper visual assets

## Source inventory

| Current source file       | Dimensions | Format | Transparency | Semantic purpose         | Classification    | Superseded by                       | Recommended canonical filename |
| ------------------------- | ---------: | ------ | ------------ | ------------------------ | ----------------- | ----------------------------------- | ------------------------------ |
| `01-brand-board.png`      |  1448×1086 | PNG    | No           | Identity board           | Reference only    | —                                   | Not renderable                 |
| `02-logo-system.png`      |  1536×1024 | PNG    | No           | Logo-system board        | Reference only    | Canonical logo files                | Not renderable                 |
| `03-app-icon.png`         |  1254×1254 | PNG    | No           | Isolated primary mark    | Production source | `logo-primary.png` (byte-identical) | `logo-primary.png`             |
| `04-ui-design-system.png` |  1536×1024 | PNG    | No           | UI design-system board   | Reference only    | —                                   | Not renderable                 |
| `05-login.png`            |  1487×1058 | PNG    | No           | Login mockup             | Reference only    | —                                   | Not renderable                 |
| `06-app-shell.png`        |  1487×1058 | PNG    | No           | Application-shell mockup | Reference only    | —                                   | Not renderable                 |
| `07-dashboard.png`        |  1536×1024 | PNG    | No           | Dashboard mockup         | Reference only    | —                                   | Not renderable                 |
| `08-patient-360.png`      |  1536×1024 | PNG    | No           | Patient 360 mockup       | Reference only    | —                                   | Not renderable                 |
| `09-platform-admin.png`   |  1536×1024 | PNG    | No           | Platform-admin mockup    | Reference only    | —                                   | Not renderable                 |
| `10-brand-pattern.png`    |  1448×1086 | PNG    | No           | Brand-pattern board      | Reference only    | Canonical trajectory patterns       | Not renderable                 |

All sources are preserved in `design/visual-reference/`. No source artwork was
regenerated, altered, or resampled during this phase.

## Canonical production assets

| Semantic ID           | Source file                               | Canonical path                                         | Purpose                        | Status     | Background requirement          | Recommended usage                      | Forbidden usage                                 |
| --------------------- | ----------------------------------------- | ------------------------------------------------------ | ------------------------------ | ---------- | ------------------------------- | -------------------------------------- | ----------------------------------------------- |
| `brand.logo.primary`  | `03-app-icon.png` (byte-identical source) | `public/assets/brand/logo-primary.png`                 | Primary teal mark              | Production | Light surfaces                  | Default product mark via `AppLogo`     | Decorative screenshot or dark-surface treatment |
| `brand.logo.symbol`   | Pre-existing approved repository asset    | `public/assets/brand/logo-symbol.png`                  | Compact dark mark              | Production | Light surfaces                  | Compact/monochrome identity contexts   | UI reference substitute                         |
| `brand.logo.reversed` | Pre-existing approved repository asset    | `public/assets/brand/logo-reversed.png`                | Reversed brand mark            | Production | Dark or teal surfaces           | `AppLogo` dark-surface variant         | Light surfaces with insufficient contrast       |
| `brand.app-icon`      | Pre-existing approved repository asset    | `public/assets/brand/app-icon.png`                     | Browser/app icon               | Production | Any; contains its own dark tile | Metadata and app-install contexts      | Full logo/wordmark replacement in page content  |
| `brand.favicon`       | Pre-existing approved repository asset    | `public/assets/brand/favicon.png`                      | High-resolution favicon source | Production | Light surfaces                  | Future multi-resolution favicon export | UI screenshot or generic decoration             |
| `brand.pattern.light` | Pre-existing approved repository asset    | `public/assets/patterns/progress-trajectory-light.png` | Light trajectory pattern       | Production | Light surfaces                  | Subtle, decorative product background  | Carrier for text or UI screenshot               |
| `brand.pattern.dark`  | Pre-existing local repository asset       | `public/assets/patterns/progress-trajectory-dark.png`  | Dark trajectory pattern        | Production | Dark surfaces                   | Subtle, decorative product background  | Carrier for text or UI screenshot               |

`progress-trajectory-light.png` and `progress-trajectory-dark.png` retain their
established descriptive filenames to avoid duplicate binaries. Their semantic
canonical IDs are `brand.pattern.light` and `brand.pattern.dark`.

## Compatibility and policy

- `public/assets/images/app_logo.png` remains in place for three marketing
  components that still explicitly reference it. It is a legacy asset and is
  not used by `AppLogo` anymore.
- `public/assets/images/no_image.png` remains the `AppImage` fallback.
- `public/favicon.ico` remains untouched for direct legacy `/favicon.ico`
  requests. Next metadata now selects the approved PNG app icon.
- Never add `design/visual-reference/*` to the asset registry or use those
  files as a rendered screen/background.
