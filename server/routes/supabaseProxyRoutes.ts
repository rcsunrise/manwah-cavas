import { Router, Request, Response } from 'express';

const router = Router();

const isPlaceholder = (val: string | undefined) =>
  !val || val.includes('在这里填入') || val.includes('placeholder');

router.use(async (req: Request, res: Response) => {
  const upstreamBase = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  if (isPlaceholder(upstreamBase)) {
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Supabase upstream URL is not configured on the server.'
    });
  }

  // req.url contains the subpath and query parameters, e.g. "/auth/v1/user" or "/rest/v1/profiles?select=*"
  const targetUrl = `${upstreamBase.replace(/\/$/, '')}${req.url}`;

  // Forward client request headers, omitting hop-by-hop and host headers
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lKey = key.toLowerCase();
    if (['host', 'connection', 'content-length', 'transfer-encoding'].includes(lKey)) {
      continue;
    }
    if (typeof value === 'string') {
      headers[key] = value;
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ');
    }
  }

  let body: BodyInit | undefined = undefined;
  if (!['GET', 'HEAD'].includes(req.method)) {
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      body = req.body;
    } else if (typeof req.body === 'string' && req.body.length > 0) {
      body = req.body;
    } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      body = JSON.stringify(req.body);
      if (!headers['content-type'] && !headers['Content-Type']) {
        headers['content-type'] = 'application/json';
      }
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body
    });

    res.status(upstreamRes.status);

    upstreamRes.headers.forEach((val, key) => {
      const lKey = key.toLowerCase();
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(lKey)) {
        res.setHeader(key, val);
      }
    });

    const arrayBuffer = await upstreamRes.arrayBuffer();
    return res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    console.error(`[SupabaseProxy] Upstream request to ${targetUrl} failed:`, err?.message || err);
    return res.status(502).json({
      error: 'Bad Gateway',
      message: err?.message || 'Failed to reach Supabase upstream server.'
    });
  }
});

export default router;
