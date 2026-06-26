# Release Notes

## v0.1.0

Initial public MVP for the Forward Kentik field integration.

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
  workflow smoke, screenshot presence, and importer smoke tests.

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
