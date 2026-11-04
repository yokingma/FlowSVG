## Repository instructions

### Repository scope

This repository maintains the FlowSVG SDK, shared showcase, and native browser, React, and Vue examples. Keep development, tests, builds, and release workflows self-contained.

### Implementation conventions

Before changing implementation, builds, or tests, read the root `PATTERNS.md` and any affected package/app `PATTERNS.md`.

### Source documentation

Before adding or changing source modules, public APIs, or complex state/algorithms, read [source comments](docs/agents/code-comments.md). Update adjacent comments with the implementation.

### Technical writing

Before writing technical documentation or source comments, read [technical writing](docs/agents/technical-writing.md). Apply its completion checks to every changed passage.

### Documentation sync

For executable code, implementation logic, or code structure changes, review the root and affected package/app READMEs in both languages, plus documentation covering the affected behavior, API, integration, or development workflow.

- Update affected `CHANGELOG.md`, `PATTERNS.md`, and documentation in the same task. Keep bilingual task coverage aligned and verify changed examples, commands, and links.
- Documentation-only, planning, and data changes do not require changelog or pattern updates.
- In the completion report, identify the documentation updated, or explain why the reviewed documentation needs no changes.

### Issue tracker

When creating, fetching, or updating specs and tickets under `.scratch/`, follow `docs/agents/issue-tracker.md`.

### Triage labels

When assigning triage labels, use the mappings in `docs/agents/triage-labels.md`.

### Domain docs

Before exploring a domain or changing its contracts, follow [domain documentation](docs/agents/domain.md).
