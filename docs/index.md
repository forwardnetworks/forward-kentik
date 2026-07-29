# Documentation

## Understand the Integration

- [Architecture](../ARCHITECTURE.md): components, trust boundary, and write
  safety.
- [Workflow](workflow.md): presales story, package flow, and integration
  boundary.
- [Forward ingest contract](forward-ingest-contract.md): generated package and
  intent-check shape.
- [Field integration guidelines](field-integration-guidelines.md): public
  positioning, branding, and support boundary.

## Evaluate and Operate

- [Demo data](demo-data.md): safe offline fixtures and seeded demo evidence.
- [Kentik API](kentik-api.md): authentication, query path, and live smoke.
- [Operator runbook](operator-runbook.md): export through post-apply reconcile.
- [Customer acceptance checklist](customer-acceptance-checklist.md): required
  review before apply.
- [Incident response](incident-response.md): failed and partial import triage.

## Govern Writes

- [RBAC](rbac.md): separation of export, review, and apply duties.
- [Approval workflow](approval-workflow.md): optional signed approval for
  changed and stale lifecycle actions.

## Deploy and Release

- [Runtime templates](runtime-templates.md): optional systemd and Kubernetes
  examples.
- [Release provenance](release-provenance.md): checksums, signatures, SBOM, and
  attestations.
- [Release notes](release-notes.md): version history.
- [Validation matrix](validation-matrix.md): automated, manual, and live proof.
- [Production hardening](production-hardening.md): implemented controls and
  external production requirements.
- [Support policy](../SUPPORT.md) and [security policy](../SECURITY.md).

## Maintain the Harness

- [Harness engineering](harness-engineering.md): fixture and smoke-test model.
