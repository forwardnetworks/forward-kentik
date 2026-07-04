# Incident Response

Use this when import validation fails, Forward apply partially succeeds, or
drift appears unexpectedly.

## Triage

1. Stop rerunning `--apply` until package validation and dry-run pass.
2. Preserve the manifest, checks package, import report, status artifact,
   metrics file, and terminal logs.
3. Record run ID, package ID, Forward network ID, snapshot ID, operator, and
   change window.
4. Do not edit generated checks in Forward until changed/stale drift is
   understood.

## Failure Classes

| Failure | First action |
| --- | --- |
| Manifest checksum mismatch | Reject package; regenerate export; inspect handoff path. |
| Stale manifest | Regenerate package or raise package age only with reviewer approval. |
| Missing Forward credential | Fix runtime/operator secret injection; do not commit credentials. |
| Forward 401/403 | Rotate or rescope credentials; confirm tenant/network permission. |
| Forward 429/5xx | Let retry budget run; reduce batch size or retry later. |
| Forward 4xx on create | Treat as mapping/config error; inspect location readiness and rejected row. |
| Missing location readiness | Review or regenerate the Kentik-to-Forward location map. |
| Changed drift | Review generated field differences; do not overwrite automatically. |
| Stale drift | Review service retirement or source query scope; do not delete automatically. |
| Partial bulk create | Rerun dry-run; apply only remaining missing checks when policy allows. |

## Recovery

1. Run `npm run schemas:validate`.
2. Run `npm run forward:import -- --validate-only ...`.
3. Run dry-run and compare counts with the failed run.
4. If only missing checks remain and the reviewer approves, rerun `--apply`.
5. Close only after post-apply dry-run reports `create: 0`, expected unchanged
   count, and no unresolved changed/stale drift.

## Post-Incident

- Add a regression test when the failure was deterministic.
- Update validation if malformed artifacts reached Forward calls.
- Rotate credentials if logs or artifact storage may have exposed secrets.
