# Quiet Deck UI handoff

## Status

Quiet Deck is complete and visually approved as of August 25, 2026. The signed-off
visual checkpoint is commit `5752412` (`Flatten Quiet Deck tab lists`). The
global-background checkpoint is commit `1595f6d` (`Replace game-art backgrounds
with muted gradients`) on `main`. Production is deployed at
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

The drawer is a compact place map, 80vw with a 320px ceiling. **Your games** holds
Home, Library, Activity, Insights, and Rankings; **Explore** holds Discover, News,
and Wishlist. Insights remains drawer-only, while News and Rankings remain
eligible for the bar through Navigation customization. Shuffle and Settings are
pinned actions below the map. Backlog, Playing, and Finished remain available as
Library status filters rather than duplicate destinations. Drawer customization
lives in Settings beside the bottom-bar editor.

Navigation persistence is deliberate:

- Keep the `gamedeck_nav_v2` storage key.
- Do not bump the key merely to introduce another default; that would overwrite
  existing users' choices.
- A profile with saved v2 navigation keeps its bar order, enabled tabs, labels,
  and visibility. Its surviving drawer rows are regrouped once into the compact
  two-group model; retired group folds are discarded.
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

## Discover hierarchy and personalization

Discover has two destinations and one action:

- **For You** is the new-session landing page.
- **Browse** remains the complete searchable and filterable catalog.
- **Ask AI** is a separate, persistent Discover action rather than a third tab.
  Contextual Ask AI actions in game sheets open the same conversation surface.

The selected For You/Browse destination is remembered for the current app
session. A destination mounts only after its first visit, then stays mounted
while Discover remains open. Opening For You therefore no longer downloads or
starts Browse's hidden catalog work. Browse and Ask AI ship as separate lazy
chunks warmed from pointer-down or focus.

For You and Ask GameDeck now share the same evidence hierarchy. The 90-day
`v_recent_activity` window is the strongest behavioral signal; lifetime play is
a quieter prior, so an old marathon cannot dominate. My Ranking reactions provide
direction, Elo refines that direction as comparison confidence grows, and
`not_for_me` contributes no positive taste evidence. Wishlist saves are explicit
intent and receive a bounded promotion inside a taste-matched lane.
Ranking remains bounded; it changes taste-lane order and plain-language reasons
such as “Because you loved…”, but no hidden score is shown to the user.

Candidate releases are balanced on freshness and confidence-weighted catalog
quality before taste lanes are interleaved. Taste lanes lead the generic New lane
so a duplicate keeps its specific personalized reason. New releases start loading
in parallel with the taste profile, partial lane failures are distinguished from a
true empty feed, selected platforms are shown first, and ranking changes invalidate
the taste profile immediately. The on-screen profile note reports the amount of
recent-play evidence rather than making a generic personalization claim.

Ask GameDeck's server evidence bundle includes the authoritative library,
chosen/derived statuses, recent activity, My Ranking, wishlist, and the current
Game Pass catalog. Its prompt distinguishes ownership, interest, and availability,
and requires each pick's “Why it fits” line to cite actual evidence without
turning neutral play history into a positive reaction. Optional evidence reads
degrade independently; only the library read is required for an answer.

## Insights: recent play over lifetime totals

Insights now answers what has changed lately instead of repeating library totals
that become stale. The five retired lifetime cards (library snapshot, completion
breakdown, journey funnel, most played, and hall of fame) are no longer available
in card customization. Existing saved preferences reconcile automatically to the
four current cards: Play overview, Where your time went, Recent momentum, and
Recent milestones.

The top control switches the play overview and time split between rolling 7-day
and 30-day windows. Seven days stays daily; 30 days uses four chronological
buckets. Where your time went reports true share of the selected period. Progress
gain and completions are only shown when activity history contains a real reading
before the period; missing history remains an unknown baseline rather than being
treated as zero. Prior-period deltas follow the same rule and wait until two full
windows are covered.

Recent momentum is a stable 30-day summary of progress gained, completed games,
games played, active days, and the longest run. Recent milestones contains only
events supported by the activity feed, currently completions, meaningful progress,
and achievements. The 90-day genre/platform mix remains deferred until the event
history is mature enough to say something useful.

Home now labels the Insights doorway **Recent play** and shows a prior-week delta
only when the history covers it. Now Playing is deliberately simpler: last played,
platform/genre, one completion rail, optional recent gain, weekly time, and total
time. The duplicate achievement-heavy stat row and decorative progress arc were
removed. These changes use the existing `v_recent_activity` view and a 60-day
cached window; no database migration or new production dependency is required.

## Home snapshot and release watch

Home now defaults to the order **Recent play**, **Now playing**, **Release watch**,
then **Leaving Game Pass**. Recent play remains the compact doorway into Insights;
Now playing remains the current-game continuation card.

The former Coming up and Recently released cards are one **Release watch** card.
It shows the next confirmed wishlist arrival and the newest unowned wishlist
release, then opens one release timeline with **Upcoming**, **Out now**, and
**All saved** views. Those views keep the existing shared wishlist cache, sort and
density controls, swipe/remove/undo behavior, and wishlist game sheet. Home keeps
the same 60-day windows and opens individual rows directly in that sheet.

Leaving Game Pass remains separate because it has a different source and urgency,
and remains compact at rest. Its strongest owned-first candidate anchors the row;
when more titles are leaving, a `+N` indicator expands the existing four-item
relevance pool in place. A healthy catalog with no departures renders nothing.
An empty or more-than-36-hour-old catalog renders the quiet **Game Pass data
unavailable** status instead, so a failed feed no longer looks like a true empty
window. Customize cards explains those conditional rendering rules.

The `gamedeck_home_cards_v1` storage key remains in place. A stock legacy layout
migrates to the new default order; a customized layout keeps its relative order
and merges the two retired release-card preferences into Release watch. No saved
Home layout is reset wholesale.

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
- `1595f6d` — retired full-app game art in favor of four synchronous,
  palette-aware background treatments.
- `27e1da8` — established the two-destination Discover hierarchy, elevated Ask
  AI, deferred hidden Browse work, and connected My Ranking to For You.
- `9ad4193` — refreshed Insights around recent play and simplified the Home
  Insights doorway and Now Playing card.
- The Home snapshot, Release watch, and Game Pass recovery ship together in this
  `main` checkpoint.

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

The subsequent global-background refresh completed with 143 transformed modules
and all 16 automated Node tests passing. The Discover hierarchy and
personalization refresh completed with 144 transformed modules and all 22
automated Node tests passing. The Insights recent-play refresh completes with 145
transformed modules and all 27 automated Node tests passing; the live 60-day
activity read and required columns were also verified against the production
Supabase project. Installed-app visual QA remains the authoritative check for the
new Discover header, Ask AI transition, For You density, and recent-play card
density.

The Home snapshot and Release watch refresh completes with 145 transformed
modules and all 30 automated Node tests passing. The local browser could reach
only the expected owner sign-in boundary; installed-app review remains the
authoritative authenticated visual check for the consolidated Home card, compact
Game Pass alert, and three release scopes.

The Game Pass recovery extends that checkpoint with private n8n service auth for
the IGDB matcher, removes the destructive clear-first step, rejects suspicious
source/match counts, and replaces the catalog through one service-role-only
transaction. The database keeps the previous catalog if validation or insertion
fails, and the workflow now routes failures to the shared n8n error workflow.
The replacement RPC is tracked in `supabase/migrations/`; the n8n workflow itself
remains in the cloud operations layer and must not be exported with credential or
project identifiers. The combined Home update builds with 146 transformed modules
and all 35 automated Node tests passing.

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
