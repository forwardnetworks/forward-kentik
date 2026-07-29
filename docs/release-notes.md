# Release Notes

## Unreleased

### Added

- Public quick start, documentation index, architecture, and support policy.
- README validation for every required screenshot and local image target.
- Pixel-level screenshot verification that ignores PNG compression differences.
- Immutable GitHub Action pins with a regression validator.
- Release tag/version validation and post-publication checksum/attestation
  verification.
- CycloneDX SBOM as a checksummed and attested release artifact.

### Changed

- Node.js support is pinned to the Node 24 release line for reproducible demo
  screenshot generation.
- Dependency auditing now includes the development toolchain used to build and
  validate release archives.

## v0.1.3

Live compatibility fallback patch.

### Added

- `kentik:live-or-seed:smoke` tries the Kentik Query API first, then falls back
  to sanitized portal-seeded demo data only when the Kentik account has no
  queryable devices.
- The GitHub live compatibility workflow now uses that command and accepts
  `KENTIK_PORTAL_PASSWORD` for the fallback path.

### Fixed

- Portal auth can now be supplied entirely from environment variables in CI
  without requiring a local `~/kentik.token` file.

## v0.1.2

Forward location semantics patch.

### Changed

- Unmapped raw Kentik packet IPs now generate `SubnetLocationFilter` locations,
  matching Forward path-search source/destination IP behavior.
- Reviewed location maps may still override endpoints to `HostFilter`,
  `DeviceFilter`, or `InterfaceFilter`.
- Importer dry-run/status artifacts now count `SubnetLocationFilter` locations
  separately while preserving host/device preflight checks.

### Validation

- Full CI passed.
- Kentik portal-seeded dummy data validated through export, schema validation,
  Forward dry-run, reviewed location-map dry-run, and dashboard generation.

## v0.1.1

Production hardening release for Forward Integration for Kentik.

### Added

- Manifest and intent-check JSON schema validation in CI.
- SHA-256 integrity metadata for generated intent-check packages and importer
  checksum verification before Forward API calls.
- Approval-gated changed-check updates, stale-check deactivation, package
  signature verification, and change-window metadata for controlled applies.
- Runtime metrics/status artifacts, release archive checksums, optional detached
  release signatures, and acceptance bundle generation.
- GitHub release workflow, live compatibility workflow, Dependabot, CODEOWNERS,
  hardened CI permissions, and branch-protection-ready status checks.
- Systemd and Kubernetes runtime templates plus production hardening, RBAC,
  approval workflow, incident response, and acceptance checklist documentation.

### Changed

- Public naming now uses "Forward Integration for Kentik" instead of a product
  style name.
- Kentik and Forward API callers now use explicit timeout and retry behavior.
- Import dry-runs perform Forward host/device preflight checks by default.

## v0.1.0

Initial public MVP for Forward Integration for Kentik.

### Included

- Kentik `topXdata` export normalization into a provider-neutral observed-flow
  model.
- Forward `NewNetworkCheck[]` package generation with stable `kentik-key:*`
  metadata for reconciliation.
- Reviewed source and destination location mapping, including Forward device-map
  template generation from a target network.
- Create-missing-only Forward importer with dry-run default, explicit `--apply`,
  latest processed snapshot resolution, and host/device preflight.
- Forward-styled exposure dashboard showing Kentik evidence, modeled Forward
  correlation, and generated intent-check candidates.
- Optional Data Connector config generation for NQE visibility of normalized
  evidence.
- Public demo screenshots and seeded demo fixture with no committed customer
  data or credentials.
- CI gates for repo hygiene, export generation, dashboard rendering, unit tests,
  workflow smoke, screenshot presence, schema/checksum validation, scale smoke,
  release archive/checksum/signing smoke, acceptance bundle generation,
  dependency audit/SBOM signal, linting, and importer smoke tests.

### Not Included

- Scheduling or background automation.
- Automatic intent creation without operator review.
- Product support status beyond the field-integration boundary.
- A generic NetFlow/IPFIX/sFlow adapter; the normalized flow model is ready for
  one, but Kentik Query API is the first concrete adapter.

### Validation

Run the public release gate with:

```bash
npm run ci
```

The live Kentik and Forward tenant checks remain manual because they require
customer- or demo-tenant credentials.
