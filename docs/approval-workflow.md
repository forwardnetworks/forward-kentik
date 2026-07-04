# Approval Workflow

Default apply remains create-missing-only. Changed and stale automation is
available only as an explicit Forward-side break-glass path.

## Required Gates

- `--apply`
- `--require-signature`
- `--signature`
- `--public-key`
- `--require-approval-file`
- explicit `--max-updates` and/or `--max-deactivations`
- optional but recommended `--change-window-id`

The package signature covers the exact manifest bytes, a newline, and the exact
checks artifact bytes. The approval file names exact `kentik-key:*` values from
the current dry-run.

Sign the package after schema validation:

```bash
npm run forward:sign -- \
  --checks dist/forward-intent-checks.json \
  --manifest dist/forward-kentik-manifest.json \
  --private-key /secure/path/forward-kentik-package-private.pem \
  --signature dist/forward-kentik-package.sig
```

## Approval File

```json
{
  "schemaVersion": "forward-kentik-approval/v0.1",
  "packageId": "kentik-forward-example",
  "changeWindowId": "CHG-12345",
  "expiresAt": "2026-07-10T23:59:59.000Z",
  "approvedBy": "operator@example.com",
  "reason": "Approved generated intent refresh",
  "approvedChangedKeys": [
    "kentik-key:kentik:checkout:branch-a:dc-east:10.20.10.15:172.16.40.20:tcp:443"
  ],
  "approvedStaleKeys": [
    "kentik-key:kentik:old-app:branch-a:dc-east:10.20.10.16:172.16.40.21:tcp:8443"
  ]
}
```

## Apply

```bash
npm run forward:import -- \
  --checks dist/forward-intent-checks.json \
  --manifest dist/forward-kentik-manifest.json \
  --signature dist/forward-kentik-package.sig \
  --public-key /secure/path/forward-kentik-package-public.pem \
  --require-signature \
  --require-approval-file approval.json \
  --change-window-id CHG-12345 \
  --apply \
  --apply-updates \
  --deactivate-stale \
  --max-updates 10 \
  --max-deactivations 10
```

Changed checks are replaced by deleting the existing generated check and posting
the approved generated check. Stale checks are deleted. Unknown keys, expired
approval files, package mismatches, signature failures, and budget overages fail
before mutation.
