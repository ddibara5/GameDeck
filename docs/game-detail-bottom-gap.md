# Game detail exit: stationary bottom gap

Base: `4c77f8281cb63da31e59eb3b869dec6037742b5d`.

Dave's September 21, 2026 screen recording shows a full-width background strip
remaining stationary while the game page moves right. After the page exits,
the strip briefly remains and the Home dock is raised; the dock drops to its
normal position when the overlay finishes closing. This contradicts the earlier
explanation that the strip was padding moving with the game page.

The shared lock set `body.style.overflow = 'hidden'`. Both html and body already
have `height: 100%` and `overflow-x: clip`. Because html's overflow is not visible
in both axes, body's overflow does not propagate to the viewport: it creates a
separate clipping/scrolling box. This is the mechanism targeted by the fix.
See [CSS Overflow, viewport propagation](https://www.w3.org/TR/css-overflow-3/#overflow-propagation).

The lock now applies overflow to `document.documentElement`, with the existing
reference counter and idempotent cleanup. Both original overflow axes and their
priorities are restored after the last overlay closes. Body geometry, game-page
padding and animation timing are unchanged. This also avoids the source page
jumping to scroll position zero, reproduced with the old lock in Chromium.

## Verification

- Vite production build passes.
- `node repro/scroll-lock.mjs` passes at 390px and 1024px: source scroll position,
  sticky header and dock remain stable, nested locks stay active, background
  wheel scrolling is blocked, dialog scrolling works, and cleanup restores
  scrolling and pre-existing inline styles.
- The same regression script fails on unchanged base: opening a lock changes
  `window.scrollY` from 350 to 0.
- Navigation/edge-back tests: 10/10 pass. Corrected a pre-existing test regex
  that expected `data.edgeBackDragging` instead of `dataset.edgeBackDragging`.
- Full suite: base 248/258 passes; change 249/258 passes. The remaining nine
  failures are also present on base (game sheet appearance/ranking entry,
  Home navigation, navigation config, news preview import, Rankings layout,
  theme families/migration and Xbox tab colors). No new suite failures.

The iPhone-specific stationary strip is evidenced by the supplied recording.
Local Chromium checks validate the scroll-lock correction and guard against
regressions; final visual confirmation still requires the installed iPhone app.
