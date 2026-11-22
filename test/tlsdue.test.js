import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:tls';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTarget, checkCert, domainExpiry, daysLeft } from '../src/index.js';

// Test-only self-signed certificate for "localhost" (valid until 2126). Not used anywhere else.
const fx = (f) => new URL(`./fixtures/${f}`, import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const CERT = fx('cert.pem');
const BIN = new URL('../bin/tlsdue.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const run = (args, env = {}, cwd) => new Promise((done) => {
  const p = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', ...env } });
  let stdout = '', stderr = '';
  p.stdout.on('data', (d) => (stdout += d)); p.stderr.on('data', (d) => (stderr += d));
  p.on('close', (status) => done({ status, stdout, stderr }));
});

let server, port;
before(async () => {
  server = createServer({ key: readFileSync(fx('key.pem')), cert: readFileSync(CERT) }, (s) => s.end());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
});
after(() => server.close());

test('parseTarget accepts hosts, ports and URLs, rejects junk', () => {
  assert.deepEqual(parseTarget('Example.com'), { host: 'example.com', port: 443 });
  assert.deepEqual(parseTarget('https://api.example.com:8443/v1?x=1'), { host: 'api.example.com', port: 8443 });
  assert.deepEqual(parseTarget('[::1]:8443'), { host: '::1', port: 8443 });
  assert.deepEqual(parseTarget('127.0.0.1'), { host: '127.0.0.1', port: 443 });
  for (const bad of ['', 'exa mple.com', 'example.com:0', 'example.com:99999', '-bad-.com', 'nodots', 'a'.repeat(64) + '.com', 'x.com;rm -rf']) assert.equal(parseTarget(bad), null, bad);
});

test('daysLeft', () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(daysLeft('2026-01-11T00:00:00Z', now), 10);
  assert.equal(daysLeft('2025-12-30T00:00:00Z', now), -2);
});

test('checkCert reads expiry, trust and name match', async () => {
  const trusted = await checkCert({ host: 'localhost', port }, { ca: readFileSync(CERT) });
  assert.equal(trusted.trusted, true); assert.equal(trusted.problem, undefined);
  assert.match(trusted.expires, /^2126-/);
  const untrusted = await checkCert({ host: 'localhost', port });
  assert.equal(untrusted.trusted, false); assert.match(untrusted.problem, /SELF_SIGNED|self-signed|self signed/i);
  const down = await checkCert({ host: '127.0.0.1', port: 1 }, { timeout: 2000 });
  assert.ok(down.error);
});

test('domainExpiry uses the RDAP bootstrap and handles co.uk-style names', async () => {
  const bootstrap = { services: [[['com'], ['https://rdap.test/']], [['uk'], ['http://rdap.uk.test/', 'https://rdap.uk.test/']]] };
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (url === 'https://rdap.test/domain/example.com') return ok({ events: [{ eventAction: 'registration', eventDate: '2000-01-01T00:00:00Z' }, { eventAction: 'expiration', eventDate: '2027-03-01T00:00:00Z' }] });
    if (url === 'https://rdap.uk.test/domain/shop.co.uk') return ok({ events: [] });
    return { ok: false, status: 404, text: async () => '' };
  };
  assert.deepEqual(await domainExpiry('www.example.com', { fetch: fake, bootstrap }), { domain: 'example.com', expires: '2027-03-01T00:00:00.000Z' });
  assert.deepEqual(await domainExpiry('a.shop.co.uk', { fetch: fake, bootstrap }), { domain: 'shop.co.uk', skipped: 'registry hides expiry' });
  assert.ok(calls.includes('https://rdap.uk.test/domain/co.uk'));
  assert.deepEqual(await domainExpiry('x.jp', { fetch: fake, bootstrap }), { skipped: 'no RDAP for .jp' });
  assert.deepEqual(await domainExpiry('127.0.0.1', { fetch: fake, bootstrap }), { skipped: 'not a domain' });
});

test('CLI: trusted ok, --days window, untrusted, unreachable, list file, bad input', async () => {
  const trust = { NODE_EXTRA_CA_CERTS: CERT };
  let r = await run([`localhost:${port}`, '--no-domain'], trust);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`localhost:${port} +✓ 2126-\\d\\d-\\d\\d \\(\\d+d\\)`));
  r = await run([`localhost:${port}`, '--no-domain', '--days', '99999'], trust);
  assert.equal(r.status, 1); assert.match(r.stdout, /! 2126-/);
  r = await run([`localhost:${port}`, '--no-domain']);
  assert.equal(r.status, 1); assert.match(r.stdout, /self.signed/i);
  r = await run(['127.0.0.1:1', '--no-domain', '--timeout', '2000']);
  assert.equal(r.status, 1); assert.match(r.stdout, /✗ ECONNREFUSED|✗ /);
  const cwd = mkdtempSync(join(tmpdir(), 'tlsdue-'));
  writeFileSync(join(cwd, 'tlsdue.txt'), `# my sites\nlocalhost:${port}\n\n`);
  const j = JSON.parse((await run(['--no-domain', '--json'], trust, cwd)).stdout);
  assert.equal(j.ok, true); assert.equal(j.results[0].cert.status, 'ok');
  assert.equal((await run(['not a host'])).status, 2);
  const typo = await run(['--dayz', '3']);
  assert.equal(typo.status, 2); assert.match(typo.stderr, /did you mean --days/);
});
