# FlowSVG 文档

[English](README.md) | 简体中文

本目录是仓库文档入口。公共行为先查 SDK 手册，再按任务进入宿主、验证或发布文档。

## 从 SDK 开始

两份 SDK 手册是并行的任务路径。两者保持相同的章节顺序、示例、默认值、限制、错误行为和链接；表述可以按目标语言调整。修改 SDK 手册时同步更新两份文件。`packages/flowsvg/` 下的公开类型、实现和测试是行为事实来源。

| 读者 | 入口 |
| --- | --- |
| SDK 使用者 | [SDK 使用手册](guides/sdk-guide.zh-CN.md) |
| npm 包使用者 | [包 README](../packages/flowsvg/README.zh-CN.md) |
| 原生浏览器宿主 | [Native 示例](../apps/native-example/README.md) |
| React 宿主 | [React 示例](../apps/react-example/README.md) |
| Vue 宿主 | [Vue 示例](../apps/vue-example/README.md) |

## 按任务查找

| 目标 | 从这里开始 |
| --- | --- |
| 安装、创建文档或渲染 SVG | [快速开始](guides/sdk-guide.zh-CN.md#快速开始) |
| 接入 Vue、React、浏览器或 Web Component | [集成](guides/sdk-guide.zh-CN.md#vue-集成) |
| 导出 PNG、GIF 或离线 HTML | [导出章节](guides/sdk-guide.zh-CN.md#浏览器-png-与-svg-背景) |
| 编写场景、节拍、动作或节点内容 | [文档模型](guides/sdk-guide.zh-CN.md#文档与时间线) |
| 处理事件、校验、无障碍或诊断 | [API 与诊断](guides/sdk-guide.zh-CN.md#api) |
| 编辑共享展示示例 | [展示示例 README](../packages/showcase/README.md) |
| 执行 SDK 浏览器检查 | [SDK 验证](verification/sdk-verification.md) |
| 构建并验证展示宿主 | [展示验证](verification/showcase-verification.md) · [宿主维护](development/showcase-hosts.md) |
| 部署展示站点到 GitHub Pages | [GitHub Pages](development/github-pages.md) |
| 准备或发布 npm 版本 | [发布指南](development/releasing.md) |

## 仓库参考

- **架构：** [架构决策](adr/)记录决策及其边界；[仓库边界](development/repository-split.md)说明 SDK 与独立创作工具的职责。
- **约定：** [术语表](../GLOSSARY.md)定义公共术语；[实现模式](../PATTERNS.md)说明各分支的归属和验证边界；[SDK 版本说明](../packages/flowsvg/CHANGELOG.md)记录包行为变化。
- **资源：** [图片维护](assets/image-previews.md)和[品牌资源](brand/README.md)说明已提交的视觉输入及刷新步骤。
- **Agent 规则：** [技术写作](agents/technical-writing.md)、[源码注释](agents/code-comments.md)、[领域文档](agents/domain.md)、[本地任务记录](agents/issue-tracker.md)和[标签映射](agents/triage-labels.md)适用于仓库维护。

## 文档归属

按最小归属范围维护规则：

- SDK 手册负责完整的公共 SDK 契约和跨宿主行为。
- 包 README 负责脱离仓库也可阅读的 npm 使用路径。
- 宿主 README 负责生命周期、框架和部署细节。
- 验证与发布指南负责命令、输入和验收边界。
- ADR 与 patterns 负责原因、边界和实现约束。

当前行为以公开类型、实现和测试为准。临时计划、日志和截图属于工作材料，不是阅读公开文档的前置条件。
