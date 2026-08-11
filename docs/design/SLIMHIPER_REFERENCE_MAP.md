# SlimHiper visual-reference map

The files in `design/visual-reference/` are design inputs. Except for the
isolated app-icon artwork identified below, they are reference-only and must
never be rendered in the product as images, backgrounds, or screenshot-like
UI. Reconstruct their intent with semantic React components, Tailwind/CSS,
icons, and real application data.

| Source                    | Role                                      | Render policy                                                                                       |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `01-brand-board.png`      | Global visual identity source of truth    | Reference only                                                                                      |
| `02-logo-system.png`      | Logo system and approved treatments       | Reference only; do not crop logo variants from this board                                           |
| `03-app-icon.png`         | Source artwork for the primary brand mark | Production source; the byte-identical canonical rendition is `public/assets/brand/logo-primary.png` |
| `04-ui-design-system.png` | Component geometry, tokens, and hierarchy | Reference only                                                                                      |
| `05-login.png`            | Authentication visual target              | Reference only                                                                                      |
| `06-app-shell.png`        | Navigation and shell visual target        | Reference only                                                                                      |
| `07-dashboard.png`        | Dashboard layout target                   | Reference only                                                                                      |
| `08-patient-360.png`      | Patient 360 signature-screen target       | Reference only                                                                                      |
| `09-platform-admin.png`   | Platform administration target            | Reference only                                                                                      |
| `10-brand-pattern.png`    | Brand-decoration direction                | Reference only; use canonical pattern assets instead                                                |

If an implementation conflicts with a reference, use this precedence:

1. Existing functional behavior.
2. Accessibility.
3. Semantic clinical meaning.
4. Approved SlimHiper design system.
5. Screenshot pixel similarity.

No reference image is authorization to change Supabase, authentication, RBAC,
clinical or financial behavior, navigation, or entitlement logic.
