# Implementation plan

The verbatim request is [docs/initial-prompt.md](../docs/initial-prompt.md). This file is the working plan.

## Risks

- Facebook's Activity Log changes and is not a stable API. Guessed selectors would delete the wrong row or fail closed too late. Live automation stays off until selectors are observed.
- Dates in the UI are often relative or month-only. Deleting those would cross the requested boundary. Coarse dates are eligible only when the entire period is inside the filter.
- A crash between a click and the database write can leave the outcome unknown. Those rows are not retried.
- Name-only protection can match the wrong person. Conflicting profile URLs do not match. Partial names go to review.
- Family keywords can over-protect ("birthday" on a public page). That is the chosen failure direction.
- `better-sqlite3` is a native module. Node 22 is the development target. Node 24 is also covered by `engines` `>=22`.

## Decisions

- Timezone default: `America/Sao_Paulo`. `--before` and `--after` are exclusive. `--from`, `--to`, and `--year` are inclusive.
- Strongest preservation wins. A keyword plus an unknown date is `never_delete`, not merely review. That stops approval from overriding the keyword.
- Activity id is a SHA-256 fingerprint. Tracking query parameters are stripped before hashing.
- Confirmation phrase hashes the authorized ids. `--limit` is part of the set.
- Config file and SQLite protection rows are merged at runtime. A database person with the same profile id, profile URL, or folded name replaces the YAML person.
- YAML `family_memories.enabled` defaults to true. There is no CLI flag to disable protection.
- The image module is an explicit stub. Photos stay `unclassified` and require review.
- Fixture HTML is a test seam. It is not documented as Facebook's DOM.
- Review and simulation show the saved text and a link only for an https address on facebook.com or fb.com. Session parameters are dropped. The page does not embed remote images.
- The scan screen sends the contents of a file the user picks. The browser path is ignored. The copy is stored under the app home and is read only if it contains fixture items. A local file is read in pages of 200 and continues through pages that are already stored, until the file ends or the page cap. Live scrolling keeps the smaller stop.
- The profile address at the top is a local label. A chosen file may be the official Facebook HTML export. Posts and comments in that export are read locally. The whole folder is not uploaded at once. Live Activity Log automation stays off.
- Live deletion after the HTML import is described in [docs/live-deletion-plan.md](../docs/live-deletion-plan.md). A confirmed post delete opens the stored address and moves that post to the trash. If that address already opens on Registro de atividades and Nada para mostrar, and the saved text is absent, the post is already gone and is marked deleted with no click. The account owner empties the trash. The local page does not do this. Automated tests do not open the browser.
- Opening the review list does not move a `deleted` or `requires_review` row back to eligible. Deleted rows are left out of that list. A row in review stays visible there and is not selected by the next deletion.
- The home stored count and the by-year counts omit rows whose status is `deleted`. The review screen asks for one calendar year at a time. Its year menu is 2004 through the current year and does not read years from stored posts.
- A delete run includes every eligible row unless `--limit` is passed. One browser window stays open for the run and waits until the page shows the saved text or the empty activity screen before it clicks.
- Code, comments, documentation, and commit messages are English. User-facing copy stays in `web/src/i18n`.
- License: MIT.

## Phase 1 — Foundation (this checkout)

- [x] Save the original prompt.
- [x] TypeScript strict, ESLint, Prettier, Vitest, Playwright test config, Commander CLI.
- [x] SQLite schema, migrations, repositories, indexes.
- [x] Date filter, classification, dedup, pagination stop, state machine.
- [x] Protection engine, manual review, preview groups, export.
- [x] Deletion dry-run, confirmation, verifier, crash recovery.
- [x] Fixture scan and resume.
- [x] Tests for the safety cases listed in the spec.
- [ ] Live Facebook selectors. Not part of this phase.

## Phase 2 — Browser and authentication

- [ ] Persistent Playwright context in `src/browser/browser-manager.ts`.
- [ ] Manual login, including 2FA typed by the user. No password field filled by the program.
- [ ] Reuse the profile in `~/.fb-cleaner/browser-profile`.
- [ ] Navigate to the Activity Log only through validated selectors.
- [ ] Stop when a checkpoint or rate-limit dialog appears.

Manual check: log in on a test account, complete a challenge by hand, quit, run `login` again, and confirm the session is still signed in without the program reading cookies into the database or logs.

## Phase 3 — Discovery on the real Activity Log

- [ ] Replace the fixture source with an adapter that reads one screen at a time.
- [ ] Map English and Portuguese accessible names observed in Phase 2.
- [ ] Record rows that cannot be classified as `unknown`.
- [ ] Keep the stagnation and max-page stops.

Manual check: scan a short date range, compare 20 rows with what the Activity Log shows, and confirm unknown dates were not marked eligible.

## Phase 4 — Deletion of posts, then comments

- [ ] One handler at a time. Posts first, comments second.
- [ ] Confirm the targeted row's permalink or preview before the click.
- [ ] Require a visible "removed" signal before status `deleted`.
- [ ] Leave reactions and media on the review path until their handlers exist.

Manual check: dry-run, then delete one post with `--limit 1` on a disposable account, and confirm the row is gone and the database says `deleted` only after that.

## Phase 5 — Reliability

- [ ] SIGINT during a live run.
- [ ] Checkpoint resume against the real scroll position, not only the fixture.
- [ ] Locale pass for pt-BR and en on the same account if both are available.
- [ ] Failure budget and checkpoint dialog stop.

## Phase 6 — Polish

- [ ] CLI copy pass.
- [ ] Package the `fb-cleaner` bin.
- [ ] Security review of logs, file modes, and the HTML report.
- [ ] Re-read `AGENTS.md` and delete any instruction that no longer matches the code.

## Acceptance still open

The original MVP is not done. These items remain:

- Manual authentication against Facebook.
- A scan of the real Activity Log.
- A verified live deletion of the user's own post or comment.

These items are done for the local pipeline: date filters, preview, dry-run, explicit confirmation, protection that cannot be skipped, unknown dates, resume of a fixture scan, and automated tests.
