# FreeBook Design System — Paper UI

Paper UI is a mandatory product-wide design rule. Every current and future screen must use the same paper-inspired visual language: catalogue, account and authentication dialogs, personal library, reader, empty/loading/error states, and any future admin or upload screens.

## Visual direction
- Warm, calm, bookish, editorial; avoid glassmorphism, neon, glossy gradients, and unrelated component styles.
- Persian-first RTL layout, readable typography, clear hierarchy, generous whitespace, and accessible contrast.
- Surfaces should feel like layered paper: warm off-white panels on a softly textured parchment background, fine borders, restrained shadows, and softly rounded corners.
- Use consistent paper-like buttons, inputs, cards, dialogs, chips, notices, and navigation across every page and state.
- Dark mode must retain the same paper/material identity with dark parchment surfaces; it must not become a separate visual system.

## Existing palette tokens
The current stylesheet is the source of truth until a deliberate design-system revision:
- Background: `#f1e9dc`
- Paper: `#fffaf1`
- Soft paper: `#f8f0e3`
- Ink: `#302a24`
- Muted text: `#827666`
- Border: `#e6dac7`
- Accent: `#81583d`
- Accent hover: `#68442e`
- Supporting green: `#65765d`

## Implementation requirements
1. Define shared CSS variables/tokens; do not introduce one-off palettes for individual screens.
2. Every new component must reuse the shared paper surfaces, borders, typography, radii, shadows, and interaction states.
3. Keep responsive behavior and RTL support consistent across desktop and mobile.
4. Provide visible focus states, keyboard operation, semantic controls, and sufficient contrast.
5. Review light and dark modes for every new screen and state before acceptance.

## Acceptance checklist
- [ ] All pages and dialogs use Paper UI tokens.
- [ ] No isolated glass/neon/gradient visual language is introduced.
- [ ] Loading, empty, error, success, and disabled states also follow Paper UI.
- [ ] Dark mode preserves the paper-inspired identity.
- [ ] Desktop and mobile layouts remain RTL and accessible.
