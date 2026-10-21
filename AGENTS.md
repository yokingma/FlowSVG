## Agent skills

### Source documentation

When adding or changing source modules, public APIs, or complex state/algorithms, follow `docs/agents/code-comments.md` and update adjacent comments with the implementation.

### Technical writing

When writing or editing technical documentation or source comments, apply these ASD-STE100-inspired clarity rules to both English and Chinese. This is a project writing convention, not a claim of STE compliance.

- Required: use one consistent term per concept, aligned with code identifiers and the project glossary. Make actors, conditions, outcomes, failure behavior, and execution order explicit where relevant; give each pronoun an unambiguous referent.
- Default: use direct wording, short sentences with one main point, and one operation per procedural step. Prefer active voice when it clarifies responsibility.
- Flexible: allow domain terms, code identifiers, and complex sentences needed for precision. Treat STE vocabulary, word-count, tense, and voice restrictions as advisory; preserve accuracy, completeness, rationale, and tradeoffs when simplifying.
- Before finishing, check the changed text for inconsistent terminology, ambiguous references, and missing conditions or ordering information. Apply the source-comment content requirements in `docs/agents/code-comments.md` when editing comments.

### Documentation sync

For every code or feature change, review the root `README.md`, affected package/app READMEs, and documentation covering the changed behavior, API, integration, or development workflow before declaring the task complete.

- Update affected documentation in the same task so descriptions, examples, commands, and links match the final implementation; verify any changed examples, commands, and links.
- In the completion report, identify the documentation updated, or explain why the reviewed documentation needs no changes.

### Issue tracker

Issues and specs are tracked as local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the five default status names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
