# Support Policy

## Field Preview

The latest `0.x` release is intended for controlled demonstrations,
non-production evaluation, and integration prototyping. This repository is a
Forward field integration, not an officially supported Forward product.

Field-preview help covers release verification, fixture-backed evaluation,
Kentik query compatibility, Forward dry-run behavior, location mapping, and the
documented approval and incident workflows. It does not include a production
availability SLA, customer credential custody, or operation of a customer's
change process.

## Request Help

Use a GitHub issue for non-sensitive defects and documentation problems. Include
the release, Node version, sanitized reproduction steps, expected behavior, and
business impact.

Never include credentials, tenant URLs, live flow rows, hostnames, detailed path
topology, or authenticated API responses in a public issue. Use the private
reporting path in [SECURITY.md](SECURITY.md) for suspected vulnerabilities.

## Version Policy

- Reproduce on the latest preview before requesting a code fix.
- Published tags and release artifacts are immutable.
- Fixes are delivered in a new semantic version; releases are not replaced.
- Production use requires named operational ownership, customer-specific
  acceptance, and completion of the external controls in
  [docs/production-hardening.md](docs/production-hardening.md).
