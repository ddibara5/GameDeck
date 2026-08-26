import { timingSafeEqual } from 'node:crypto';

const OWNER_EMAIL = (process.env.GAMEDECK_ALLOWED_EMAIL || 'ddibara@gmail.com').trim().toLowerCase();

function bearer(req) {
  const value = String(req.headers?.authorization || '');
  return value.toLowerCase().startsWith('bearer ') ? value.slice(7).trim() : '';
}

// The same private n8n credential already used by the app's refresh webhook can
// authenticate scheduled server-to-server catalog work. It is never accepted as
// a browser session and is compared in constant time. Callers must still opt in
// route-by-route; owner auth remains the default everywhere else.
export function isN8nService(req) {
  const expected = String(process.env.N8N_REFRESH_TOKEN || '').trim();
  const supplied = String(req.headers?.['x-refresh-token'] || '').trim();
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function requireOwner(req, res) {
  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: 'Sign in required.' });
    return null;
  }

  const url = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!url || !key) {
    console.error(JSON.stringify({ event: 'auth_config_missing', route: req.url }));
    res.status(503).json({ error: 'Authentication is not configured.' });
    return null;
  }

  try {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      res.status(401).json({ error: 'Your session is invalid or expired.' });
      return null;
    }
    const user = await response.json();
    if (String(user?.email || '').toLowerCase() !== OWNER_EMAIL) {
      console.warn(JSON.stringify({ event: 'auth_owner_rejected', userId: user?.id || null, route: req.url }));
      res.status(403).json({ error: 'This account is not authorized for GameDeck.' });
      return null;
    }
    return user;
  } catch (error) {
    console.error(JSON.stringify({ event: 'auth_verify_failed', route: req.url, error: String(error?.message || error) }));
    res.status(503).json({ error: 'Could not verify your session.' });
    return null;
  }
}

export function clientIp(req) {
  return String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}
