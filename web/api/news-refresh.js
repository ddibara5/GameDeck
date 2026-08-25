// Vercel serverless function - asks n8n to re-run the gaming news digest.
//
// Deliberately a near-copy of api/sync.js rather than a shared helper: the two
// call different webhooks with different guards, and the whole point of this
// file is that the webhook URL and its token live ONLY here (server-side). The
// browser never sees either. Sharing the plumbing would save a dozen lines and
// make it easy to point the wrong route at the wrong workflow.
//
// The n8n workflow does the in-progress guard and answers 202 (started) or
// 409 (a refresh is already running). It runs the digest as a sub-workflow with
// the Gmail send gated off, so a pull-to-refresh never sends an email.
//
// The run takes over two minutes. This route does NOT wait for it: n8n responds
// as soon as it has accepted the job, and the client re-reads the news table
// rather than blocking the gesture.
//
// Required env vars (set in Vercel project settings):
//   N8N_NEWS_REFRESH_WEBHOOK_URL - production webhook URL of the
//                                  "News Refresh Trigger" workflow
//   N8N_REFRESH_TOKEN            - shared secret sent as the x-refresh-token
//                                  header (the same one api/sync.js uses)

import { requireOwner } from './_auth.js';

export default async function handler(req, res) {
  // Trim defensively: a stray space or newline pasted into the env value would
  // otherwise make the URL invalid or point at the wrong path.
  const url = (process.env.N8N_NEWS_REFRESH_WEBHOOK_URL || '').trim();
  const token = (process.env.N8N_REFRESH_TOKEN || '').trim();

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!(await requireOwner(req, res))) return;

  if (!url) {
    // Not wired up yet - fail soft. The News tab treats any non-2xx as "could
    // not start a run" and still re-reads the table, which is the useful half
    // of a refresh, so an unconfigured deploy degrades instead of breaking.
    res.status(503).json({ status: 'not-configured', error: 'News refresh is not configured yet.' });
    return;
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-refresh-token': token } : {}),
      },
      body: JSON.stringify({ source: 'app' }),
    });

    let bodyText = '';
    try { bodyText = await r.text(); } catch { /* webhook may answer with an empty body */ }
    let payload = {};
    try { payload = JSON.parse(bodyText); } catch { /* body may not be JSON */ }

    if (r.status === 409) {
      res.status(409).json({ status: 'already-running', ...payload });
      return;
    }
    if (r.ok || r.status === 202) {
      res.status(202).json({ status: 'started', ...payload });
      return;
    }
    // Surface exactly what n8n replied so failures are diagnosable.
    res.status(502).json({ status: 'trigger-failed', upstream: r.status, detail: bodyText.slice(0, 300) });
  } catch (err) {
    console.error(JSON.stringify({ event: 'news_refresh_failed', error: String((err && err.message) || err) }));
    res.status(500).json({ error: 'Server error', detail: String((err && err.message) || err) });
  }
}
