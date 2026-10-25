# Agent guide

Read [docs/initial-prompt.md](docs/initial-prompt.md) before changing behavior. It is the original specification and stays verbatim. Record implementation decisions in [plans/README.md](plans/README.md).

## Product rule

The job is to delete unwanted history **and** keep family memories. When a rule is ambiguous, preserve the activity.

## Do not

- Call `graph.facebook.com`, private GraphQL, or any unofficial Facebook endpoint. Browser UI only, and only after selectors are validated.
- Invent CSS selectors and mark them validated. `FACEBOOK_SELECTORS_VALIDATED` and `LIVE_FACEBOOK_AUTOMATION_ENABLED` stay `false` until a person has inspected the current Activity Log and written down the accessible role or name that was observed.
- Ask for, store, or log passwords, cookies, `c_user`, `xs`, or access tokens. The logger redacts those strings. Do not bypass that helper.
- Put a remote image URL in the review page. That would make the user's browser contact Facebook.
- Flip dry-run off by default. `--execute` without the confirmation phrase must do nothing destructive.
- Add a flag, API field, or screen control that disables protection. `--no-respect-protection` and `disableProtection` are errors.
- Let the local UI call Facebook or expose a live delete action. Simulation is the only deletion path in the interface.
- Delete an activity with unknown ownership, unknown type, or an unknown date. A keyword or explicit protect still means never delete, even if the date is missing.
- Retry a deletion whose result was uncertain. Those rows stay `requires_review` until a person reviews that specific activity.
- Mark an activity `deleted` without an observation whose outcome is `deleted` and whose detail is non-empty.
- Run a destructive test against a real Facebook account. Use `tests/fixtures/activity-log.html`.
- Widen a date filter because a scan found nothing. Resume must reuse the stored filter.
- Commit `~/.fb-cleaner`, browser profiles, or SQLite files.

## Do

- Keep Facebook selectors inside `src/facebook/selectors` and handlers.
- Re-check protection immediately before any simulated or future live delete.
- Add a test for a safety change. Run `npm test` before handing the work back.
- Prefer a small change that matches the existing modules over a new framework.

## Status model

`discovered → eligible | skipped | requires_review`

`eligible → pending → deleting → deleted | failed | requires_review`

`deleting` after a crash becomes `requires_review`, not `eligible`. `pending` returns to `eligible`. `failed` may be tried again only on a new explicit run. `requires_review` is not selected automatically.

## Date contract

Timezone defaults to `America/Sao_Paulo`. `--before` and `--after` are exclusive. `--from`, `--to`, and `--year` are inclusive. See the README table before changing `src/scanner/filters.ts`.
