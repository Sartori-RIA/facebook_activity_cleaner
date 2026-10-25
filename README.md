# Facebook Activity Cleaner

Local command-line tool for deleting **your own** historical Facebook activity while keeping family memories.

It is not affiliated with Meta. Facebook deletion can be irreversible. Download your information from Facebook before you delete anything.

**Aviso:** a exclusão no Facebook pode ser irreversível. Exporte seus dados antes. Regras de proteção de família ficam ligadas o tempo todo. Datas desconhecidas não são apagadas.

## What this build does

This version is the safety foundation:

- It stores activity on this computer in SQLite.
- It can scan a **local HTML fixture** so the pipeline can be tested without Facebook.
- It filters by date, protects people and family keywords, and previews the reason each item is kept.
- Deletion is a dry-run unless you pass `--execute` and the exact confirmation phrase.
- Live Facebook login, scanning, and clicking are **turned off**. The Activity Log selectors have not been validated against the current interface, and this program will not invent them.

## Install

Node.js 22 or newer:

```bash
npm install
npm test
npm run build
node dist/cli/index.js --help
```

During development:

```bash
npx tsx src/cli/index.ts --help
```

## Data on this computer

The default directory is `~/.fb-cleaner`, outside the repository:

- `config.yaml` — optional settings
- `activity.sqlite` — discovered activities and protection rules
- `browser-profile/` — reserved for a future Playwright profile

Directories are created with mode `0700` and the database with mode `0600` where the operating system allows it. Nothing is uploaded.

Copy `config/example.yaml` to `~/.fb-cleaner/config.yaml` if you want to edit the defaults. The example is documentation; the built-in defaults already protect the family keyword list.

## Date filters

The timezone defaults to `America/Sao_Paulo`. Override it with `--timezone` or `timezone` in the config. Boundaries use that civil calendar, not the computer's UTC day.

| Flag                  | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `--before YYYY-MM-DD` | Exclusive. The activity must fall entirely before that day.         |
| `--after YYYY-MM-DD`  | Exclusive. The activity must fall entirely after that day.          |
| `--from YYYY-MM-DD`   | Inclusive start of that day.                                        |
| `--to YYYY-MM-DD`     | Inclusive end of that day.                                          |
| `--year YYYY`         | That whole calendar year, inclusive.                                |
| `--all`               | Every confidently dated activity. Unknown dates are still excluded. |

`--before 2017-01-01` does **not** include 1 January 2017. A month or year is eligible only when the entire period sits inside the filter. If it overlaps a boundary, the activity is held for review. `01/02/2015` is not parsed, because day/month order is ambiguous. "Yesterday" and "ontem" are unknown.

`scan` and `delete` refuse to run until you pass one of these flags. They will not silently use "everything".

## Interface

You do not need to remember the commands. From the project folder:

```bash
npm run ui
```

That builds the page and opens it at `http://127.0.0.1:4173`. While changing the page, use `npm run ui:dev` and open `http://127.0.0.1:5173`. The page talks only to this computer. Protection stays on. The buttons simulate a deletion and tell you that nothing was deleted. Live Facebook deletion is not on this screen.

## Commands

```bash
fb-cleaner protect person add --name "Natanaiah" --relationship spouse
fb-cleaner protect keyword add "família"
fb-cleaner protect album add --name "Family"
fb-cleaner protect post add --url "https://www.facebook.com/your-post"
fb-cleaner protect list

fb-cleaner scan --fixture tests/fixtures/activity-log.html --before 2017-01-01
fb-cleaner preview --group-by protection-status
fb-cleaner review
fb-cleaner delete --before 2017-01-01 --type all
fb-cleaner delete --before 2017-01-01 --type posts --execute --confirm "DELETE N ACTIVITIES xxxxxxxx"
fb-cleaner resume
fb-cleaner status
fb-cleaner export --format json
```

`--type` is required on `delete`. Use `posts`, `comments`, `reactions`, `media`, `other`, or `all`.

`--respect-protection` is accepted and does nothing, because protection cannot be turned off. `--no-respect-protection` is rejected.

`--limit` caps one deletion run (default 25, maximum 200). The confirmation phrase is bound to that exact set of ids. A different set needs a new phrase.

## Protection

Protection is applied before deletion and wins over the date filter:

1. Explicitly protected activities are never deleted.
2. Protected people, albums, post URLs, and keywords are never deleted.
3. Possible family photos require review.
4. Unknown ownership, unknown type, or an unknown or overlapping date requires review.
5. Only an owned post or comment with a confident in-range date, and no protection hit, is eligible.

A keyword hit is kept even when the date is unknown, so a later manual approval cannot delete it. Approval applies to one activity and cannot override an explicit protection rule. If a link to a protected person is only partial, the activity is reviewed instead of deleted.

The image helper always returns `unclassified`. It does not upload photos and does not recognize faces. Unclassified media is not proof that a photo is safe to delete.

## Live Facebook

`fb-cleaner login`, `scan` without `--fixture`, and `delete --execute` stop before opening Facebook or changing a row to deleted. When the real Activity Log is inspected, record accessible roles and names in `src/facebook/selectors/registry.ts`. Do not paste guessed CSS selectors.

See [docs/limitations.md](docs/limitations.md) and [plans/README.md](plans/README.md).

## License

MIT
