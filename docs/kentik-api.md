# Kentik API Notes

## Auth

Kentik V5 APIs use two headers:

- `X-CH-Auth-Email`
- `X-CH-Auth-API-Token`

The local token file may contain only a token, `email:token`, token/email lines,
or env-style `KENTIK_EMAIL=` and `KENTIK_TOKEN=` entries. If it also contains a
portal password, the tooling ignores that password. Set `KENTIK_EMAIL` only when
the file does not contain an email.

## API Hosts

Use the region-specific API host:

- US: `https://api.kentik.com`
- EU: `https://api.kentik.eu`

The portal URL is useful for review links:

- US portal: `https://portal.kentik.com`

## Query API

The V5 Query Data method posts to:

```text
/api/v5/query/topXdata
```

The easiest safe path is to build a query in Kentik Data Explorer, choose
`Show API Call`, copy the data-query JSON, and save it as a local query file.

This repo includes a starter query at `docs/examples/top-flows-query.json`, but
real accounts may need dimensions adjusted to match available device data and
custom dimensions.

If a query omits `device_name`, `kentik:live:smoke` reads `/api/v5/devices` and
injects all configured device names before posting the Query API request. In
this API shape, `device_name` is sent as a comma-delimited string.

## Live Smoke

```bash
export KENTIK_EMAIL=<user@domain.example>
export KENTIK_TOKEN_FILE=~/kentik.token
npm run kentik:live:smoke -- --query docs/examples/top-flows-query.json --out fixtures/live-topxdata.json
```

The smoke command writes only the response body. Do not commit live output if it
contains customer-sensitive traffic.

## Portal Demo Seed

The trial/demo portal account can expose dashboard templates even when it has no
queryable flow devices. `kentik:seed:demo` logs into the portal UI API, fetches
dashboard and saved-view metadata, removes user/company identifiers, and writes
a synthetic `topXdata` fixture.

```bash
npm run kentik:seed:demo
npm run kentik:export -- --input dist/kentik-topxdata.seeded-demo.json
```

This is not observed flow evidence. It is a development and demo harness for
the Forward package path.

## Sources

- Kentik Query API: https://kb.kentik.com/docs/query-api
- Kentik APIs overview: https://kb.kentik.com/docs/apis-overview
