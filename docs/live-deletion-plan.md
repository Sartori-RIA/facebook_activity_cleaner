# Plan: delete for real after the HTML import

The HTML file chooses what to delete. For a post, `delete --execute` opens that post's stored address and moves it to the trash. The local page does not. Comments, reactions, photos, and reels stay out. Automated tests do not open the browser.

That path lives in `src/facebook/exported-link.ts`. An item with no address, or a page whose text does not match, goes to review without a click and the run continues. The program is finished when the confirm click moves the post to the trash.

## What is already done

1. The official HTML export is imported. Posts, comments, and reactions stay on this computer.
2. The family filter runs on every item: a protected person, a protected keyword, a share from a protected person, or an item marked by hand. An unknown date, an uncertain owner, or an uncertain type stays out.
3. A year is inclusive, in the `America/Sao_Paulo` timezone. An empty period is not widened.
4. Simulation lists the posts and comments that would be included. Reactions stay out of that count. Photos and reels stay in review.

None of this opens Facebook. `LIVE_FACEBOOK_AUTOMATION_ENABLED` and `FACEBOOK_SELECTORS_VALIDATED` stay `false`. Do not invent selectors.

## One exported item opens its own link

Deletion does not search the Activity Log. Each imported row already has the address that was in the HTML. The reader prefers a public `facebook.com` link. If the section only has the `facebook.com/dyi/l/` redirect from the file footer, that is the stored address. An item with no https Facebook address stays in review and the browser does not open for it.

The program opens Chromium on this computer, with a persistent profile in `~/.fb-cleaner/browser-profile`. The first time, the person signs in to their own account in that window and types the password and the code if Facebook asks. The program does not see or store a password, cookie, or token. Later runs reuse that session in the same window.

For each item that passed the family filter, the year, and the type, Playwright does this, one item at a time:

1. Read the row from the database again. Check protection, type, date, and ownership. If protection changed, skip it.
2. Open exactly that row's `sourceUrl`. Do not search for another post, scroll the Activity Log, or swap in a similar address.
3. Wait until the saved text is visible, then click at once. Do not read the whole page text and do not pause between the rendered row and the clicks. The same window stays open and moves to the next address. If the wait ends and the page shows **Registro de atividades** and **Nada para mostrar**, and the saved text is not there, the post is already gone: mark `deleted` and do not click. On a list, click only the **Mais opções para** button in the row that shows that saved text. If that button is missing or not unique, mark `requires_review` and continue. If the page asks for login again, shows a checkpoint, or says the account is limited, stop the run.
4. On the open page, click **Mover para a Lixeira** in the menu, then the blue **Mover para a Lixeira** button. Do not click **Cancelar** or **Mover para Itens Arquivados**.
5. When that confirm click finishes, the program is done with the item. Mark `deleted` with a detail that says it was moved to the trash. Do not wait for **Nada para mostrar**, and do not click the button that empties the trash.
6. If the confirm click throws, mark `requires_review` and do not retry that item.
7. Leave that page and continue with the next `sourceUrl`.

Omit `--limit` to include every eligible row. `--limit` still caps one run.

The Activity Log action observed on 24 Oct 2026 moves the row to the trash. That is where this program stops. The account owner empties the trash by hand. Facebook also deletes trash contents after 30 days. The program does not click the control that deletes everything in the trash.

## What still has to be written down from the logged-in screen

Without these names, Playwright has nothing to click.

| Item     | What to record, in the language shown on screen         |
| -------- | ------------------------------------------------------- |
| Post     | delete menu, confirm button, notice that it was removed |
| Comment  | the same three, when they differ                        |
| Reaction | the same three, when they differ                        |
| Block    | the checkpoint, captcha, or account-limit text          |

One of each is enough: one of your posts, one comment, and one reaction. The observed names go into `src/facebook/selectors`. Guessed selectors do not.

## Order

1. Record the three controls for a post.
2. Enable only the post deleter, still requiring the exact confirmation phrase and a limit of 1.
3. After that post is gone and the screen shows the notice, the same path can cover a whole year of posts.
4. Comments come next, after `comments.html` is imported.
5. Reactions come last, after the likes and reactions HTML files are imported. The posts file does not contain every reaction.
6. Photos and reels stay in review.

The local page keeps showing only the filtered set. The run that clicks Facebook starts with the confirmation phrase and a visible browser, so it can be interrupted.

## Out of scope

- Calling `graph.facebook.com`, private GraphQL, or any other unofficial endpoint.
- Deleting a photo or reel from automatic classification.
- Turning protection off.
- Marking `deleted` without an observation whose outcome is `deleted` and whose detail is non-empty.
- Retrying a deletion whose result was uncertain.
- Storing a password, cookie, `c_user`, `xs`, or token.
- Testing a real deletion against the everyday account. The first real post uses a limit of 1, on a disposable account when one exists.
