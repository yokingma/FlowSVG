# SDK 与创作工具的仓库边界

| 项目 | 维护职责 | 验证入口 |
| --- | --- | --- |
| FlowSVG SDK | 图解模型、公开 API、校验、几何诊断、渲染、播放、导出、共享 showcase 与宿主示例 | 本仓 `pnpm test:all` 和发布预览 |
| [Flow Diagram Skill](https://github.com/yokingma/flow-diagram-skill) | 来源组织、创作、布局计划、检查、复核与交付 | 独立项目的测试和公开 SDK 消费验收 |

SDK 用户从 npm 安装 `flowsvg`，使用[英文](../guides/sdk-guide.md)或[中文](../guides/sdk-guide.zh-CN.md)手册。SDK 安装、构建、测试、发布验证和示例均不读取创作工具仓库。工具只能通过公开 SDK 集成，其安装单元、文档、依赖锁与 SDK 版本选择由独立项目维护。

两项目独立版本、独立发布。必要的 SDK 版本升级须在工具项目重新验收，不能用本地源码路径或浮动依赖绕过公开包。SDK 的类型和测试是运行合同来源，工具项目的文档是创作工作流来源。

保留各项目的原始许可证、版权与必要来源说明。原开发历史由维护者私有归档；公众使用和验证当前 SDK 不需要访问该归档。设计取舍见 [ADR 0016](../adr/0016-independent-sdk-and-skill-repositories.md)。
