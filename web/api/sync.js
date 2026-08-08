// Vercel serverless function - triggers the GameDeck Exophase sync on demand.
// The n8n refresh webhook URL and its token live ONLY here (server-side); the
// browser never sees them. The n8n workflow itself does the in-progress guard
// and answers 202 (started) or 409 (a sync is already running).
//
// Required env vars (set in Vercel project settings):
//   N8N_REFRESH_WEBHOOK_URL - production webhook URL of the "Refresh Trigger" workflow
//   N8N_REFRESH_TOKEN       - shared secret sent as the x-refresh-token header
// Optional:
//   GAMEDECK_APP_SECRET     - if set, callers must send x-gamedeck-key (same guard as /api/chat)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Same optional shared-secret guard the chat endpoint uses.
  const APP_SECRET = process.env.GAMEDECK_APP_SECRET;
  if (APP_SECRET && req.headers['x-gamedeck-key'] !== APP_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const url = process.env.N8N_REFRESH_WEBHOOK_URL;
  if (!url) {
    // Feature not wired up yet - fail soft so the button can show a friendly note.
    res.status(503).json({ status: 'not-configured', error: 'Refresh is not configured yet.' });
    return;
  }

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.N8N_REFRESH_TOKEN ? { 'x-refresh-token': process.env.N8N_REFRESH_TOKEN } : {}),
      },
      body: JSON.stringify({ source: 'app' }),
    });

    let payload = {};
    try { payload = await r.json(); } catch { /* webhook may answer with an empty body */ }

    if (r.status === 409) {
      res.status(409).json({ status: 'already-running', ...payload });
      return;
    }
    if (r.ok || r.status === 202) {
      res.status(202).json({ status: 'started', ...payload });
      return;
    }
    res.status(502).json({ status: 'trigger-failed', upstream: r.status });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: String((err && err.message) || err) });
  }
}
