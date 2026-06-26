# Harness Engineering

This repo follows the harness-engineering model from OpenAI's
`Harness engineering for context engineering`: make the work legible to agents,
put durable context in the repo, and enforce important behavior mechanically.

## Applied Here

| Harness concept | Local implementation |
| --- | --- |
| Repo-local knowledge | `README.md`, `docs/workflow.md`, `docs/kentik-api.md` |
| Agent map | Compact `AGENTS.md` with links to deeper docs |
| Boundary clarity | Kentik exports evidence; Forward import writes checks |
| Reproducible context | Offline Kentik fixture in `fixtures/` |
| Executable checks | `npm run repo:validate`, `npm test`, `npm run workflow:smoke` |
| Adapter isolation | Kentik-specific parsing stays before the normalized flow model |
| Demo-data fallback | `npm run kentik:seed:demo` turns portal catalog metadata into synthetic flow fixtures |

## Feedback Loop

1. Add or adjust a fixture.
2. Normalize it into observed flows.
3. Generate Forward artifacts.
4. Run `npm run ci`.
5. Promote repeated review comments into docs or validation scripts.

## Source

- OpenAI: https://openai.com/index/harness-engineering/
