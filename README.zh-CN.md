# FlowSVG

[English](README.md) | 简体中文

FlowSVG（流形）是声明式 SVG 图解播放器，用场景与节拍演示逻辑图和架构图。用可序列化的图解文档描述节点、连线和讲解步骤，在网页中播放，并在任意时间点导出静态 SVG。

核心使用 TypeScript，运行时不依赖 DOM、网络或浏览器时钟。原生浏览器、Vue、React 和 Web Component 接入复用同一套时间线与渲染结果。

## 能做什么

- 绘制矩形、圆角矩形、椭圆、圆柱体和分组，计算直线、正交与曲线连线；曲线和正交入线自动错开同侧箭头，正交路径按线宽预留直线末段。支持节拍内的正反向圆点传递与水平文字胶囊。
- 在固定尺寸的矩形、圆角矩形和圆柱内组合标题、段落、含圆角或胶囊标签及状态的列表、弱化说明和混合样式片段，设置受控样式，并按内容安全区裁剪、报告宽高不足警告。
- 用场景、节拍和动作组织讲解，控制显隐、高亮、位置、样式与镜头聚焦，并在多条连线上同步表达正向或反向传递。
- 在节拍起点整体替换节点内容、切换普通标签或清空文字，结果继承到后续节拍与场景。
- 播放、暂停、调速、逐步前后移动、切换场景和拖动进度。场景和速度使用支持键盘选择的自定义菜单；可用 `flowsvg-compact` 启用小尺寸控件。
- 悬停节点形状、普通标签或结构化内容时默认只高亮边框；可通过 `hoverFill` / `hover-fill` 选择背景高亮。
- 精确跳转并查询画面、命中对象，导出相同时间点的静态 SVG。
- 浅色与深色主题均使用中性细边、灰色连线和蓝色强调，并提供键盘操作、说明文字播报和减少动画支持。
- 在加载时报告带字段路径的文档错误，在布局时报告文字溢出警告。
- 生成单文件离线 HTML，在浏览器或 Node 中导出 GIF，并按需启用下载控件、进度和取消；这些新增能力已在 `main` 实现，尚未发布。

节点的位置和尺寸由作者指定。项目面向图解展示与讲解；拖拽编辑、自动布局和复杂全局布线不在当前范围内。

## 安装

从 [npm](https://www.npmjs.com/package/flowsvg) 安装：

```sh
pnpm add flowsvg
```

截至 2026-10-20，npm `flowsvg@0.1.1` 提供播放和静态 SVG 导出。下文的离线 HTML、GIF 与 CLI 尚未发布；使用这些新增能力时，须构建本仓库或安装本地准备的 tarball。

包提供 ESM 与 TypeScript 类型。核心和原生播放器不依赖框架；Vue、React 应用按需安装对应框架，见[SDK 安装说明](packages/flowsvg/README.zh-CN.md#安装)。

## 快速开始

### 1. 定义图解

将以下内容保存为 `diagram.ts`，供播放和导出共用：

```ts
import type { DiagramDocument } from "flowsvg";

export const diagramDocument: DiagramDocument = {
  version: 1,
  title: "Request flow",
  viewport: { width: 640, height: 280 },
  nodes: [
    { id: "client", kind: "roundedRect", x: 40, y: 100, width: 140, height: 80, label: "Client" },
    { id: "service", kind: "rect", x: 420, y: 100, width: 160, height: 80, label: "Service", visible: false }
  ],
  edges: [{ id: "request", from: "client", to: "service", label: "HTTP", route: "straight" }],
  scenes: [{
    id: "request-flow",
    label: "Request reaches the service",
    beats: [
      { durationMs: 1000, transitionMs: 250, caption: "Show the service", actions: [{ type: "show", target: "service" }] },
      { durationMs: 1000, caption: "The service handles the request", actions: [{ type: "highlight", target: "service" }] }
    ]
  }]
};
```

### 2. 在浏览器中播放

在页面中添加容器：

```html
<div id="diagram" style="width: 100%; height: 360px;"></div>
```

在客户端应用模块中创建播放器：

```ts
import { createPlayer } from "flowsvg/browser";
import "flowsvg/styles.css";
import { diagramDocument } from "./diagram.js";

const host = document.querySelector<HTMLElement>("#diagram");
if (!host) throw new Error("Diagram host is missing");

const player = createPlayer(host, diagramDocument);
player.play();
```

内置控件支持暂停、调速和跳转。可调用 `player.seek(1000)` 跳到指定毫秒；页面或组件卸载时调用 `player.destroy()`。普通 HTML 使用包导入时需要 import map 或构建工具。

### 3. 导出静态 SVG

核心入口可在无 DOM 的环境运行：

```ts
import { createDiagram } from "flowsvg";
import { diagramDocument } from "./diagram.js";

const diagram = createDiagram(diagramDocument);
const svg = diagram.renderSvg(1000);
console.log(svg);
```

`svg` 是完整 SVG 字符串，可保存到文件或用于预览。反复求值或导出时，复用已编译的 `diagram`。

浏览器 GIF 导出使用独立 [`flowsvg/export` 入口](packages/flowsvg/README.zh-CN.md#浏览器-gif-导出)，返回 GIF 字节并支持说明文字、进度和取消。编码在内嵌 worker 中执行。

## 离线 HTML

Node 20+ 工具将图解数据、播放器和样式内嵌为一个 HTML 文件。接收者可断网通过 `file://` 打开。默认暂停在零时刻，显示控件和说明文字；主题使用文档主题，未指定时使用浅色。以下示例复用快速开始中的 `diagramDocument`。

```js
import { renderHtml } from "flowsvg/node";
import { diagramDocument } from "./diagram.js";
import { writeFile } from "node:fs/promises";
await writeFile("diagram.html", await renderHtml(diagramDocument, { theme: "dark" }));
```

也可以把文档保存为 JSON，从仓库根目录调用构建后的 CLI：

```sh
node packages/flowsvg/dist/node/cli.js diagram.json --output diagram.html --format html
```

按需使用 `--theme light|dark`、`--autoplay`、`--no-controls`、`--gif-export` 和 `--overwrite`。默认保留已有文件。生成 HTML 无需启动 Chromium。设置 `gifExport: true` 或 `--gif-export` 后，HTML 同时内嵌同版本导出器与 worker，接收者可离线下载 GIF、查看进度并取消；默认 HTML 不含编码器。`controls: false` 隐藏全部控件。

构建还会生成 `packages/flowsvg/dist/portable/`，包含播放器、样式、版本清单和许可证。复制完整 SDK `dist/` 目录及含 `{"type":"module"}` 的 `package.json` 后，可在目标目录运行 `node dist/node/cli.js`，无需源码或 `node_modules`。分发时保留附带许可证，生成工具会自动读取匹配的资产。

## Node GIF 导出

从 `flowsvg/node` 导入的 `exportGif` 要求 Node 20+，并在隔离的离线 Chromium 页面中复用浏览器导出器。断网前须准备 Chromium、系统库和字体；安装包和调用导出都不自动下载浏览器。可用 `executablePath` 指定已安装的浏览器，也可传入已连接的 Playwright `browser`；调用者提供的浏览器会保留。完整接口见 [Node GIF 导出](packages/flowsvg/README.zh-CN.md#node-gif-导出node-20)。

```sh
node packages/flowsvg/dist/node/cli.js diagram.json --output diagram.gif --format gif --executable-path /path/to/chromium --fps 15 --loop-count 1
```

可配置时间区间、速度、尺寸、说明文字、循环次数、末帧停留和减少动画。HTML/GIF 均在完整生成后原子写入，默认不覆盖；CLI 收到 SIGINT/SIGTERM 时取消并以非零状态退出。复制后的 GIF 工具须在 `dist/` 旁安装 `playwright-core@1.58.2`；复制后的 HTML 生成工具无需安装依赖。

## 集成与 API

[SDK 使用手册](packages/flowsvg/README.zh-CN.md) 是集成方式、文档模型和公开 API 的说明入口，也会随 npm 包分发。

| 需要做什么 | 阅读位置 |
| --- | --- |
| 创建文档、求值或导出 SVG | [快速开始](packages/flowsvg/README.zh-CN.md#快速开始)、[核心 API](packages/flowsvg/README.zh-CN.md#核心-api) |
| 在 Vue 组件中使用 | [Vue 集成](packages/flowsvg/README.zh-CN.md#vue-集成) |
| 在 React 组件中使用 | [React 集成](packages/flowsvg/README.zh-CN.md#react-集成) |
| 接入普通网页或自定义控件 | [原生浏览器](packages/flowsvg/README.zh-CN.md#原生浏览器)、[播放器 API](packages/flowsvg/README.zh-CN.md#播放器-api) |
| 使用自定义元素或 URL 文档 | [Web Component](packages/flowsvg/README.zh-CN.md#web-component) |
| 导出 GIF 字节或启用播放器下载 | [浏览器 GIF 导出](packages/flowsvg/README.zh-CN.md#浏览器-gif-导出)、[内置 GIF 下载](packages/flowsvg/README.zh-CN.md#内置-gif-下载) |
| 生成离线 HTML 或通过 Node 导出 GIF | [离线 HTML](packages/flowsvg/README.zh-CN.md#离线-htmlnode-20)、[Node GIF 导出](packages/flowsvg/README.zh-CN.md#node-gif-导出node-20) |
| 编写场景与动作 | [文档与时间线](packages/flowsvg/README.zh-CN.md#文档与时间线) |
| 监听事件、处理错误和主题 | [事件](packages/flowsvg/README.zh-CN.md#事件)、[主题与无障碍](packages/flowsvg/README.zh-CN.md#主题与无障碍)、[校验与错误](packages/flowsvg/README.zh-CN.md#校验与错误) |

## 环境要求

| 用途 | 要求 |
| --- | --- |
| 开发本仓库 | Node.js 22.12+、pnpm 10.12.1 |
| 单独运行 SDK 核心 | Node.js 18+，或支持 ES2022 ESM 的运行环境 |
| 浏览器播放器 | 支持 SVG、ES Modules、`requestAnimationFrame` 的现代浏览器 |
| 浏览器 GIF 导出 | Canvas 2D、图像解码、Blob worker，且宿主内容安全策略允许使用这些能力 |
| Node HTML 生成 / CLI | Node.js 20+；生成 HTML 无需浏览器 |
| Node GIF 导出 | Node.js 20+、预装 Chromium、系统库和字体 |
| Vue / React 接入 | Vue 3.5+ / React 18+；按需安装对应框架 |

仓库的 Vue/React 示例使用 Vite 7，因此开发环境要求高于单独运行 SDK 核心的要求。包仅提供 ESM 入口。

## 开发

在仓库根目录安装依赖并构建 SDK：

```sh
pnpm install --frozen-lockfile
pnpm build
```

按 SDK、共享作者产物、原生/React/Vue 的顺序构建三个独立静态站点：

```sh
pnpm build:examples
SHOWCASE_SOURCE=dist/acceptance.js SHOWCASE_BASE=/showcase/ pnpm build:examples
```

第一条命令使用正式目录；第二条显式选择验收输入和子路径。各 app 的 `dist/` 须分别托管在其配置的基础路径。资源边界和重建规则见[展示交付与验收](docs/SHOWCASE-VERIFICATION.md)。

### 运行 Vue 示例

```sh
pnpm --filter flowsvg-vue-example dev
```

打开终端显示的本地地址。React 示例使用：

```sh
pnpm --filter flowsvg-react-example dev
```

### 运行原生浏览器示例

```sh
pnpm --filter flowsvg-native-example dev
```

打开 Vite 输出的本地地址。原生、React、Vue 通过各自公开 SDK adapter 消费同一私有作者目录和会话规则。三站点采用统一的圆角中性控件、交互反馈和响应式播放工具栏。正式目录默认打开「请求与响应」（`request-response`）：10 秒订单流程，连线统一使用曲线，保留 SDK 默认风格。第二个示例「RAG：从资料到答案」（`rag-workflow`）用 21 秒演示虚构资料入库、检索、可选重排（5 个候选保留 2 段）及带来源的答案生成，采用紧凑三行布局、曲线与胶囊标签，不调用真实服务。第三个示例「FlowSVG：图解如何运行」（`project-architecture`）用 24 秒讲解文档求值、共享播放器与适配器、可选导出路径和私有展示工程边界。第四个示例「vllm-metal：分层推理架构」（`vllm-metal-stack`）参考[官方架构图](https://raw.githubusercontent.com/vllm-project/vllm-metal/main/docs/assets/architecture.svg)，用 24 秒展示四层结构、嵌套职责分区和硬件／配置条件。视觉设置保留操作时刻与倍率并暂停；切换示例保留视觉选择、重置时间与倍率。播放器替换时取消旧 GIF 任务。各 app 的 `dev` / `build` 会先生成共享作者产物，`preview` 仅服务已有静态产物。修改 SDK 后重新执行 `pnpm build`，修改共享作者源后重启开发命令。隔离验收目录、子路径配置及材料归属见[原生说明](apps/native-example/README.md)、[React 说明](apps/react-example/README.md)、[Vue 说明](apps/vue-example/README.md)和[共享作者说明](packages/showcase/README.md)。

正式示例按内容最多的阶段确定紧凑节点尺寸，收紧行列间距；播放时保持节点尺寸与位置稳定。

新增「后台任务生命周期」（`job-lifecycle`，18 秒）、「订单事件：从采集到指标」（`order-event-pipeline`，21 秒）、「Web 服务：双副本部署」（`web-service-deployment`，20 秒）和「缓存未命中：查询与回填」（`cache-aside-sequence`，19 秒），分别展示唯一当前状态、事件计数与金额守恒、嵌套部署边界、七行消息先后。八例统一使用 SDK 默认风格；时序示例用直线消息；状态转换、订单数据流、双副本部署使用正交折线；前四个示例使用曲线。正交路由在箭头空间允许时将跨接线段居中，同向端口优先使用单一外侧通道，并为各自分组边框留出空间。数据均为自包含教学样本。

示例导航依次显示六个已填充大类：「业务流程」「系统架构」「状态转换」「数据流」「部署拓扑」「交互时序」。前两类各保留两个示例，其余各新增一个示例。每例只选一个主类；分类属于展示元数据，不写入图解 JSON。

“Share current view” 保存并复制示例、时间和视觉设置，分享不打断播放。链接与前进后退按已保存快照暂停恢复，倍率采用目标示例默认值；非法参数有诊断，无关查询原文保留，复制失败可手动复制地址。

维护者运行 `pnpm release` 独立完成 SDK 验证、打包与发布预演，无需构建示例工程。运行 `pnpm release:publish` 会重新验证并上传已验证的 tarball。账号登录与发布步骤见 [npm 发布指南](docs/RELEASING.md)。

```text
packages/flowsvg/                   SDK 源码、类型、样式、测试和发布文件
packages/flowsvg/src/core/          核心模型、文档校验、图解求值与核心契约测试
packages/flowsvg/src/browser/       播放器、DOM、控件、输入、生命周期及浏览器测试
packages/flowsvg/src/adapters/      React、Vue、Web Component 实现与测试
packages/flowsvg/src/export/        浏览器 GIF 规划、栅格化与内嵌 worker
packages/flowsvg/src/node/          Node HTML/GIF 工具与 CLI
packages/flowsvg/src/portable/      独立浏览器构建入口
packages/flowsvg/tests/integration/ 四种宿主共用的集成场景
packages/flowsvg/tests/             真实浏览器验收页面与 HTML/GIF 测试
packages/showcase/                  私有共享作者源、会话转换与生成 JSON
apps/native-example/                Vite 原生单页展示
apps/vue-example/                   Vue 单页展示
apps/react-example/                 React 单页展示
docs/adr/                           架构决策
GLOSSARY.md                         领域术语
```

### 验证

先按[发布指南](docs/RELEASING.md#浏览器与最低运行时准备)准备 Chromium 和字体。把下方路径替换为本机已准备的浏览器，再在仓库根目录运行类型检查、测试和发布预演：

```sh
export FLOWSVG_CHROMIUM_PATH=/absolute/path/to/chromium
pnpm typecheck
pnpm test
pnpm release --dry-run
```

示例验收与仓库总体验收使用显式入口：

```sh
pnpm test:examples
pnpm test:all
```

`test:examples` 构建并检查共享契约、三个真实宿主及复制产物的根路径/子路径交付。`test:all` 先运行 SDK 类型、测试和真实 tarball 验证，再运行示例流程。上方 SDK 命令继续独立于展示工程。细分入口见[展示验收说明](docs/SHOWCASE-VERIFICATION.md)。

`FLOWSVG_NODE20_PATH` 可选择已准备的 Node 20 可执行文件验收工具，`FLOWSVG_NODE18_PATH` 启用既有 SDK 的最低运行时检查。测试不下载浏览器。发布验收安装真实 tarball，再把完整工具与固定版本的自动化运行时复制到包外，断网验证 HTML/GIF。

## License

[MIT](packages/flowsvg/LICENSE)。使用、修改和分发时，请保留许可证及版权声明。
