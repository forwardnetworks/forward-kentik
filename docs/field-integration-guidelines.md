# Field Integration Guidelines

## Positioning

Call this project a "Forward field integration".

Do not call it:

- A Forward product integration.
- A supported Forward module.
- A bundled Kentik connector.
- A replacement for Forward intent modeling or customer review.

## Demo Story

The correct story is:

1. Kentik provides observed flow evidence.
2. The integration normalizes that evidence.
3. The operator reviews correlation to modeled Forward locations.
4. The integration exports candidate intent checks.
5. The importer dry-runs and reconciles against a Forward snapshot.
6. The operator explicitly pushes missing checks.
7. Forward verifies whether the modeled network satisfies the intent.

No automated scheduling is part of the MVP.

## Branding

Use "Forward" for the company and platform name. Use "Forward Networks" when
referring to the company in legal or repository metadata.

Use "Kentik" only to describe the external source system.

Use "intent checks" or "Forward intent checks" for the generated output. Avoid
phrases that imply Kentik creates, owns, or verifies the intent.

## Support Boundary

This repository is public and open source. It is provided as field enablement
and reference implementation material.

Production customer use requires customer-specific review of:

- Kentik query dimensions and retention.
- Forward network and snapshot selection.
- Endpoint-to-location mapping quality.
- Intent check naming and tags.
- Change-management approval before `--apply`.

## Data Handling

Do not commit:

- Kentik API tokens.
- Forward credentials.
- Live customer flow exports.
- Local `.env` files.
- Tenant-specific reports unless explicitly sanitized.

Synthetic fixtures must be labeled as synthetic. Live outputs should remain in
ignored local paths such as `dist/` or `fixtures/live-*.json`.

## Production Grade Bar

Public changes should keep these gates green:

- Repository validation.
- Unit tests.
- Export smoke.
- Import smoke against fake Forward API.
- Screenshot rendering.

When live API behavior changes, update docs and tests together.
