# tlsdue

[English](README.md) · Português · [日本語](README.ja.md)

Saiba **antes** que seus certificados TLS e registros de domínio vençam. Um comando checa os dois, e um agendamento de 10 linhas no GitHub Actions vira monitoramento grátis: sem servidor, sem conta, sem painel.

```bash
npx @guihakka2/tlsdue github.com example.com registro.br
```

- **Certificado**: data de vencimento, emissor, cadeia confiável e nome do host. Vencido, autoassinado ou com nome errado falha.
- **Domínio**: vencimento via RDAP, a API oficial dos registros (funciona com `.com`, `.br`, `.dev` e a maioria dos TLDs). Registros que escondem a data aparecem como "skipped", não como erro.
- **Host fora do ar** também falha.

Monitoramento grátis: coloque os hosts em `tlsdue.txt` (um por linha) e crie um workflow agendado com `npx -y @guihakka2/tlsdue --days 21` (exemplo completo no [README em inglês](README.md)). Quando algo estiver para vencer, o job falha e o GitHub te manda email.

Opções: `--days N` (padrão 21), `--file`, `--no-domain`, `--timeout`, `--json`. Segurança: [SECURITY.md](SECURITY.md).

**Sem Node.js?** Cada [release](https://github.com/Guihakka2/tlsdue/releases/latest) tem um programa pronto para Windows, macOS e Linux (x64 e ARM): baixe, descompacte e rode `tlsdue` no terminal. Gerado pelo GitHub Actions, com `SHA256SUMS.txt` e atestado de procedência. Ainda sem assinatura paga: na primeira vez, o Windows mostra o SmartScreen ("Mais informações" → "Executar assim mesmo") e no macOS rode `xattr -d com.apple.quarantine tlsdue` uma vez.
