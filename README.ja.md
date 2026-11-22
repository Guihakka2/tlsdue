# tlsdue

[English](README.md) · [Português](README.pt-BR.md) · 日本語

TLS 証明書とドメイン登録の期限切れを **事前に** 知るためのツールです。1 つのコマンドで両方をチェックし、GitHub Actions の 10 行のスケジュール設定で無料の監視になります（サーバー・アカウント・ダッシュボード不要）。

```bash
npx @guihakka2/tlsdue github.com example.com registro.br
```

- **証明書**：有効期限、発行者、信頼チェーン、ホスト名の一致。期限切れ・自己署名・名前不一致は失敗
- **ドメイン**：RDAP（レジストリ公式の JSON API）で有効期限を取得。`.com`、`.net`、`.dev` など多くの TLD に対応。期限を公開しないレジストリや RDAP 非対応（`.jp` など）は「skipped」と表示し、エラーにはしません
- **接続できないホスト** も失敗扱い

無料監視：`tlsdue.txt` にホストを 1 行ずつ書き、`npx -y @guihakka2/tlsdue --days 21` を実行するスケジュール workflow を追加します（完全な例は [英語版 README](README.md)）。期限が近づくとジョブが失敗し、GitHub からメールが届きます。

オプション：`--days N`（既定 21）、`--file`、`--no-domain`、`--timeout`、`--json`。セキュリティは [SECURITY.md](SECURITY.md) を参照。

**Node.js がなくても使えます：** 各[リリース](https://github.com/Guihakka2/tlsdue/releases/latest)に Windows・macOS・Linux（x64 / ARM）用のプログラムがあります。ダウンロードして展開し、ターミナルで `tlsdue` を実行してください。GitHub Actions でビルドされ、`SHA256SUMS.txt` とビルド来歴の証明付き。まだ有料の署名はないため、初回は Windows の SmartScreen（「詳細情報」→「実行」）、macOS では `xattr -d com.apple.quarantine tlsdue` を一度実行してください。
