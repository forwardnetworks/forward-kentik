# Validation Matrix

| Area | Status | Command |
| --- | --- | --- |
| Repo map and required docs | Automated | `npm run repo:validate` |
| No committed local token paths or token-shaped secrets | Automated | `npm run repo:validate` |
| Kentik response row extraction | Automated | `npm test` |
| Portal catalog sanitization and seeded fixture generation | Automated | `npm test` |
| Normalized flow validation | Automated | `npm test` |
| Forward location-map template generation | Automated unit tests; manual against tenant | `npm test`, `npm run forward:location-map` |
| Forward check generation | Automated | `npm test` |
| Exposure-style dashboard generation | Automated | `npm run dashboard:build`, `npm test` |
| Dashboard local server and action endpoint | Automated | `npm test` |
| Forward package validation and reconciliation | Automated | `npm test`, `npm run forward:import:smoke` |
| Forward host preflight before apply | Automated against fake API; manual against tenant | `npm run forward:import:smoke`, `npm run forward:import -- --apply` |
| End-to-end fixture export | Automated | `npm run workflow:smoke` |
| Demo screenshots from generated artifacts | Automated | `npm run screenshots:render` |
| Live Kentik auth and query | Manual | `npm run kentik:live:smoke` |
| Portal dashboard seed | Manual | `npm run kentik:seed:demo` |
| Forward API import | Automated against fake API; manual against tenant | `npm run forward:import:smoke`, `npm run forward:import` |
| Optional NQE Data Connector config | Automated | `npm test`, `npm run forward:data-connector` |
