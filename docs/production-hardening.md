# Production Hardening

This repository remains a Forward field integration, not an officially
supported Forward product integration. Use this checklist before wider
customer use.

## Implemented

- Dry-run default and explicit `--apply`.
- Create-missing-only apply policy.
- Reconciliation by exactly one `kentik-key:*` tag.
- Changed and stale Kentik-managed checks are report-only.
- Manifest schema validation and exact checks-artifact SHA-256 verification.
- Dry-run/apply location readiness against Forward host and device lookups.
- Structured reports with run ID, package checksum, timing, target network,
  target snapshot, metrics output, and sanitized status artifact output.
- Bounded retry and request timeout controls for Forward and Kentik API calls.
- Incident response, RBAC, and customer acceptance checklist docs.
- CI gates for repo hygiene, JSON schemas, unit tests, workflow smoke, importer
  smoke, scale/idempotence smoke, dependency audit, SBOM generation, and lint.
- Release archive and `SHA256SUMS` generation for verifiable handoff.
- Optional detached Ed25519 signatures for release checksums and intent
  packages.
- GitHub release workflow with archive provenance attestation.
- Read-only acceptance bundle generation.
- Optional systemd and Kubernetes runtime templates.
- Approval-gated changed/stale lifecycle automation with exact key approvals,
  signature verification, change window matching, and mutation budgets.
- Public demo fixtures and screenshots with no committed credentials.

## External Before Production Use

- Assign an accountable owner for the Forward-side import runtime.
- Store Forward credentials only in the operator/runtime secret store.
- Record reviewer identity, package ID, Forward network ID, snapshot ID, and
  change window before `--apply`.
- Run at least one non-production Forward network validation covering create,
  unchanged, changed, stale, location-missing, and retry paths.
- Decide whether checksum-only integrity is sufficient or whether detached
  package signing is required for the customer handoff model.

## Future Productization

- Published container image and image provenance if scheduled import is approved
  and an image is the selected runtime.
- Centralized metrics/log shipping from importer reports.
- Approval-gated changed/stale lifecycle automation, if a deployment needs it.
