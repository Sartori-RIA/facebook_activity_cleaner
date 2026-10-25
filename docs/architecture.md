# Architecture

Facebook Activity Cleaner is a local CLI. The database, config, and future browser profile live under `~/.fb-cleaner`. The process does not upload activity.

```text
CLI (Commander)
  → config and SQLite
  → protection policy
  → scanner or deletion engine
      → fixture source today
      → Facebook adapters later, behind LIVE_FACEBOOK_AUTOMATION_ENABLED
```

## Modules

| Path             | Responsibility                                                                   |
| ---------------- | -------------------------------------------------------------------------------- |
| `src/cli`        | Commands, confirmation text, and process wiring.                                 |
| `src/config`     | YAML schema, paths, directory permissions.                                       |
| `src/database`   | Migrations and repositories. SQL is parameterized.                               |
| `src/scanner`    | Date windows, label classification, fingerprints, pagination stop, fixture scan. |
| `src/protection` | People, keywords, albums, manual review, preview groups.                         |
| `src/deletion`   | State machine, phrase, verifier, engine.                                         |
| `src/facebook`   | Handlers and selector registry. Live methods throw until validation.             |
| `src/browser`    | Profile directory only. Login does not launch Facebook in this build.            |
| `src/review`     | Terminal groups and a self-contained HTML file.                                  |
| `src/logging`    | Pino plus string redaction.                                                      |

## Activity states

```text
discovered → eligible
           → skipped
           → requires_review

eligible → pending → deleting → deleted
                            → failed
                            → requires_review

failed → eligible          (only on a new explicit run, after a certain failure)
requires_review → eligible (only through manual approval of that activity)
deleting → requires_review (crash or uncertain result; not retried automatically)
pending → eligible         (shutdown before the click)
```

`deleted` has no exit. A transition that is not in this list throws.

## Date windows

Filters compile to a half-open instant window `[start, end)` in the configured timezone. An activity is stored with a precision: `instant`, `day`, `month`, `year`, or `unknown`.

- The whole interval inside the window: in scope.
- The whole interval outside: out of scope.
- Partial overlap: ambiguous, review.
- Unknown: never eligible.

## Protection decision

The engine collects every reason, then keeps the most preservative result:

1. Any `protect` reason → `never_delete`. Manual approval does not override this.
2. Confident `not_owned` → not deleted.
3. A manual skip → skipped for now.
4. An approval → eligible only for that activity, and only with a known in-range date, known owner, and a type this policy can accept.
5. Any review reason → `requires_review`.
6. Outside the date window → out of scope.
7. Owned post or comment inside the window with no review reason → eligible.

This is stricter than a first-match reading of the original list. A family keyword plus an unknown date stays `never_delete`, so approval cannot erase the keyword. Reactions are review-only until a handler exists. Media is review-only until a person approves that photo, and this build still will not click Facebook to delete it.

## Scanning

The scanner reads one page at a time and writes each row immediately. Dedup is the fingerprint unique key, not an in-memory set of every id. A page that inserts nothing, or repeats the previous page signature, increases a stagnation counter. The loop also stops at `endReached`, `maxPages`, or abort. An aborted page is resumed from the same page index. Completed pages are not read again. SQLite uniqueness makes a repeated page safe.

The fixture parser understands only `data-fixture-activity` attributes in `tests/fixtures/activity-log.html`. That file is not Facebook's DOM.

## Deletion

Dry-run selects the set, stores a dry-run job, and does not change activity status except for crash recovery (`deleting` → `requires_review`, `pending` → `eligible`).

`--execute` checks the phrase `DELETE <count> ACTIVITIES <8 hex chars>`. The hash covers the sorted ids. The engine then:

1. Refuses if the mode is live or the deleter is unavailable. `LIVE_FACEBOOK_AUTOMATION_ENABLED` is false, so the CLI stops here.
2. Moves the authorized rows to `pending` in one transaction. If any row is no longer eligible, the transaction rolls back.
3. Pauses, reloads the row, and evaluates protection again.
4. Calls the deleter only for posts and comments.
5. Writes the attempt and the new status before the next row.

An empty "deleted" detail is treated as uncertain. A Facebook checkpoint stops the run. Three certain failures stop the run. Neither case deletes the remaining rows.

## Schema

`schema_migrations` applies `src/database/migrations/001_initial.ts`.

Tables: `activities`, `scan_sessions`, `deletion_jobs`, `deletion_attempts`, `checkpoints`, `application_settings`, `protected_people`, `protection_rules`, `protected_activities`, `activity_protection_matches`, `manual_reviews`.

Indexes cover status, type plus date, source URL, ownership, attempts, protection matches, and manual reviews. Profile id and profile URL are unique when present.
