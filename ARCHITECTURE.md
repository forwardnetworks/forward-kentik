# Architecture

Forward Integration for Kentik is an operator-run Node.js workflow. It reads
Kentik flow evidence, creates a reviewable offline package, and reconciles that
package against a selected Forward network. There is no always-on service in
the MVP and no browser-held credential.

## Trust Boundary

```text
Kentik
  Query API or reviewed JSON export
       |
       | observed flow evidence
       v
Forward Integration for Kentik
  normalize -> map locations -> build package -> review/dry-run
       |
       | explicit operator-approved HTTPS API requests
       v
Forward
  processed snapshots, modeled locations, paths, and intent checks
```

Kentik remains authoritative for observed flow evidence. Forward remains
authoritative for the modeled network, processed snapshots, locations, and
intent-check state. The integration proposes candidate intent; it does not
claim that observed traffic is correct business intent.

## Components

1. `src/kentik-client.mjs` and `src/kentik-portal-client.mjs` obtain live or
   sanitized demo evidence.
2. `src/normalize.mjs` converts provider fields into a provider-neutral flow
   schema.
3. `src/location-map.mjs` applies reviewed Forward location mappings.
4. `src/forward-package.mjs` creates deterministic candidate checks, a manifest,
   and review reports.
5. `scripts/forward-import-package.mjs` validates integrity, resolves the latest
   processed snapshot, dry-runs reconciliation, and applies only explicitly
   allowed mutations.
6. `src/dashboard.mjs` renders bounded evidence and reconciliation summaries;
   it is not a source of truth or a credential store.

## Write Safety

- Dry-run is the default.
- The primary path creates missing managed checks only.
- Changed or stale lifecycle actions require the separate signed approval flow.
- Package checksums, network and snapshot context, location readiness, mutation
  budgets, and post-write readback constrain apply behavior.
- Deletion is not part of the workflow.

See [docs/workflow.md](docs/workflow.md),
[docs/forward-ingest-contract.md](docs/forward-ingest-contract.md), and
[docs/approval-workflow.md](docs/approval-workflow.md) for detailed contracts.
