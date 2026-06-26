# Workflow

## Demo Story

1. A network team already has Kentik flow data.
2. The integration queries top observed flows for a recent window.
3. The tool normalizes those rows into a provider-neutral observed-flow model.
4. Eligible flows become Forward candidate intent checks.
5. An operator reviews the package, imports selected checks, and lets Forward
   verify the modeled network.

The dashboard mirrors Forward Exposure Analysis: Kentik evidence appears on the
left, Forward modeled correlation in the middle, and candidate intent checks on
the right. The operator can export the package, dry-run reconciliation, or push
missing checks.

The importable boundary is endpoint resolution. A Kentik row with source and
destination IPs is a candidate; it becomes a Forward intent check only when
those endpoints map to Forward hosts or reviewed aliases in the target network.

When a Kentik trial account has no configured devices, use `kentik:seed:demo`
to build a synthetic top-flow fixture from sanitized portal dashboard metadata.
That is demo scaffolding only; real customer value comes from live Query API
rows or collector exports.

## Screenshots

The repo includes generated demo boards under `docs/assets/screenshots/`. They
are generated from local artifacts with:

```bash
npm run kentik:export
npm run dashboard:build
npm run screenshots:render
```

These images are public-doc assets, not captured Forward product screenshots.

`05-dashboard-correlation.png` is a browser screenshot of the generated
dashboard with mapped demo evidence.

## Why Kentik First

Kentik is attractive for the first vendor adapter because it has:

- A real Query API for flow-backed network data.
- A normal API token plus email auth model.
- Data Explorer "Show API Call" output that can seed repeatable queries.
- Customer relevance for at least one active Forward field motion.

## Later Adapter Targets

The normalized flow model should also support:

- Akvorado exports.
- GoFlow2 JSON streams.
- ManageEngine NetFlow Analyzer REST or CSV exports.
- SolarWinds NTA SWIS/SWQL exports.
- Generic NetFlow/IPFIX/sFlow collector exports.

## Review Gate

The workflow intentionally generates a package before writing to Forward. The
importer runs dry-run by default, reports create/unchanged/changed/stale checks,
and only creates missing checks when `--apply` is present.

`--apply` performs Forward host preflight before posting. Raw telemetry that
does not resolve in Forward should be fixed with customer-specific mapping or
left as review-only evidence.

## Data Connector Scope

Data Connectors are not the primary path because they expose data to NQE rather
than creating intent checks. Keep them as an optional visibility aid for
`observed-flows.json`; use the offline importer for actual intent-check
onboarding.
