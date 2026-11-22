# Security Policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting:
**Security tab > Report a vulnerability** on this repository.
You will get a reply within 7 days.

## Design guarantees

- tlsdue only opens a TLS handshake to the hosts you list, reads the certificate and closes. It sends no request data.
- It connects without rejecting bad certificates **on purpose**, so it can report them; trust is then checked and an untrusted or mismatched certificate fails the run.
- Domain checks use RDAP, the registries' official JSON API (bootstrap list from data.iana.org). Use `--no-domain` to skip them.
- Hosts are validated (hostname, IPv4/IPv6, port 1-65535), at most 500 per run, responses capped at 1 MB, every request has a timeout.
- Terminal control characters are stripped from everything printed. No telemetry, zero runtime dependencies.
- `test/fixtures/` holds a self-signed key and certificate for `localhost`, used only by the tests and never published to npm.
- npm releases are built by GitHub Actions with provenance; never by hand.
