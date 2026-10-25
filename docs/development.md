# Development

## Setup

```bash
npm install
npm test
npm run lint
npm run typecheck
```

`npm test` is Vitest. It uses an in-memory SQLite database and the HTML fixture. It does not open Facebook and it does not download a browser.

Browser coverage of the fixture, still without Facebook:

```bash
npx playwright install chromium
npm run test:browser
```

## Useful scripts

```bash
npx tsx src/cli/index.ts --help
npx tsx src/cli/index.ts scan --fixture tests/fixtures/activity-log.html --before 2017-01-01 --home /tmp/fb-cleaner-dev
```

Pass `--home` so a local experiment does not write to your real `~/.fb-cleaner`.

## Tests worth keeping

- Date boundaries, including São Paulo and New York midnight, live in `tests/unit/dates-and-filters.test.ts`.
- Protection priority and approval limits live in `tests/unit/protection-engine.test.ts`.
- Dry-run, confirmation, uncertain results, and crash recovery live in `tests/unit/deletion-and-safety.test.ts`.
- Fixture scan, resume, and the CLI live in `tests/integration/persistence-and-cli.test.ts`.

Add a test next to the behavior you change. A safety change without a failing test first is how a protected post gets deleted later.

## Fixtures

`tests/fixtures/activity-log.html` is our own markup. Attributes are `data-fixture-activity`, `data-type`, `data-date`, and so on. Do not copy Facebook class names into it and then treat the test as proof the live site works.

## Native module

`better-sqlite3` compiles or downloads a prebuild for the local Node version. If install fails, use the current Node 22 LTS and a working C toolchain (`python3`, `make`, a C compiler).

## Before enabling live automation

1. Inspect the real Activity Log while logged in as the account owner.
2. Write the observed accessible names into the selector registry and set `validated: true` only on the slots you actually saw.
3. Set `LIVE_FACEBOOK_AUTOMATION_ENABLED` in a change that updates `docs/limitations.md` with the date and the UI language you checked.
4. Keep dry-run as the default. Keep protection on. Keep uncertain results in `requires_review`.
