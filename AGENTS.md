## Repository instructions

### Repository scope

This repository maintains the FlowSVG SDK, shared showcase, and native browser, React, and Vue examples. Keep development, tests, builds, and release workflows self-contained.

### Implementation conventions

Before changing implementation, builds, or tests, read the root `PATTERNS.md` and any affected package/app `PATTERNS.md`.

### Source documentation

When adding or changing source modules, public APIs, or complex state/algorithms, follow `docs/agents/code-comments.md` and update adjacent comments with the implementation.

### Technical writing

When writing or editing technical documentation or source comments, apply these ASD-STE100-inspired clarity rules to both English and Chinese. This is a project writing convention, not a claim of STE compliance.

- Required: use one consistent term per concept, aligned with code identifiers and the project glossary. Make actors, conditions, outcomes, failure behavior, and execution order explicit where relevant; give each pronoun an unambiguous referent.
- Default: use direct wording, short sentences with one main point, and one operation per procedural step. Prefer active voice when it clarifies responsibility.
- Flexible: allow domain terms, code identifiers, and complex sentences needed for precision. Treat STE vocabulary, word-count, tense, and voice restrictions as advisory; preserve accuracy, completeness, rationale, and tradeoffs when simplifying.
- Before finishing, check the changed text for inconsistent terminology, ambiguous references, and missing conditions or ordering information. Apply the source-comment content requirements in `docs/agents/code-comments.md` when editing comments.

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

Before exploring a domain or changing its contracts, follow `docs/agents/domain.md`: read the root `GLOSSARY.md` and relevant decisions in `docs/adr/`.
