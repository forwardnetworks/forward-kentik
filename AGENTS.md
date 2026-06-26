# Agent Map

This repository is a Forward field integration for turning Kentik flow evidence
into Forward intent-check import packages.

Use this file as the map. Keep detailed decisions in `docs/` and executable
checks in `scripts/` or `test/`.

## Start Here

- [README.md](README.md): project shape, commands, and current status.
- [docs/workflow.md](docs/workflow.md): presales demo flow and integration boundary.
- [docs/kentik-api.md](docs/kentik-api.md): Kentik auth, query path, and live-smoke notes.
- [docs/forward-ingest-contract.md](docs/forward-ingest-contract.md): generated package shape.
- [docs/field-integration-guidelines.md](docs/field-integration-guidelines.md): public branding and support boundary.
- [docs/operator-runbook.md](docs/operator-runbook.md): field workflow from export to post-apply reconcile.
- [docs/demo-data.md](docs/demo-data.md): offline fixture strategy.
- [docs/validation-matrix.md](docs/validation-matrix.md): what is verified now.
- [docs/harness-engineering.md](docs/harness-engineering.md): harness model for this repo.

## Non-Negotiables

- Do not commit Kentik or Forward credentials.
- Kentik data is evidence, not source of truth. Forward verifies the modeled network.
- The primary workflow is offline: export candidate checks, review, then import create-missing-only.
- MVP has no scheduling; push requires explicit operator action.
- Dashboard should mirror Forward Exposure Analysis: vendor evidence, Forward correlation, intent-check output.
- Use `forward:location-map` to create a reviewed starting map from Forward device inventory.
- Data Connector artifacts are optional NQE visibility aids; they do not create intent checks.
- Keep the normalized flow schema provider-neutral so NetFlow/IPFIX/sFlow collectors can plug in later.
- Prefer replayable fixtures and smoke harnesses before live API work.

## Local Verification

```bash
npm run ci
```

Fast loop:

```bash
npm run kentik:export
npm run kentik:seed:demo
npm run forward:import -- --validate-only --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json
npm test
npm run workflow:smoke
npm run repo:validate
```
