# 创作工具通过公开 SDK 集成

Status: accepted

独立创作工具只通过公开 npm SDK 校验、测量、播放和导出图解，不依赖 SDK 源码内部模块、私有 showcase 或兄弟目录。

SDK 维护图解模型和公开运行合同；创作工具维护来源组织、布局选择、复核和交付流程。两者独立维护和发布，工具的 SDK 版本选择与运行时锁由工具项目负责。这样可避免工具用户必须克隆 SDK 仓库，以及两套发布流程相互阻塞。

仓库边界见 [ADR 0016](0016-independent-sdk-and-skill-repositories.md)。
