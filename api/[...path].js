// Transport-only Vercel gateway. Authentication, scope, review and persistence live in Java.
export default async function handler(req, res) {
  const path = new URL(req.url, 'https://gateway.invalid').pathname;
  if (!path.startsWith('/api/evaluation-access/')) return res.status(404).json({ message: 'Not found.' });
  let base;
  try { base = new URL(process.env.JAVA_API_URL); if (base.protocol !== 'https:') throw new Error(); }
  catch { return res.status(503).json({ message: 'The evaluation service is not configured. Contact DI.' }); }
  const headers = {};
  for (const name of ['authorization', 'cookie', 'content-type', 'origin', 'x-elevateme-request']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  if (body && Buffer.byteLength(body) > 65536) return res.status(413).json({ message: 'Request too large.' });
  try {
    const upstream = await fetch(new URL(path, base.origin), { method: req.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(20000) });
    res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('Vary', 'Authorization, Cookie');
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    const cookies = upstream.headers.getSetCookie(); if (cookies.length) res.setHeader('Set-Cookie', cookies);
    res.status(upstream.status).send(await upstream.text());
  } catch { res.status(502).json({ message: 'The evaluation service is temporarily unavailable. Please try again.' }); }
}
