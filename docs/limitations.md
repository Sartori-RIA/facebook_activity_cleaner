# Limitations

## Facebook UI is not wired up

No one has validated the current Activity Log, delete menus, or checkpoint dialogs for this project. `src/facebook/selectors/registry.ts` lists the slots that need an accessible role or name. It does not contain selectors.

Until `LIVE_FACEBOOK_AUTOMATION_ENABLED` is set from evidence:

- `login` does not open a browser.
- `scan` works only with `--fixture`.
- `delete --execute` returns an error and leaves rows unchanged.

What a person needs to inspect manually, while logged into their own account:

- The Activity Log URL and the control that shows older items.
- How a post, comment, reaction, and photo expose their date, author, and permalink.
- Which dates are relative ("yesterday", "ontem") versus a full calendar date.
- The delete control, the confirm button, and the signal that the row actually disappeared.
- The dialogs Facebook shows for checkpoints, rate limits, and "we removed this".
- Portuguese (Brazil) and English labels for those same controls.

Do not bypass a checkpoint. Stop the run.

## What deletion cannot do yet

Only posts and comments can be deleted by the simulated engine used in tests. Reactions and media are previewed and held back. The image classifier is a local stub that always returns `unclassified`. It is not a model, it does not see pixels, and it must not be treated as permission to delete a photo.

A manual approval is stored per activity. It does not approve a whole album or a whole day.

## Dates and identity

- Ambiguous numeric dates and relative phrases are unknown.
- A month or year that crosses the filter edge is review, not deletion.
- The fingerprint uses type, normalized URL, date, a folded text preview, and author. Two different posts with no URL and the same preview can collapse into one row. The survivor is kept, so the tool may delete less, not more.
- A protected person matched only by display name can over-protect someone else with the same name. A conflicting profile URL or id prevents that match. Add a profile URL when you have one.
- A partial name, such as a longer tagged name that merely contains the protected name, goes to review.

## Facebook itself

- Deletion can be permanent. Export your data first.
- Facebook can change the Activity Log without notice. A validated selector can rot. When it does, turn live automation back off.
- The tool cannot see activity it has not scanned. `delete` only considers rows already in SQLite, and only rows inside the filter you pass on that command.
- Group or page content that the user does not own is stored as not owned or uncertain and is not deleted.
- This program does not know whether Facebook still has a copy, a backup, or a notification that mentioned the activity.

## Review page

`review html` writes a local file. It shows text, date, author, and reasons. It does not embed thumbnails, because loading a Facebook image URL would contact Facebook.

## Platforms

Automated tests run on Node 22 with SQLite. POSIX modes `0700` and `0600` are applied and verified on macOS. Windows may ignore those modes; the files should still stay in the user profile directory, not in the git checkout.
