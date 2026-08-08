// Vercel serverless function - triggers the GameDeck Exophase sync on demand.
// The n8n refresh webhook URL and its token live ONLY here (server-side); the
// browser never sees them. The n8n workflow itself does the in-progress guard
// and answers 202 (started) or 409 (a sync is already running).
//
// Required env vars (set in Vercel project settings):
//   N8N_REFRESH_WEBHOOK_URL - production webhook URL of the "Refresh Trigger" workflow
//   N8N_REFRESH_TOKEN       - shared secret sent as the x-refresh-token header

export default async function handler(req, res) {
  // Trim defensively: a stray space/newline pasted into the env value would
  // otherwise make the URL invalid or point at the wrong path.
  const url = (process.env.N8N_REFRESH_WEBHOOK_URL || '').trim();
  const token = (process.env.N8N_REFRESH_TOKEN || '').trim();

  // Non-secret diagnostic: GET reports what this function is configured to call,
  // without ever exposing the token. Handy for verifying the env values.
  if (req.method === 'GET') {
    let urlHost = null;
    let urlPath = null;
    let urlParseError = null;
    try {
      const u = new URL(url);
      urlHost = u.host;
      urlPath = u.pathname;
    } catch (e) {
      urlParseError = String((e && e.message) || e);
    }
    res.status(200).json({
      configured: Boolean(url),
      urlHost,
      urlPath,
      urlParseError,
      tokenSet: Boolean(token),
      appSecretSet: Boolean(process.env.GAMEDECK_APP_SECRET),
    });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!url) {
    // Feature not wired up yet - fail soft so the button shows a friendly note.
    res.status(503).json({ status: 'not-configured', error: 'Refresh is not configured yet.' });
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
    res.status(500).json({ error: 'Server error', detail: String((err && err.message) || err) });
  }
}
