# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately via GitHub's
[private vulnerability reporting](https://github.com/AInohogosya/clio-skills-bot/security/advisories/new)
or by opening a security advisory on this repository. Do not open public
issues for undisclosed vulnerabilities.

Include, where possible:

- affected endpoint or file and commit
- reproduction steps
- impact assessment
- suggested mitigation

We will acknowledge reports as soon as practical and keep reporters informed
of remediation progress.

## Security Practices in This Repository

- No secrets, tokens, or credentials are committed. `.env` files and
  `.project-config.json` are git-ignored; use `.env.example` as a template.
- Public API routes are rate-limited (`server/_core/rateLimit.ts`), request
  bodies are limited to 1 MB, and security headers are set on every response.
- Administrative procedures (manual catalog sync, schedule management, owner
  notifications) require an admin session.
- External fetches use timeouts; scheduled syncs are coalesced so concurrent
  triggers cannot duplicate remote work.
- GitHub Secret Scanning and Push Protection are enabled on this repository.

## Out of Scope

- Vulnerabilities in third-party services the app calls (search, Wikipedia,
  translation providers). Please report those to the respective providers.
