# Issue tracker: Local Markdown

Local issues and specs live as Markdown files in the ignored `.scratch/` directory. These are working records, kept outside public commits. Publishing to this local tracker means writing a local file; it does not mean committing or sending it to GitHub.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see [triage roles](triage-labels.md) for the strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Create or fetch a record

When a skill says "publish to the issue tracker", write the requested spec or ticket at the path above, creating its parent directory if needed. Completion means the file exists and contains the requested record.

When fetching a ticket, read the referenced file. Ticket numbers are unique only within a feature directory. Resolve numeric references using the task's feature context; ask for a feature or path only if that context leaves more than one match.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. Resolve each number to a sibling issue file. A ticket is unblocked only when every listed file exists and has `Status: resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`. Resolution is complete when the answer, status and map pointer are all present.
