# RBAC Model

Use separation of duties across Kentik evidence export, package review, and
Forward apply. One principal should not own unreviewed package generation and
unrestricted Forward writes.

| Role | Allowed | Not allowed |
| --- | --- | --- |
| Kentik evidence exporter | Run Kentik query/export and produce raw evidence. | Hold Forward write credentials or approve apply. |
| Package reviewer | Inspect normalized flows, location map, generated checks, and dry-run report. | Push checks without a separate apply role. |
| Location map reviewer | Approve source/destination mapping to Forward hosts/devices. | Treat raw telemetry IPs as business intent without review. |
| Forward import applier | Run create-missing-only `--apply` after review. | Update changed checks or delete stale checks automatically. |
| Runtime administrator | Manage local runtime, package handoff, logs, metrics, and secret references. | Commit credentials or live customer exports. |
| Security reviewer | Review artifacts, SBOM, dependency audit, and sensitive-content scan. | Bypass package checksum or dry-run gates. |

## Rules

- Forward credentials stay outside Kentik and source control.
- Production apply requires a recorded run ID, package ID, reviewer, target
  network ID, snapshot ID, and change window.
- Changed/stale automation remains disabled until a separate approval workflow
  and mutation budget exist.
- Access should be reviewed after incidents and at least quarterly for recurring
  customer workflows.
