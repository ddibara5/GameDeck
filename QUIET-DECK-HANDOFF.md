# Quiet Deck UI handoff

## Status

Quiet Deck is complete and visually approved as of August 25, 2026. The signed-off
production checkpoint is commit `5752412` (`Flatten Quiet Deck tab lists`) on
`main`, deployed at <https://gamedeck-kappa.vercel.app>.

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

## Implementation history

- `8ab4ce6` — implemented the Phase 1 shell foundation.
- `9c70354` — restored and deployed the Phase 1 checkpoint.
- `c7804f4` — applied Phase 2 page continuity.
- `8489375` — refined Phase 3 overlays, navigation, and the full-slot bottom-bar
  lens; this is the immediate rollback point before the final list flattening.
- `5752412` — flattened the approved lists and completed Phase 4.

The last build ran successfully with 142 transformed modules. All 10 automated
Node tests passed. The final Vercel deployment was READY and production served
the updated CSS. Dave then completed visual QA in the installed app and approved
the result without further changes.

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
4. For a small reviewed increment, use the documented n8n GitHub bridge to make a
   focused commit to `main`, then verify the exact tree and Vercel production
   deployment. Use a branch for broader or higher-risk work.
5. Do not modify GameDeck data, ingestion, AI, news, or sync workflows for a
   frontend-only change unless inspection shows that the change truly requires it.
6. After any shell or layout change, recheck installed-iPhone safe areas, custom
   backgrounds, reduced motion, navigation persistence, scroll locking, overlays,
   and service-worker update behavior.
