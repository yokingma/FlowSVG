# 创作工具通过公开 SDK 集成

Status: accepted

创作工具通过已发布的 npm SDK 校验、测量、播放和导出图解，使用公开 API 作为集成入口。

SDK 维护图解模型和公开运行合同；创作工具维护来源组织、布局选择、复核和交付流程。两者独立维护和发布，工具的 SDK 版本选择与运行时锁由工具项目负责。这样可避免工具用户必须克隆 SDK 仓库，以及两套发布流程相互阻塞。

版本与验证职责见 [ADR 0016](0016-independent-sdk-and-skill-repositories.md)。
