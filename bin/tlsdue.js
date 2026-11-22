#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseTarget, checkCert, domainExpiry, daysLeft, printable } from '../src/index.js';

const HELP = `Usage: tlsdue <host[:port]> [...] [options]
       tlsdue                   (reads hosts from tlsdue.txt, one per line, # comments)

Checks when TLS certificates and domain registrations expire.
Fails if anything expires within --days, a certificate is not trusted, or a host is unreachable.

Options:
  --days N        Warning window in days (default 21)
  --file FILE     Read hosts from FILE (default tlsdue.txt)
  --no-domain     Skip domain registration checks (RDAP)
  --timeout MS    Per-request timeout (default 10000)
  --json          Machine-readable output
  -h, --help      Show help
  -v, --version   Show version

Exit codes: 0 = all fine, 1 = expiring soon, expired, untrusted or unreachable, 2 = usage error`;

const OPTIONS = { days: { type: 'string' }, file: { type: 'string' }, 'no-domain': { type: 'boolean' }, timeout: { type: 'string' },
  json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } };
const die = (msg) => { process.stderr.write(`tlsdue: ${printable(msg)}\n`); process.exit(2); };

let args;
try { args = parseArgs({ allowPositionals: true, options: OPTIONS }); } catch (e) {
  const bad = /'(--?[\w-]+)'/.exec(e.message)?.[1];
  const near = bad && Object.keys(OPTIONS).find((k) => bad.length > 3 && `--${k}`.startsWith(bad.slice(0, 4)));
  die(`${bad ? `unknown option ${bad}` : e.message}${near ? ` (did you mean --${near}?)` : ''}. See --help.`);
}
const { values: o, positionals } = args;
if (o.help) { console.log(HELP); process.exit(0); }
if (o.version) { console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version); process.exit(0); }
const num = (v, def, name) => { if (v === undefined) return def; const n = Number(v); if (!Number.isInteger(n) || n < 0) die(`${name} needs a whole number`); return n; };
const days = num(o.days, 21, '--days');
const timeout = num(o.timeout, 10000, '--timeout') || 10000;

let list = positionals;
if (!list.length) {
  const f = o.file ?? 'tlsdue.txt';
  try { list = readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean); } catch (e) {
    if (e.code === 'ENOENT' && !o.file) { console.log(HELP); process.exit(2); }
    die(`cannot read ${f}: ${e.code ?? e.message}`);
  }
}
if (list.length > 500) die('at most 500 hosts per run');
const targets = list.map((s) => parseTarget(s) ?? die(`invalid host "${s}"`));

// One RDAP bootstrap download shared by all hosts; failure only disables domain checks.
let bootstrap;
if (!o['no-domain']) {
  try { const r = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(timeout) }); bootstrap = r.ok ? await r.json() : null; } catch { bootstrap = null; }
}

const now = Date.now();
const statusOf = (iso) => { const d = daysLeft(iso, now); return { daysLeft: d, status: d < 0 ? 'expired' : d <= days ? 'soon' : 'ok' }; };
const results = [];
for (let i = 0; i < targets.length; i += 8) { // small batches: polite to servers, still fast
  results.push(...await Promise.all(targets.slice(i, i + 8).map(async (t) => {
    const cert = await checkCert(t, { timeout });
    const r = { host: t.host, port: t.port, cert: cert.error ? { status: 'error', error: cert.error } : { ...cert, ...statusOf(cert.expires) } };
    if (r.cert.status === 'ok' && cert.problem) r.cert.status = 'untrusted';
    if (bootstrap) {
      let d;
      try { d = await domainExpiry(t.host, { timeout, bootstrap }); } catch (e) { d = { skipped: `RDAP error (${e.message})` }; }
      r.domain = d.expires ? { ...d, ...statusOf(d.expires) } : d;
    }
    return r;
  })));
}
const bad = (x) => x && ['expired', 'soon', 'error', 'untrusted'].includes(x.status);
const failed = results.some((r) => bad(r.cert) || bad(r.domain));

if (o.json) console.log(JSON.stringify({ ok: !failed, days, results }, null, 2));
else {
  const color = (process.stdout.isTTY || !!process.env.FORCE_COLOR) && !process.env.NO_COLOR;
  const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const COL = { ok: 32, soon: 33, expired: 31, error: 31, untrusted: 31 };
  const when = (x) => {
    if (!x) return c(2, 'skipped');
    if (x.skipped) return c(2, x.skipped);
    if (x.status === 'error') return c(31, `✗ ${x.error}`);
    const left = x.daysLeft < 0 ? `expired ${-x.daysLeft}d ago` : `${x.daysLeft}d`;
    const mark = x.status === 'ok' ? '✓' : x.status === 'soon' ? '!' : '✗';
    return c(COL[x.status], `${mark} ${x.expires.slice(0, 10)} (${left})`);
  };
  const visible = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;
  const name = (r) => printable(r.port === 443 ? r.host : `${r.host}:${r.port}`);
  const w = Math.max(4, ...results.map((r) => name(r).length));
  const cw = Math.max(11, ...results.map((r) => visible(when(r.cert))));
  console.log(c(2, `${'HOST'.padEnd(w)}  ${'CERTIFICATE'.padEnd(cw)}  ${'ISSUER'.padEnd(18)}  DOMAIN`));
  for (const r of results) {
    const certCol = when(r.cert);
    const problem = r.cert.problem ? c(31, `  ${printable(r.cert.problem)}`) : '';
    console.log(`${name(r).padEnd(w)}  ${certCol}${' '.repeat(cw - visible(certCol))}  ${printable(r.cert.issuer ?? '').slice(0, 18).padEnd(18)}  ${when(r.domain)}${problem}`);
  }
  console.log(failed ? c(31, `\nAction needed: something expires within ${days} days or failed.`) : c(32, `\nAll good for the next ${days} days.`));
}
process.exit(failed ? 1 : 0);
