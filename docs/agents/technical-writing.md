# Technical writing

Apply these conventions to English and Chinese technical documentation and source comments. They are inspired by ASD-STE100 clarity principles; the project does not claim STE compliance.

## Write

- Use one term per concept, aligned with code identifiers and the [glossary](../../GLOSSARY.md).
- State the actor, condition, outcome and failure behavior where these affect the reader's action. Give each pronoun a clear referent.
- Put procedural steps in execution order, with one operation per step and an observable completion condition.
- Prefer direct wording, active voice and short sentences with one main point. Retain domain terms and complex sentences when accuracy, rationale or tradeoffs require them. STE vocabulary, length, tense and voice restrictions are advisory.
- Describe the current repository capabilities, usage, limits, and prerequisites. Keep release availability, implementation progress, interview records, and migration history in the documents that own those records; capability guides describe observable behavior.

## Check before finishing

Review every changed passage for consistent terminology, clear references and complete conditions. For each changed procedure, confirm that the prerequisites, order and completion conditions match the current implementation.

For source-comment responsibilities and required contract details, follow [source comments](code-comments.md).
