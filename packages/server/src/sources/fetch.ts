/**
 * The offline scripts' one way onto the web (ADR-0061): it reads robots.txt
 * first and refuses a disallowed path, says who it is, waits a second
 * between requests to the same site, and keeps every page in
 * `var/cache/sources/` (git-ignored) so re-reading the data never fetches
 * again unless asked to (`--refresh`). Plain page fetches only: no sign-in,
 * no forms, no cookies.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fromRoot } from '../paths';

export const CACHE_DIR = fromRoot('var/cache/sources');
const USER_AGENT =
  'genshin-build-lab data refresh (personal, offline; one request a second)';
const GAP_MS = 1000;

const lastHit = new Map<string, number>();
const robots = new Map<string, string[]>();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait out the gap since the last request to this host. */
async function politely(host: string) {
  const since = Date.now() - (lastHit.get(host) ?? 0);
  if (since < GAP_MS) await wait(GAP_MS - since);
  lastHit.set(host, Date.now());
}

/** The paths robots.txt disallows for every agent (`User-agent: *`). */
async function disallowed(origin: string): Promise<string[]> {
  const known = robots.get(origin);
  if (known) return known;
  await politely(new URL(origin).host);
  let text = '';
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.ok) text = await res.text();
  } catch {
    // No robots.txt reachable: nothing is disallowed by it.
  }
  const rules: string[] = [];
  let forAll = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const [k, ...rest] = line.split(':');
    const v = rest.join(':').trim();
    if (/^user-agent$/i.test(k)) forAll = v === '*';
    else if (forAll && /^disallow$/i.test(k) && v) rules.push(v);
  }
  robots.set(origin, rules);
  return rules;
}

const cacheFile = (url: string) => {
  const u = new URL(url);
  const name = `${u.pathname}${u.search}`
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return path.join(CACHE_DIR, u.host, `${name || 'index'}.html`);
};

export interface Page {
  url: string;
  html: string;
  /** The day it was fetched (from the cache's file time when cached). */
  fetched: string;
  fromCache: boolean;
}

/** A page, from the cache unless `refresh`; null when robots.txt
 *  disallows it or the site answers with an error. */
export async function getPage(
  url: string,
  { refresh = false }: { refresh?: boolean } = {},
): Promise<Page | null> {
  const file = cacheFile(url);
  if (!refresh && fs.existsSync(file))
    return {
      url,
      html: fs.readFileSync(file, 'utf8'),
      fetched: fs.statSync(file).mtime.toISOString().slice(0, 10),
      fromCache: true,
    };
  const u = new URL(url);
  const rules = await disallowed(u.origin);
  if (rules.some((r) => u.pathname.startsWith(r))) {
    console.warn(`robots.txt disallows ${url}: skipped`);
    return null;
  }
  await politely(u.host);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    console.warn(`${res.status} for ${url}`);
    return null;
  }
  const html = await res.text();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html, 'utf8');
  return {
    url: res.url || url,
    html,
    fetched: new Date().toISOString().slice(0, 10),
    fromCache: false,
  };
}
