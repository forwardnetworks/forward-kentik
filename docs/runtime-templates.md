# Runtime Templates

The primary workflow remains manual/offline. Runtime templates are provided only
for deployments that explicitly approve recurring Forward-side imports.

## Systemd

Example files:

- `deploy/systemd/forward-kentik-importer.service`
- `deploy/systemd/forward-kentik-importer.timer`
- `deploy/systemd/forward-kentik.env.example`

Install from a verified release archive, then copy the unit files to
`/etc/systemd/system/` and non-secret settings to `/etc/forward-kentik/`.
Store secrets through the local OS/runtime secret mechanism when available.

## Kubernetes

Example files:

- `deploy/kubernetes/forward-kentik-importer-cronjob.yaml`
- `deploy/kubernetes/forward-kentik-configmap.example.yaml`
- `deploy/kubernetes/forward-kentik-secret.example.yaml`

Pin the image by digest when an image publishing workflow exists. Until then,
build from the verified release archive in the customer-controlled runtime.

## Safety

- Keep the importer dry-run by default unless the deployment explicitly adds
  `--apply` after approval.
- Preserve reports, metrics, and status artifacts after every run.
- Do not put Kentik exports, Forward credentials, or customer-specific package
  URLs into source control.
