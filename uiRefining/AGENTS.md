# UI standards for Codex

## Product design principles
- Prefer clarity over decoration.
- Use consistent spacing, typography and component patterns.
- Do not introduce one-off visual styles unless necessary.
- Reuse existing components before creating new ones.
- Keep screens calm, readable and responsive.

## Visual style
- Modern SaaS interface.
- Generous whitespace.
- Subtle borders and shadows.
- Avoid loud gradients, excessive colors and inconsistent border radii.
- Primary actions should be visually obvious; secondary actions should be quieter.

## Layout
- Check mobile, tablet and desktop.
- Avoid horizontal overflow.
- Use consistent spacing scale: 4, 8, 12, 16, 24, 32, 48.
- Align content to a clear grid.
- Avoid cramped cards and dense forms.

## Components
- Buttons need hover, active, disabled and focus-visible states.
- Inputs need labels, helper text and error states.
- Tables need empty, loading and error states when applicable.
- Modals need clear title, description, primary action and cancel action.
- Repeated UI should be extracted into reusable components.

## Accessibility
- Use semantic HTML where possible.
- Ensure visible keyboard focus.
- Do not rely on color alone to communicate state.
- Maintain reasonable contrast.
- Add aria labels only when semantic HTML is insufficient.

## Verification
Before finishing UI work, run:
- npm run lint
- npm run typecheck
- npm run build

Then review the diff and summarize:
- what changed visually;
- what files changed;
- what was tested;
- any remaining limitations.