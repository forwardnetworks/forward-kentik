# Forward Ingest Contract

## Generated Artifacts

The export command writes:

- `forward-kentik-manifest.json`
- `forward-intent-checks.json`
- `observed-flows.json`
- `forward-kentik-report.json`

The primary ingest path is the offline importer:

```bash
npm run forward:import -- --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json
npm run forward:import -- --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json --apply
```

The first command is a dry run. `--apply` creates missing checks only.

Before `--apply`, the importer checks every generated `HostFilter` against
Forward host lookup. If any source or destination does not resolve in the target
network, the importer fails before posting checks. This keeps presales/demo
imports from creating invalid intent checks from raw telemetry IPs.

## Check Shape

`forward-intent-checks.json` is a `NewNetworkCheck[]` payload.

Current generated checks use:

- `definition.checkType: "Existential"`
- `definition.filters.from.location.type: "HostFilter"`
- `definition.filters.to.location.type: "HostFilter"`
- `definition.filters.from.headers` for `ip_proto` and `tp_dst`
- `definition.filters.flowTypes: ["VALID"]`

`HostFilter` values must be resolvable in the target Forward network at import
time. If Kentik reports raw IPs that Forward has not learned as hosts, keep those
rows as review candidates until a mapping exists.

## Tags

Each generated check includes:

- `kentik`
- `observed-flow`
- `kentik-key:<stable-key>`
- `protocol:<protocol>`
- `port:<port>` when known
- `app:<application>` when known

The `kentik-key:*` tag is the reconciliation key.

## Import Policy

Default import policy should be create-missing-only. Changed and stale
Kentik-managed checks should be reported until a reviewed lifecycle policy
exists.

## Data Connector Note

Forward Data Connectors bring external data into NQE. They are useful if a demo
or customer workflow wants to query `observed-flows.json` from NQE, but they do
not create intent checks. This field integration therefore treats Data Connector
configuration as optional, secondary evidence visibility rather than the main
ingest workflow.
