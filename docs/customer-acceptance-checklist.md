# Customer Acceptance Checklist

Use this before creating Kentik-managed Forward intent checks in a customer
network.

## Package

- Kentik query dimensions, time range, and retention are understood.
- Live exports contain no credentials and are stored outside Git.
- `npm run kentik:export` completed from the approved input.
- `npm run schemas:validate` passed.
- Manifest `integrity.intentChecksSha256` matches the checks artifact.
- Generated report lists skipped rows and reasons.
- Acceptance bundle was generated with `npm run acceptance:bundle`.

## Mapping

- Location map was generated or reviewed for the target Forward network.
- Raw IP host filters are expected to resolve in Forward, or were mapped to
  reviewed devices/locations.
- Dry-run location readiness reports no unexpected missing hosts/devices.

## Forward

- Forward base URL, network ID, and credentials target the intended tenant.
- Dry-run report shows expected create/unchanged/changed/stale counts.
- Changed and stale checks were reviewed and accepted as report-only.
- Reviewer approved create-missing-only apply.

## Apply And Evidence

- `--apply` report, metrics file, and status artifact were preserved.
- Post-apply dry-run reports `create: 0` and expected unchanged count.
- Any remaining changed/stale drift has an owner and follow-up.
- Package ID, run ID, snapshot ID, operator, reviewer, and change window were
  recorded in the customer handoff notes.
