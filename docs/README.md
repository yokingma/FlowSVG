# FlowSVG documentation

[English](README.md) | [简体中文](README.zh-CN.md)

This directory is the repository documentation entry point. Start with the SDK guide for public behavior, then open the host, verification, or release document for the task you need to complete.

## Start with the SDK

The two SDK guides are parallel task paths. They keep the same section order, examples, defaults, limits, errors, and links; wording may follow the target language. Update both guides in the same change. Public types, implementation, and tests under `packages/flowsvg/` remain the behavior source of truth.

| Reader | Entry |
| --- | --- |
| SDK users | [SDK guide](guides/sdk-guide.md) |
| npm package users | [Package README](../packages/flowsvg/README.md) |
| Native host | [Native example](../apps/native-example/README.md) |
| React host | [React example](../apps/react-example/README.md) |
| Vue host | [Vue example](../apps/vue-example/README.md) |

## Choose by task

| Goal | Start here |
| --- | --- |
| Install, create a document, or render SVG | [Quick start](guides/sdk-guide.md#quick-start) |
| Integrate Vue, React, browser, or Web Component | [Integrations](guides/sdk-guide.md#vue-integration) |
| Export PNG, GIF, or offline HTML | [Export sections](guides/sdk-guide.md#browser-png-and-svg-backgrounds) |
| Write scenes, beats, actions, or node content | [Document model](guides/sdk-guide.md#documents-and-timelines) |
| Handle events, validation, accessibility, or diagnostics | [API and diagnostics](guides/sdk-guide.md#api) |
| Edit shared showcase examples | [Showcase README](../packages/showcase/README.md) |
| Run SDK browser checks | [SDK verification](verification/sdk-verification.md) |
| Build and verify showcase hosts | [Showcase verification](verification/showcase-verification.md) · [Host maintenance](development/showcase-hosts.md) |
| Deploy the showcase to GitHub Pages | [GitHub Pages](development/github-pages.md) |
| Prepare or publish an npm release | [Release guide](development/releasing.md) |

## Repository reference

- **Architecture:** [ADRs](adr/) record decisions and their boundaries. [Authoring-tool integration](development/authoring-tools.md) explains SDK version selection and verification responsibilities.
- **Conventions:** [Glossary](../GLOSSARY.md) defines public terms; [patterns](../PATTERNS.md) names the owner and verification boundary for each branch; [SDK changelog](../packages/flowsvg/CHANGELOG.md) records package behavior changes.
- **Assets:** [Image previews](assets/image-previews.md) and [brand assets](brand/README.md) describe checked-in visual inputs and refresh steps.
- **Agent instructions:** [Technical writing](agents/technical-writing.md), [source comments](agents/code-comments.md), [domain docs](agents/domain.md), [issue tracker](agents/issue-tracker.md), and [triage labels](agents/triage-labels.md) apply to repository maintenance.

## Documentation ownership

Keep each rule at its narrowest owner:

- The SDK guides own the complete public SDK contract and cross-host behavior.
- Package READMEs own the self-contained npm consumption path.
- Host READMEs own lifecycle, framework, and deployment details.
- Verification and release guides own commands, inputs, and acceptance boundaries.
- ADRs and patterns own reasons, boundaries, and implementation constraints.

Current behavior follows the public types, implementation, and tests. Temporary plans, logs, and screenshots are working material and are not prerequisites for reading the public documentation.
