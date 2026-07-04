# Forward Ingest Contract

## Generated Artifacts

The export command writes:

- `forward-kentik-manifest.json`
- `forward-intent-checks.json`
- `observed-flows.json`
- `forward-kentik-report.json`

The manifest includes `integrity.intentChecksSha256`, a SHA-256 digest of the
exact `forward-intent-checks.json` bytes. The importer rejects a supplied
manifest when this digest does not match the checks artifact.

The importer report includes run ID, package ID, checksum, target network,
target snapshot, timing, and reconciliation counts. `--metrics` writes a
Prometheus-style text file. `--status-artifact` writes a sanitized status JSON
for handoff or dashboard use.

The primary ingest path is the offline importer:

```bash
npm run forward:import -- --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json
npm run forward:import -- --checks dist/forward-intent-checks.json --manifest dist/forward-kentik-manifest.json --apply
```

The first command is a dry run. `--apply` creates missing checks only.

During dry-run and before `--apply`, the importer checks every generated
`HostFilter` and `DeviceFilter` against Forward lookup. Dry-run reports missing
locations; apply fails before posting checks if missing locations remain. This
keeps presales/demo imports from creating invalid intent checks from raw
telemetry IPs.

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
