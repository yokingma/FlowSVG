# SDK 与创作工具的集成与版本职责

Status: accepted

FlowSVG 维护 SDK、共享 showcase 与宿主示例。[Flow Diagram Skill](https://github.com/yokingma/flow-diagram-skill) 维护创作、布局计划、检查、复核和交付。两个项目各自维护运行、测试和发布流程。

SDK 通过 npm 提供公开图解模型与运行 API。创作工具消费经过独立验收的明确 SDK 版本，其升级由工具项目负责。SDK 升级不要求工具同时发布，工具发布也不要求 SDK 升版。

明确的 SDK 版本让工具项目可以复现验收结果；升级时需重新验证兼容性。公开 SDK 的几何诊断职责见 [ADR 0008](0008-shared-sdk-geometry-diagnostics.md)，公开集成原则见 [ADR 0006](0006-authoring-skill-uses-public-sdk.md)。
