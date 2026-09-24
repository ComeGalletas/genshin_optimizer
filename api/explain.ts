import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import {
  parseExplainPayload,
  buildExplainPrompt,
} from '../packages/web/src/ai/explainShared';
import { checkRateLimit } from './_ratelimit';

function clientIp(req: VercelRequest): string {
  // Prefer x-real-ip: Vercel's edge sets it to the true connecting IP, which a
  // client can't forge. The leftmost x-forwarded-for entry is client-supplied
  // and trivially spoofed to rotate rate-limit buckets, so it's only a
  // last-resort fallback (non-Vercel/local, where the limiter is a no-op anyway).
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const xff = req.headers['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff;
  return first?.split(',')[0]?.trim() || 'unknown';
}

const MAX_BODY_BYTES = 16_000;

function headerValue(v: string | string[] | undefined): string | undefined {
  const first = Array.isArray(v) ? v[0] : v;
  return first?.split(',')[0]?.trim() || undefined;
}

function allowedOrigins(req: VercelRequest): string[] {
  const origins: string[] = [];
  // An explicit override, for serving the app from a custom domain that is not
  // the deployment's own hostname.
  if (process.env.PUBLIC_ORIGIN) origins.push(process.env.PUBLIC_ORIGIN);
  // The deployment's own origin. Same-origin browser POSTs still send Origin,
  // and preview deployments each get their own hostname, so without this every
  // real request from the shipped app would be rejected. Trusting self-origin
  // is safe: a cross-site attacker's browser sends the *attacker's* Origin, not
  // ours, so this can't be used to forge one.
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`);
  const host =
    headerValue(req.headers['x-forwarded-host']) ??
    headerValue(req.headers.host);
  if (host) {
    const proto = headerValue(req.headers['x-forwarded-proto']) ?? 'https';
    origins.push(`${proto}://${host}`);
  }
  // Dev servers are trusted outside production only — in production a
  // localhost Origin is never a legitimate caller of this deployment.
  if (process.env.VERCEL_ENV !== 'production') {
    origins.push('http://localhost:5199', 'http://localhost:5173');
  }
  return origins;
}

function isAllowedOrigin(req: VercelRequest): boolean {
  // An absent Origin is a non-browser client, which the rate limit and global
  // budget cap already bound; a present-but-foreign one is a cross-site caller
  // spending this endpoint's budget, and has no legitimate case.
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) return true;
  return allowedOrigins(req).includes(origin);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  // Cheap pre-parse exit on a declared oversized body. It reads as 0 when the
  // header is absent or non-numeric, so it is a fast path only — the parsed
  // check below is what actually enforces the cap.
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'payload too large' });
    return;
  }

  // The real cap, measured on what was actually parsed, so a missing or lying
  // content-length can't get past it. The valid payload is tiny (bounded by
  // parseExplainPayload's field-level caps); 16 KB is generous headroom.
  if (JSON.stringify(req.body ?? null).length > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'payload too large' });
    return;
  }

  if (!isAllowedOrigin(req)) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  // Per-IP cost/abuse guard ahead of the parse/key checks (ADR-0013) —
  // cheapest rejection first.
  let success: boolean;
  let reason: string | undefined;
  try {
    ({ success, reason } = await checkRateLimit(clientIp(req)));
  } catch {
    // Upstash unreachable. Fail closed rather than crash the invocation: an
    // unbounded paid endpoint is worse than a temporary outage.
    res.status(503).json({ error: 'unavailable' });
    return;
  }
  if (!success && reason === 'not-configured') {
    // The limiter is missing in production: our fault, not the caller's, and
    // indistinguishable to them from Upstash being unreachable.
    res.status(503).json({ error: 'unavailable' });
    return;
  }
  if (!success) {
    res.status(429).json({ error: 'rate limited' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'unavailable' });
    return;
  }

  const payload = parseExplainPayload(req.body);
  if (!payload) {
    res.status(400).json({ error: 'invalid payload' });
    return;
  }

  try {
    const { system, user } = buildExplainPrompt(payload);
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200, // caps cost/output at the ~2-3 sentences buildExplainPrompt asks for
      system,
      messages: [{ role: 'user', content: user }],
    });
    const explanation = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    res.status(200).json({ explanation });
  } catch {
    // Never leak upstream error details or key material.
    res.status(500).json({ error: 'unavailable' });
  }
}
