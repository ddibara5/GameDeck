# Artwork loading on Rankings and Home

The September 21 recording shows blank Rankings covers on the first visit, then
quicker loading on subsequent visits. Home also rebuilds its For You preview
when it remounts. These paths previously used lazy image loading and discarded
the displayed preview even when the session already had the data.

Changes:

- Give the first eight Rankings covers and the two comparison covers immediate
  loading priority. Request row images at their actual 64px CSS width (192px at
  3x density, instead of the previous 264px source cap).
- Share responsive image selection between rendering and a bounded idle warm-up
  of the first eight ranked games. Fetch one image at a time, cancel the remaining
  queue on navigation, and retain at most 24 warming Image objects. The existing
  idle scheduler skips save-data and 2G connections.
- Remember up to 256 successful cover sources during the session. Repeat covers
  load eagerly with synchronous decode preference; successful original-image
  fallbacks do not retry a failed resizing service on every navigation.
- Seed Home from its last successful For You preview while the existing refresh
  runs. Reject that seed after five minutes, a day change, or changed filters.
  Prioritize the first two New releases covers as well.

Verification: production build; existing Node suite compared against main; a
Playwright regression using the real Cover, RankingsTab and HomeTab components,
390px viewport at 3x density, and mocked image requests delayed by 300ms. It checks
responsive selection, no second download of warmed/repeated images, fallback
reuse, offscreen lazy loading, bounded/cancelled warming, and Home preview
presence on the initial render after remount. All backend traffic is intercepted
in the fixture; no production account data is used or changed.

Run `node repro/artwork-loading.mjs` with Playwright and Chromium installed.
Optional PLAYWRIGHT_MODULE, PW_CHROME and PW_LAMBDA_ARGS support CI runtimes, as
in the existing scroll-lock reproduction. The fixture is not a production entry.

These are controlled browser checks, not an iPhone Safari timing measurement.
A cold image still requires a network request; a quick tap before idle warming
completes can still show a placeholder briefly.
