// tlsdue core: TLS certificate and domain registration expiry checks.
import { connect, checkServerIdentity } from 'node:tls';
import { isIP } from 'node:net';

export const printable = (s) => String(s).replace(/[\x00-\x1f\x7f-\x9f]/g, '?');
const DAY = 86400000;
export const daysLeft = (date, now = Date.now()) => Math.floor((new Date(date).getTime() - now) / DAY);

// "example.com", "example.com:8443", "https://example.com/path" -> { host, port }. Returns null if invalid.
export function parseTarget(input) {
  let s = String(input).trim().replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '');
  let port = 443;
  const m = /^\[([0-9a-f:.]+)\](?::(\d+))?$/i.exec(s) ?? (/^([^:]+)(?::(\d+))?$/.exec(s));
  if (!m) return null;
  s = m[1].toLowerCase().replace(/\.$/, '');
  if (m[2]) port = Number(m[2]);
  if (!(port > 0 && port < 65536)) return null;
  const hostOk = isIP(s) || (s.length <= 253 && s.split('.').every((l) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(l)) && s.includes('.')) || s === 'localhost';
  return hostOk ? { host: s, port } : null;
}

// Connects, reads the leaf certificate, never sends data. Invalid certs are reported, not trusted.
export function checkCert({ host, port }, { timeout = 10000, ca } = {}) {
  return new Promise((resolve) => {
    const servername = isIP(host) ? undefined : host;
    const sock = connect({ host, port, servername, rejectUnauthorized: false, ca, timeout, ALPNProtocols: ['http/1.1'] });
    const done = (r) => { sock.destroy(); resolve(r); };
    sock.once('secureConnect', () => {
      const c = sock.getPeerCertificate();
      if (!c || !c.valid_to) return done({ error: 'no certificate' });
      const mismatch = servername ? checkServerIdentity(servername, c) : undefined;
      done({
        expires: new Date(c.valid_to).toISOString(),
        issuer: c.issuer?.O ?? c.issuer?.CN ?? '?',
        trusted: sock.authorized,
        problem: mismatch ? `name mismatch` : sock.authorized ? undefined : String(sock.authorizationError),
      });
    });
    sock.once('timeout', () => done({ error: 'timeout' }));
    sock.once('error', (e) => done({ error: e.code ?? e.message }));
  });
}

const BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';
const MAX_BYTES = 1024 * 1024;

async function getJson(url, fetchImpl, timeout) {
  const res = await fetchImpl(url, { headers: { accept: 'application/rdap+json, application/json' }, signal: AbortSignal.timeout(timeout) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new Error('response too large');
  return JSON.parse(text);
}

// Registration expiry through RDAP (the registries' official JSON API). Tries "b.c" then "a.b.c" for co.uk-style suffixes.
export async function domainExpiry(host, { fetch: fetchImpl = fetch, timeout = 10000, bootstrap } = {}) {
  if (isIP(host) || !host.includes('.')) return { skipped: 'not a domain' };
  const labels = host.split('.');
  const tld = labels.at(-1);
  const boot = bootstrap ?? (await getJson(BOOTSTRAP, fetchImpl, timeout));
  const service = boot?.services?.find(([tlds]) => tlds.includes(tld));
  if (!service) return { skipped: `no RDAP for .${tld}` };
  const base = service[1].find((u) => u.startsWith('https://')) ?? service[1][0];
  for (let n = 2; n <= Math.min(3, labels.length); n++) {
    const domain = labels.slice(-n).join('.');
    const data = await getJson(`${base.replace(/\/?$/, '/')}domain/${encodeURIComponent(domain)}`, fetchImpl, timeout);
    if (!data) continue;
    const ev = (data.events ?? []).find((e) => e.eventAction === 'expiration');
    return ev ? { domain, expires: new Date(ev.eventDate).toISOString() } : { domain, skipped: 'registry hides expiry' };
  }
  return { skipped: 'not found in RDAP' };
}
