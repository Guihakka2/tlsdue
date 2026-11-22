# tlsdue

[![npm](https://img.shields.io/npm/v/@guihakka2/tlsdue)](https://www.npmjs.com/package/@guihakka2/tlsdue) [![CI](https://github.com/Guihakka2/tlsdue/actions/workflows/ci.yml/badge.svg)](https://github.com/Guihakka2/tlsdue/actions/workflows/ci.yml)

English · [Português](README.pt-BR.md) · [日本語](README.ja.md)

Know **before** your TLS certificates and domain registrations expire. One command checks both, and a 10-line GitHub Actions schedule turns it into free monitoring: no server, no account, no dashboard.

```bash
npx @guihakka2/tlsdue github.com example.com registro.br expired.badssl.com
```

```
HOST                CERTIFICATE                       ISSUER              DOMAIN
github.com          ✓ 2027-01-27 (66d)                Sectigo Limited     ✓ 2028-10-09 (687d)
example.com         ✓ 2026-12-25 (33d)                SSL Corporation     ✓ 2027-08-13 (263d)
registro.br         ✓ 2026-12-29 (37d)                Let's Encrypt       registry hides expiry
expired.badssl.com  ✗ 2015-04-12 (expired 4242d ago)  COMODO CA Limited   ✓ 2027-04-07 (136d)  CERT_HAS_EXPIRED

Action needed: something expires within 21 days or failed.
```

## Free monitoring with GitHub Actions

Put your hosts in `tlsdue.txt` (one per line, `#` comments, `host:port` for other ports), then add `.github/workflows/tlsdue.yml`:

```yaml
name: tlsdue
on:
  schedule: [{ cron: "0 8 * * *" }]   # every day at 08:00 UTC
  workflow_dispatch:
permissions: { contents: read }
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx -y @guihakka2/tlsdue --days 21
```

When something is close to expiring the job fails, and GitHub emails you.

## What it checks

- **Certificate**: expiry date, issuer, trusted chain and hostname match. Expired, self-signed or wrong-name certificates fail.
- **Domain registration**: expiry date through RDAP, the registries' official JSON API (bootstrap list from IANA). Works for `.com`, `.net`, `.org`, `.br`, `.dev`, `.app` and most other TLDs. Some registries hide the date or don't run RDAP (e.g. `.jp`), which is shown as skipped, not as an error.
- **Unreachable hosts** fail too: an expired cert you can't see is still a problem.

## Options

| Option | |
|---|---|
| `--days N` | Warning window in days (default 21) |
| `--file FILE` | Read hosts from FILE (default `tlsdue.txt`) |
| `--no-domain` | Skip domain registration checks |
| `--timeout MS` | Per-request timeout (default 10000) |
| `--json` | Machine-readable output |

Exit codes: `0` all fine, `1` expiring soon / expired / untrusted / unreachable, `2` usage error.

## Security

See [SECURITY.md](SECURITY.md). tlsdue only does a TLS handshake with the hosts you list (no request data sent) and asks RDAP registries for domain dates. Zero dependencies, no telemetry.

## License

MIT · Part of [Guihakka Tools](https://github.com/Guihakka2/guihakka-tools)
