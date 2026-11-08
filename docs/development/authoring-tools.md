# 图解创作工具集成

[Flow Diagram Skill](https://github.com/yokingma/flow-diagram-skill) 是图解创作工具，通过已发布的 `flowsvg` npm 包校验、测量、播放和导出图解。

## 项目职责

| 项目 | 维护职责 | 使用说明 |
| --- | --- | --- |
| FlowSVG | 图解模型、公开 API、校验、几何诊断、渲染、播放、导出、共享 showcase 与宿主示例 | [英文 SDK 手册](../guides/sdk-guide.md) · [中文 SDK 手册](../guides/sdk-guide.zh-CN.md) |
| Flow Diagram Skill | 来源组织、创作、布局计划、检查、复核与交付 | [项目文档](https://github.com/yokingma/flow-diagram-skill) |

## SDK 版本与验证

- 创作工具通过公开 SDK API 集成，锁定经过验收的明确版本。
- SDK 类型和测试定义运行契约；工具项目文档定义创作工作流。
- 升级 SDK 时，工具项目重新验证兼容性，并更新自己的依赖锁与使用说明。
- 两个项目各自维护测试和发布周期，按各自的版本计划发布。

集成原则见 [ADR 0006](../adr/0006-authoring-skill-uses-public-sdk.md)，版本职责见 [ADR 0016](../adr/0016-independent-sdk-and-skill-repositories.md)。
