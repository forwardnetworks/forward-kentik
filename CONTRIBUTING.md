# Contributing

This repository is a public Forward field integration. Contributions should keep
the workflow safe for presales and customer review.

## Before Opening a PR

Run:

```bash
npm run ci
```

Do not include:

- Kentik API tokens.
- Forward credentials.
- Customer flow exports.
- Tenant-specific reports.
- Local `.env` files.

## Design Rules

- Keep Kentik data as evidence, not source of truth.
- Keep Forward as the verification engine for modeled network intent.
- Keep imports dry-run first and create-missing-only.
- Keep Data Connector artifacts optional; they do not create intent checks.
- Keep generated maps marked for review.

## Pull Request Expectations

Include:

- What changed.
- How it was tested.
- Whether the change affects import/apply behavior.
- Whether screenshots need to be regenerated.

Changes that affect `--apply`, reconciliation, location mapping, or credential
handling need tests.
