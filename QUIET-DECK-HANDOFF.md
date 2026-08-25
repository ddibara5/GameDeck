# Quiet Deck UI handoff

## Status

Quiet Deck is complete and visually approved as of August 25, 2026. The signed-off
visual checkpoint is commit `5752412` (`Flatten Quiet Deck tab lists`). The
game-sheet performance checkpoint is commit `53a8dc1` (`Optimize game sheet
backdrop loading`) on `main`. Production is deployed at
<https://gamedeck-kappa.vercel.app>.

This was a presentation and app-shell refresh. It did not remove or redesign the
product's content, data model, recommendation logic, rankings logic, or n8n data
workflows. Future work should treat the decisions below as the current baseline,
not as an unfinished proposal.

## Product constraints

- Preserve the existing content and recognizable page structure.
- Do not remove Home tiles, the Home graph, Home modules, Library views, Activity,
  Discover, News, Rankings, Insights, Wishlist, Shuffle, shelves, game details,
  customization, or Settings merely to simplify the interface.
- GameDeck is a phone-first installed PWA. Keep safe areas, iOS standalone-mode
  behavior, scroll locking, overlay stacking, and the existing Apple scroll-edge
  workarounds intact unless a device test proves a replacement is better.
- Preserve lazy-loaded tab chunks, idle warming, service-worker behavior,
  reduced-motion support, selectable themes/backgrounds, and feature-specific
  components.

## Approved visual system

Quiet Deck should feel clean, continuous, modern, calm, and content-led while
retaining GameDeck's dark canvas, cream text, walnut, brass/accent, and glass
identity.

Use three levels of hierarchy:

1. **Canvas:** one continuous background for homogeneous content such as Library
   rows, Activity sessions, Discover feeds/results, News stories, Rankings rows,
   and simple lists.
2. **Grouped surface:** a subtle tile only when a boundary adds meaning. Home
   dashboard modules and graph, Insights summaries/charts, metric groups,
   comparison/seed explanations, controls, and contextual information remain
   grouped.
3. **Elevated layer:** stronger glass/elevation is reserved for the bottom bar,
   drawer, sheets, modals, and other content above the app.

Consistency comes from the shared tokens in `web/src/index.css`, not from wrapping
every feature in a card. Prefer approximately 16px mobile gutters, the shared
4/8/12/16/24/32 spacing rhythm, restrained hairlines, small radius/elevation
ladders, sparse accent, and 44-48px primary touch targets.

## Navigation behavior

The new-install and Reset default bottom bar is:

1. Home
2. Library
3. Discover
4. Activity

The drawer remains comprehensive. News and Rankings remain eligible for the bar
through Navigation customization, while Insights is intentionally drawer-only.
Wishlist, Shuffle, Backlog, Playing, Finished, Settings, and customization remain
available through the drawer and existing secondary navigation.

Navigation persistence is deliberate:

- Keep the `gamedeck_nav_v2` storage key.
- Do not bump the key merely to introduce another default; that would overwrite
  existing users' choices.
- A profile with saved v2 navigation keeps its saved order, enabled tabs, labels,
  visibility, and collapsed drawer groups.
- Only a profile without saved navigation, or one using Reset, receives the Quiet
  Deck default.
- The leftmost visible bar destination remains the app's landing tab.

The source of truth is `web/src/lib/navConfig.js`.

## Shell behavior

- The status/safe-area region, app header, and page should read as one continuous
  background at rest.
- The header carries the current title. It is blended at the top, then becomes
  frosted with a subtle separator and a smaller title after content scrolls
  underneath.
- The menu button is always available; no critical action depends only on an edge
  swipe.
- The bottom bar is the clearest persistent elevated surface. Its overall height
  was restored to the preferred pre-refresh scale: 62px minimum with 60px tab
  targets, plus the home-indicator safe-area offset.
- The active bottom-bar lens fills the complete tab slot and is clipped by the
  bar at the outer edges. Do not shrink it into an inset capsule. This full-slot
  treatment is the approved liquid-glass direction.
- Respect `prefers-reduced-motion`; do not add a heavy animation dependency.

## Page-formatting decisions

The Phase 4 sign-off explicitly approved these homogeneous lists sitting directly
on the canvas with restrained between-row dividers:

- Library lists and shared shelf/list views
- Activity day groups
- Discover Browse results and the For You feed
- News weekly story lists
- Rankings rows

The following intentionally remain surfaced because their boundaries communicate
meaning:

- Home tiles, Home graph, and Home modules
- Insights metric groups, summaries, and charts
- Search, segmented, sort, and filter controls
- Rankings comparison, seed, and explanatory groups
- Drawer, sheets, overlays, modals, and contextual detail groups

Wishlist list rows remain canvas-colored rather than transparent because the row
face must mask the destructive red swipe action until the user reveals it. This
is an interaction requirement, not leftover decorative tiling.

## Global background direction

Full-app game artwork was retired after the canvas-level lists were approved.
Even with blur, adaptive veils, and measured contrast, a large game image still
competed with cover thumbnails and titles. Contextual artwork remains in game
sheets, where it supports the selected game rather than the entire library.

Settings now offers four synchronous, palette-aware backgrounds:

- **Flat** — the solid theme canvas.
- **Soft wash** — one restrained asymmetric color bloom.
- **Ambient glow** — two broad muted color pools near opposite corners.
- **Horizon** — a gentle top-to-bottom atmospheric shift.

All three gradients follow the selected Walnut, Slate, Sage, Plum, or Graphite
palette, include subtle local grain to prevent OLED banding, and require no image
request, decode, cache, or contrast override. Existing Now Playing, Most Played,
Pinned Game, and Shuffle background preferences migrate to Soft wash; retired
pin, intensity, paint, and artwork-accent settings are cleared.

## Implementation history

- `8ab4ce6` — implemented the Phase 1 shell foundation.
- `9c70354` — restored and deployed the Phase 1 checkpoint.
- `c7804f4` — applied Phase 2 page continuity.
- `8489375` — refined Phase 3 overlays, navigation, and the full-slot bottom-bar
  lens; this is the immediate rollback point before the final list flattening.
- `5752412` — flattened the approved lists and completed Phase 4.
- `b82a548` — cached tab data and warmed interactive views to reduce repeat tab
  and popup loading without changing the approved visual system.
- `53a8dc1` — optimized game-sheet backdrop loading and established the current
  performance checkpoint before the global-background refresh.
- The global-background refresh retired full-app game art in favor of four
  synchronous, palette-aware treatments. Use the next `main` commit after this
  checkpoint as its deployment baseline.

## Post-approval performance hardening

Two performance passes followed the visual sign-off. They deliberately preserved
the approved Quiet Deck layout and styling:

- Tab data is cached, lazy tab chunks are retained, and likely destinations are
  warmed during idle time so repeat navigation does not wait on avoidable work.
- Game artwork is preloaded from hover, focus, pointer-down, and other warm-intent
  entry points across Library, Discover, Wishlist, Home, Activity, Insights,
  rail lists, and Shuffle.
- Per-game metadata, image sampling, and decoded tint results use in-memory caches
  above the persistent IndexedDB cache, allowing warmed and reopened sheets to
  seed synchronously.
- The old forced 240ms hero-image fade was removed. Artwork may join only during
  the sheet's 240ms opening animation. If it is not ready by then, that opening
  remains tint-only; a late image is cached for the next open instead of appearing
  after the sheet has settled.

This timing behavior is intentional. Do not reintroduce a delayed backdrop pop-in
to make a cold image visible on the first open. The tint-only fallback is the
preferred experience when artwork cannot be ready within the opening animation.

The game-sheet performance baseline completed with 144 transformed modules and
all 13 automated Node tests passing. Its Vercel deployment was READY, production
returned HTTP 200, and the deployed tree matched the reviewed source exactly.
Dave reviewed that update, including the game-sheet behavior, and approved it.

The subsequent global-background refresh has a successful local production build
with 143 transformed modules and all 16 automated Node tests passing. Installed-
app visual QA of the new gradient choices is the remaining authenticated check.

The connected cloud browser could verify the public production shell only up to
the expected owner sign-in screen. Treat Dave's installed-iPhone approval as the
authoritative authenticated visual check.

## Guidance for the next agent

1. Read this file and `GAMEDECK-CLOUD-HANDOFF.md` before changing UI or deployment
   behavior.
2. Inspect the latest `main`; do not assume the checkpoint hashes above are still
   the repository head.
3. Preserve the canvas-versus-surface decisions unless Dave explicitly requests a
   new design change.
4. Preserve the performance contract: lazy tab chunks, idle warming, persistent
   and in-memory caches, warm-intent artwork preloading, and tint-only game-sheet
   fallback when cold artwork misses the opening animation.
5. For a small reviewed increment, use the documented n8n GitHub bridge to make a
   focused commit to `main`, then verify the exact tree and Vercel production
   deployment. Use a branch for broader or higher-risk work.
6. Do not modify GameDeck data, ingestion, AI, news, or sync workflows for a
   frontend-only change unless inspection shows that the change truly requires it.
7. After any shell or layout change, recheck installed-iPhone safe areas, all four
   palette-aware backgrounds in light and dark mode, reduced motion, navigation
   persistence, scroll locking, overlays, and service-worker update behavior.
8. After popup or cache changes, compare cold and repeat game-sheet opens, verify
   both pointer and mobile-tap paths, and recheck reduced-motion, offline, and
   service-worker behavior.
