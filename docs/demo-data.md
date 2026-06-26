# Demo Data

`fixtures/kentik-topxdata.demo.json` mimics a Kentik Query Data response:

- `results[].data[]` rows.
- Source and destination IP dimensions.
- Protocol and destination-port dimensions.
- Aggregate volume fields.
- Optional app and site labels.

The fixture is synthetic. It is designed to exercise:

- Successful TCP check generation.
- Successful UDP check generation.
- Skip behavior when a row is missing a required destination port.
- Stable names and reconciliation tags.

Run:

```bash
npm run kentik:export
```

## Portal Dashboard Seed

The current Kentik trial/demo account has portal dashboard and saved-view
templates, but no flow devices or sites. Use the seed command to create a local,
sanitized demo fixture from that catalog:

```bash
npm run kentik:seed:demo
npm run kentik:export -- --input dist/kentik-topxdata.seeded-demo.json
```

The seed command writes:

- `dist/kentik-demo-catalog.json`
- `dist/kentik-topxdata.seeded-demo.json`

This seeded fixture is synthetic. It preserves dashboard titles/categories as
demo provenance, but it invents source/destination IPs, ports, protocols, and
volumes so the Forward package generator has realistic rows to process.
