---
name: frontend-testing-debugging
description: "Use when testing, debugging, or making targeted improvements to rendered frontend apps: UI regressions, interaction bugs, console errors, responsive layout, and visual QA. For GameDeck, use available browser tooling first; otherwise use the repository's existing test/build tooling without adding dependencies unless necessary."
metadata:
  author: openai
  source: https://github.com/openai/plugins/tree/main/plugins/build-web-apps/skills/frontend-testing-debugging
  gamedeck-adaptation: true
---

# Frontend Testing Debugging

Adapted from OpenAI's official `frontend-testing-debugging` skill for GameDeck's React 18 + Vite environment.

## Default workflow

For any non-trivial rendered frontend change, bug investigation, or UI polish:

1. Identify the target user flow.
2. Inspect the relevant source and existing tests/scripts.
3. Make the smallest useful edit.
4. Run the repository's build/tests.
5. Validate rendered behavior with available browser tooling when possible.
6. Check the target interaction, console/runtime errors, and responsive/mobile behavior when relevant.
7. Report what was verified and any remaining risk.

## Required checks for UI work

- The intended page/route renders meaningful content.
- No Vite/framework error overlay is present.
- No relevant console errors are introduced.
- At least one target interaction is exercised when interaction behavior changed.
- Visual changes are checked at the primary GameDeck phone viewport; check a wider viewport when the change may affect responsive layout.
- Look for clipping, overlap, unreadable text, wrapping, layout shift, missing assets, z-index issues, scroll traps, stale loading, and broken states.
- A passing build alone is not sufficient evidence for a rendered UI change when browser validation is available.

## GameDeck compatibility rules

- Do not introduce Playwright, Browser plugins, or other dependencies solely because the upstream skill mentions them. Use what the current execution environment already provides unless the task genuinely requires a new dependency.
- Preserve GameDeck's established project guidance and UI conventions; this skill supplements project files rather than overriding them.
- Prefer phone-first validation because GameDeck is primarily used as a mobile/PWA experience.
- After meaningful React edits, also apply the project-local `vercel-react-best-practices` skill.
- For UI/UX audits or visual consistency reviews, also apply `web-design-guidelines`.

## Reporting

Keep verification concise and concrete:

- user-visible change
- build/test result
- rendered/interaction checks performed
- any important remaining risk or untested state

Do not create committed QA reports, screenshots, traces, or temporary test scripts unless explicitly requested.
