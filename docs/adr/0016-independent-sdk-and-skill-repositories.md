# SDK 与创作工具使用独立仓库和发布周期

Status: accepted

FlowSVG 仓库维护 SDK、共享 showcase 与宿主示例。独立 `flow-svg-diagram-skills` 项目维护创作、布局计划、检查、复核和交付。两者的运行、测试和发布均不能依赖本地兄弟仓库。

SDK 通过 npm 提供公开图解模型与运行 API。创作工具消费经过独立验收的明确 SDK 版本，其升级由工具项目负责。SDK 升级不要求工具同时发布，工具发布也不要求 SDK 升版。

选择独立仓库增加了版本协作成本，但让 SDK 用户和工具用户各自使用自包含的说明与验收流程。公开 SDK 的几何诊断职责见 [ADR 0008](0008-shared-sdk-geometry-diagnostics.md)，公开集成原则见 [ADR 0006](0006-authoring-skill-uses-public-sdk.md)。

首次开源前的完整开发历史由维护者私有归档。公开主线保留功能里程碑；旧研究原型、任务记录和过时演示不属于当前运行与验收输入。
