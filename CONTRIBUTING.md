# Contributing

Thanks for helping! Rules that keep users safe:

1. Every change goes through a pull request reviewed by the maintainer.
2. **No new runtime dependencies** without an issue discussing it first.
3. tlsdue only reads certificates and RDAP data: no other network calls, no telemetry.
4. Run `npm test` before opening a PR (Node 20+). Tests use a local TLS server, no internet needed.
5. A registry or TLD that doesn't work? Add a test with a fake RDAP response.

English first for code, issues and docs. Translations (pt-BR, ja) are welcome as separate PRs.
