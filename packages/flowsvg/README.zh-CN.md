<p align="center">
  <img src="./docs/images/flowsvg-wordmark.gif" alt="FlowSVG" width="280">
</p>

<p align="center">声明式 SVG 图解，支持时间线播放与 SVG/PNG/GIF 导出。</p>

<p align="center"><a href="https://cdn.jsdelivr.net/npm/flowsvg@0.3.1/README.md">English</a> | 简体中文</p>

<p align="center">
  <a href="https://www.npmjs.com/package/flowsvg"><img src="https://img.shields.io/npm/v/flowsvg?logo=npm&label=npm" alt="npm 版本"></a>
  <a href="https://www.npmjs.com/package/flowsvg"><img src="https://img.shields.io/npm/dm/flowsvg?logo=npm&label=downloads" alt="npm 月下载量"></a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#接入方式">接入方式</a> ·
  <a href="#导出">导出</a> ·
  <a href="#编写图解">编写图解</a> ·
  <a href="#控制播放">播放 API</a> ·
  <a href="#核心-api--flowsvg">核心 API</a>
</p>

在一份 JSON 或 TypeScript 文档中定义节点、连线、场景与节拍。同一文档可用于原生浏览器、Vue、React 或 Web Component 播放器，也可生成独立的离线 HTML。

节点位置和尺寸由作者明确指定。FlowSVG 负责渲染和播放作者编排的布局。

## 典型示例

下面四张图展示 FlowSVG 如何使用同一份文档、时间线和导出路径，解释完整的节点图形目录、简单的请求流程、服务部署拓扑与分层模型架构。

### 基础图形

图形目录把所有公开节点图形放进同一条可执行流程，并展示测量标签、正交连线、高亮和播放控制。

<p align="center"><img src="https://yokingma.github.io/FlowSVG/previews/basic-shapes.gif" alt="FlowSVG 节点图形动画目录" width="700"></p>

### 请求与响应

客户端通过 API 网关发送请求，同时执行身份验证和库存检查；订单服务随后通过网关返回结果。

<p align="center"><img src="https://yokingma.github.io/FlowSVG/previews/request-response.gif" alt="请求与响应流程" width="700"></p>

### Web 服务部署

图中展示公共 HTTPS 入口、两个应用副本、缓存与数据库层、独立复制、健康检查，以及后续请求切换到健康副本。

<p align="center"><img src="https://yokingma.github.io/FlowSVG/previews/web-service-deployment.gif" alt="双副本 Web 服务部署" width="700"></p>

### LLM 推理

图中展示 token 位置经过 Transformer 层、因果预填充和 KV Cache 更新，最后进行下一个 token 采样；状态向量、缓存层和模型输出保持在同一画面中。

<p align="center"><img src="https://yokingma.github.io/FlowSVG/previews/llm-inference.gif" alt="包含 Transformer 层和 KV Cache 的 LLM 推理" width="700"></p>

## 安装

```sh
npm install flowsvg
```

包提供 ESM 入口与 TypeScript 类型声明。

| 用途 | 运行要求 |
| --- | --- |
| 无 DOM 核心 | Node 18+ 或兼容 ES2022 的浏览器 |
| 浏览器播放 | DOM、SVG 与 `requestAnimationFrame` |
| Vue / React | Vue 3.5+ / React 18+ |
| Node 导出工具 | Node 20+；图像导出还需准备 Chromium |

## 快速开始

以下示例用于支持包导入的应用，例如使用构建工具的 TypeScript 项目。播放器代码须在客户端运行，且宿主元素已存在。

### 1. 定义图解

保存为 `diagram.ts`：

```ts
import type { DiagramDocument } from "flowsvg";

export const diagram: DiagramDocument = {
  version: 1,
  viewport: { width: 640, height: 240 },
  nodes: [
    { id: "client", kind: "roundedRect", x: 40, y: 90, width: 140, height: 64, label: "Client" },
    { id: "service", kind: "roundedRect", x: 400, y: 90, width: 180, height: 64, label: "Service" }
  ],
  edges: [{ id: "request", from: "client", to: "service", route: "orthogonal" }],
  scenes: [{
    id: "request-response",
    label: "Request and response",
    beats: [
      { durationMs: 1000, caption: "Send request", actions: [
        { type: "flow", target: "request", direction: "forward", text: "Request" }
      ] },
      { durationMs: 1000, caption: "Return response", actions: [
        { type: "flow", target: "request", direction: "reverse" }
      ] }
    ]
  }]
};
```

请求使用文字胶囊，响应使用反向移动的圆点。

- 只有一个 `flow` 的节拍会按路径长度计算时长，替换 `durationMs`。
- 通过 `createDiagram(diagram).beats` 读取实际边界。
- 需要停留阅读时，另加不含 `flow` 的节拍。

### 2. 在浏览器播放

在页面中添加宿主元素：

```html
<div id="diagram"></div>
```

在客户端模块中创建播放器：

```ts
import { createPlayer } from "flowsvg/browser";
import "flowsvg/styles.css";
import { diagram } from "./diagram.js";

const host = document.querySelector<HTMLElement>("#diagram");
if (!host) throw new Error("Diagram host is missing");

const player = createPlayer(host, diagram, { loop: true });
player.play();
// On disposal: player.destroy();
```

运行后，请求从 Client 移向 Service，随后响应反向返回。内置控件支持暂停、跳转、逐节拍导航与变速。

- **启动：**播放器默认暂停，本例通过 `play()` 启动。
- **循环：**`loop: true` 使整条时间线循环播放。
- **样式：**CSS 在应用中导入一次。
- **清理：**销毁原生播放器时调用 `destroy()`。

## 示例：后台任务生命周期

随包提供的图解 JSON 和 GIF 使用英文标签与字幕。

示例包含三个独立案例：

- 任务 A 重试后完成。
- 任务 B 耗尽重试次数。
- 任务 C 在执行前取消。

结构化卡片和标签显示任务状态与重试次数。带圆角的正交连线承载状态转换事件。

![后台任务生命周期：重试、完成、失败与取消](./docs/images/job-lifecycle.gif)

包内附带此示例文档：`examples/job-lifecycle.json`。

## 接入方式

以下组件复用同一份 `diagram.ts`。组件默认暂停，并负责清理播放器；点击播放按钮即可启动。CSS 在应用中导入一次。

### Vue

```vue
<script setup lang="ts">
import { FlowPlayer } from "flowsvg/vue";
import "flowsvg/styles.css";
import { diagram } from "./diagram.js";
</script>

<template>
  <FlowPlayer :document="diagram" loop />
</template>
```

组件引用、参数与事件见下文[控制播放](#控制播放)。

### React

```tsx
import { FlowPlayer } from "flowsvg/react";
import "flowsvg/styles.css";
import { diagram } from "./diagram.js";

export function Diagram() {
  return <FlowPlayer document={diagram} loop />;
}
```

ref、回调与文档更新见下文[控制播放](#控制播放)。

### Web Component

先在页面中添加元素，再从客户端模块注册组件并赋值图解：

```html
<flowsvg-player loop></flowsvg-player>
```

```ts
import { defineFlowPlayer, type FlowPlayerElement } from "flowsvg/web-component";
import "flowsvg/styles.css";
import { diagram } from "./diagram.js";

defineFlowPlayer();
const element = document.querySelector<FlowPlayerElement>("flowsvg-player");
if (!element) throw new Error("Diagram element is missing");
element.document = diagram;
```

`defineFlowPlayer(tagName = "flowsvg-player")` 返回已注册的构造器；无自定义元素注册表时返回 `undefined`。该入口也可通过别名 `flowsvg/element` 导入。

| 任务 | 用法 |
| --- | --- |
| 传入文档 | 给 `.document` 赋对象、在 HTML `document` 属性中填写 JSON，或通过 `src` 指定 JSON URL。URL 加载遵循浏览器 CORS 规则。 |
| 设置播放选项 | 使用 `loop`、`gif-export`、`reduced-motion` 等属性。`autoplay` 默认 `false`，`speed` 默认 `1`，控件默认开启。 |
| 控制或重新加载 | 使用下文[控制播放](#控制播放)中的方法，但不含 `load()`。重新赋值 `.document` 即可加载新文档。 |
| 读取状态 | 挂载前或销毁后，`getState()` 可返回 `undefined`。 |
| 处理事件 | 在元素上监听事件。事件支持冒泡并可穿过 Shadow DOM 边界；事件数据见[事件](#事件)。 |

Web Component 运行时配色使用 `element.emphasis` 对象属性，例如 `element.emphasis = { stroke: "#0f766e" }`。可在连接前赋值或稍后替换；`undefined` 清除覆盖。赋值时复制字段，重连后保留配置，选项重建恢复时间和播放状态。getter 返回副本。非法值通过现有可冒泡、可穿越 Shadow DOM 的 `error` 事件报告，并保留有效配置。不提供 `emphasis` HTML 属性。

## 控制播放

`createPlayer(host: HTMLElement, document: DiagramDocument, options?: PlayerOptions): FlowPlayer` 挂载播放器并替换宿主子元素。初始文档非法时抛出 `DiagramValidationError`。

| 方法／属性 | 行为 |
| --- | --- |
| `play(): void` / `pause(): void` | 从当前位置继续／暂停。到达终点后，`play()` 仅在开启循环时重新开始；静态图解不能播放。 |
| `seek(timeMs: number): void` | 时间限制在时间线范围内；除终点外保留播放状态，非有限值按零处理。 |
| `step(direction: 1 \| -1): void` | 暂停并跳转节拍边界；从节拍内部后退时先回到当前节拍起点。 |
| `setSpeed(speed: number): void` | 设置有限正数倍率，忽略非法值；默认 `1`。 |
| `setLoop(loop: boolean): void` | 切换整条时间线循环，保留当前位置和播放状态。 |
| `load(document: DiagramDocument): void` | 成功后暂停在零时刻；失败时触发 `error` 并保留原文档与状态。 |
| `getState(): PlayerState` | 返回 `{ timeMs, totalDuration, playing, loop, speed, frame }`，时间单位为毫秒。 |
| `destroy(): void` | 释放 DOM、监听器和动画资源，可重复调用；Vue／React ref 不提供此方法。 |
| `element: HTMLElement` | 只读宿主元素，也是事件目标；Vue／React ref 不提供此属性。 |

Vue／React ref 提供上表八个播放与状态方法。组件更新行为如下：

| 变更 | 结果 |
| --- | --- |
| 替换 `document` 对象 | 重新加载文档，成功后暂停在零时刻 |
| 修改 `theme`、`controls`、`gifExport`、`reducedMotion` 或 `hoverFill`，或替换／清除 `emphasis` | 重建播放器并暂停在零时刻 |

### 选项与组件属性

| `PlayerOptions` | 默认值／含义 |
| --- | --- |
| `theme?: "light" \| "dark"` | 使用文档主题，未设置时为 `"light"`。 |
| `emphasis?: EmphasisColors` | 逐字段覆盖文档配色和主题默认值；框架播放器通过替换对象更新。 |
| `controls?: boolean` | `true`；显示播放控件。 |
| `loop?: boolean` | `false`；循环整条时间线。 |
| `gifExport?: boolean` | `false`；在 `controls` 开启时显示 GIF 下载控件。 |
| `hoverFill?: boolean` | `false`；悬停仅高亮边框，设为 `true` 时同时高亮背景。 |
| `reducedMotion?: boolean` | 跟随浏览器偏好；`true` 隐藏传递标记并立即完成视觉过渡，保留时间线时长。 |

Vue／React 组件另提供以下 `FlowPlayerProps`：

| 属性 | 含义 |
| --- | --- |
| `document: DiagramDocument` | 必填的图解文档 |
| `speed?: number` | 播放倍率，默认 `1` |
| `initialTimeMs?: number` | 初始位置，仅首次应用 |
| `className`、`style` | 宿主容器样式 |

替换 `emphasis` 对象可更新配色，清除后回退到文档和主题。播放器复制已提供字段，之后修改原对象不会改变画面。框架选项重建不再次应用 `initialTimeMs`。

两个框架入口均导出 `FlowPlayerHandle` 与 `FlowPlayerProps` 类型。原生播放器通过 `play()` 启动，通过 `setSpeed()` 修改倍率。

### 事件

原生播放器在 `player.element` 派发 `CustomEvent`，数据位于 `event.detail`。Vue 处理函数与 React 回调直接接收事件数据。

| 原生／Vue 事件 | React 回调 | 数据 |
| --- | --- | --- |
| `stepchange` | `onStepChange` | `PlayerState`；场景／节拍选择变化。 |
| `timeupdate` | `onTimeUpdate` | `PlayerState`；画面更新。 |
| `playstatechange` | `onPlayStateChange` | `PlayerState`；播放状态变化。 |
| `loopchange` | `onLoopChange` | `PlayerState`；循环设置变化。 |
| `error` | `onError` | `PlayerErrorDetail`：播放器状态加 `error: Error`。 |
| `hover`、`click` | — | 原生／Web Component：`{ id, type, point, timeMs, sceneId, beatId }`；未命中时为 `null`。别名为 `objecthover`、`objectclick`。 |

- **坐标：**交互数据中的 `point` 使用图解坐标；`type` 为 `"node"` 或 `"edge"`。
- **顺序：**画面更新时，如需派发 `stepchange`，该事件先于 `timeupdate`。
- **挂载前：**Web Component 错误可能不包含播放器状态字段。

### 复用选择控件

从 `flowsvg/browser` 导入 `SelectControl`，按以下顺序管理控件：

1. 使用 `new SelectControl(owner: Document, label: string, onChange: (value: string) => void)` 创建控件。
2. 将 `.element` 挂载到容器。
3. 调用 `render(choices: readonly SelectChoice[], value: string, disabled = false)` 同步状态。每个选项为 `{ value, label }`，应用负责管理已提交的值。
4. 卸载时调用 `destroy()`。

## 导出

### 在 Node 或浏览器中导出 SVG

```ts
import { createDiagram } from "flowsvg";
import { diagram } from "./diagram.js";

const compiled = createDiagram(diagram);
const svg = compiled.renderSvg(0, { background: "transparent" });
```

`svg` 是完整的 SVG 字符串。复用 `compiled` 可渲染其他时刻或对其他时刻求值，时间单位为毫秒。省略 `background` 时使用主题背景。

### 在浏览器中导出 PNG 和 GIF

```ts
import { exportGif, exportPng } from "flowsvg/export";
import { diagram } from "./diagram.js";

const png = await exportPng(diagram, {
  timeMs: 0,
  width: 1280,
  background: "transparent"
});
const gif = await exportGif(diagram, { width: 640, fps: 15 });
```

两个函数均返回 `Promise<Uint8Array>`；请等待字节结果，再由应用保存或下载。

| 格式 | 浏览器要求 |
| --- | --- |
| PNG | Canvas 2D 与 SVG 图像解码 |
| GIF | PNG 的要求，加上宿主内容安全策略允许的 Blob worker |

文字使用本机已安装的系统字体。

### PNG 参数与限制

`exportPng` 返回完整 PNG 字节，不触发下载。以下选项决定导出时刻与输出形式：

| 选项／输出 | 默认值与行为 |
| --- | --- |
| `timeMs` | 默认 `0`，必须在编译后时间线范围内；静态文档仅接受 `0` |
| `width` | 默认文档宽度，取整为像素 |
| 输出高度 | 按选中镜头比例取整，至少为 1 像素 |
| 镜头与状态 | 保留选中时刻的 `fitHeight`、焦点、显隐与过渡 |
| `theme`、`reducedMotion` | 沿用核心求值语义；减少动态效果默认 `false` |
| `background` | `theme` 或 `transparent`，默认 `theme` |
| `signal` | 通过 `AbortSignal` 取消导出 |

SVG 接受相同的 `background` 选项。透明背景仅移除整图底色，保留节点填充与边标签背景。

**限制与失败处理：**

- 每边最多 8192 像素，总像素最多 32,000,000。
- 按取整后尺寸预检，不自动缩小输出。
- `PngExportError.code` 区分 `options`、`document`、`limit`、`environment`、`rasterization`、`encoding` 和 `cancelled`。
- 成功、失败及取消后，释放任务使用的 canvas、图像和 URL。

通过 `exportPng` 导出 PNG；播放器不提供 PNG 下载按钮。

### GIF 参数与限制

| `GifExportOptions` | 默认值／含义 |
| --- | --- |
| `theme`、`reducedMotion` | 文档主题，未设置时为 `light`；减少动态效果默认 `false`。 |
| `startMs`、`endMs`、`speed` | 默认导出完整时间线，倍率 `1`；区间含起点、不含终点，完整时间线终点包含完成状态。 |
| `width`、`fps` | 默认 `min(viewport.width, 1280)` 像素；每秒 `15` 次采样（整数 `1`–`30`）。 |
| `includeCaptions`、`captionHeight` | 默认 `true`，固定字幕区域高度为 `80` 像素。说明文字保留完整拉丁字母单词和显式换行；单个单词超宽时报告 `caption-overflow`。 |
| `loopCount`、`finalHoldMs` | `0` 为无限循环，`1`–`65536` 为总播放次数；默认追加 `1000` 毫秒结尾停留。与播放器循环独立。 |
| `signal`、`onProgress` | `AbortSignal`；回调接收 `{ phase, completed, total }`，阶段为 `preparing`、`sampling`、`encoding`、`complete`。 |

GIF 输出不透明图片，保留文档指定的视口尺寸与比例。

| 限制 | 上限 |
| --- | --- |
| 有效动画时长 | 120 秒 |
| 采样帧 | 1800 |
| 编码帧 | 1801 |
| 含字幕的最终长边 | 1920 像素 |

- **错误码：**`GifExportError.code` 区分 `options`、`limit`、`document`、`caption-overflow`、`environment`、`rasterization`、`encoding` 和 `cancelled`。
- **导出类型：**两个导出入口均提供 `GifExportError` 和各自选项／进度类型。

### Node 工具

| 入口／函数 | 返回值／要求 |
| --- | --- |
| `flowsvg/node` → `renderHtml(document, options?: HtmlRenderOptions)` | `Promise<string>`；生成包含播放器的独立离线 HTML，要求 Node 20+，无需浏览器。 |
| `flowsvg/node` → `exportPng(document, options?: NodePngExportOptions)` | `Promise<Uint8Array>`；Node 20+ 与已安装 Chromium。 |
| `flowsvg/node` → `exportGif(document, options?: NodeGifExportOptions)` | `Promise<Uint8Array>`；要求 Node 20+ 与已安装 Chromium。 |

按以下顺序准备 Node 图像导出：

1. 离线前安装 Chromium 与所需字体。安装包和导出过程均不会下载浏览器。
2. 设置 `executablePath` 或调用方持有的 Playwright `browser`，二选一。
3. 在应用中保存或使用返回的字节。

导出保存输入快照，并在成功、失败或取消时清理任务资源。传入的 `browser` 保持打开，仍由调用方管理。

SDK CLI 支持 HTML 和 GIF 输出。PNG 使用 SDK API 导出。

安装后运行 `npx --no-install flowsvg --help` 可查看 CLI 参数。

使用源码仓库时，先在仓库根目录运行 `pnpm build`。构建产物缺失时，CLI 启动脚本会提示此步骤。

离线 HTML 的 `HtmlRenderOptions` 支持以下选项：

| 选项 | 默认值 |
| --- | --- |
| `theme` | 文档主题，未设置时为 `light` |
| `autoplay` | `false` |
| `loop` | `false` |
| `controls` | `true` |
| `gifExport` | `false` |

### 内置 GIF 下载

按接入方式启用 GIF 下载：

| 接入方式 | 设置 |
| --- | --- |
| 原生播放器／离线 HTML | `gifExport: true` |
| Vue / Web Component | `gif-export` |
| React | `gifExport` |

内置下载按当前主题，以 `1×` 导出完整时间线；播放控件须保持开启。

## 编写图解

### 文档与动作

| 类型 | 必填字段 | 可选字段 |
| --- | --- | --- |
| `Viewport` | 有限正数 `width`、`height` | `fitHeight: { padding }`；底部留白 `padding` 为有限非负数 |
| `DiagramDocument` | `version: 1`、`viewport`、`nodes`、`edges`、`scenes` | `title`、`theme`、`emphasis`、`typography` |
| `DiagramNode` | `id`、`kind`、`x`、`y`、`width`、`height` | 互斥的 `label`／`content`，以及 `parentId`、`visible`、`style` |
| `DiagramEdge` | `id`、`from`、`to` | `route`、`fromPort`、`toPort`、`label`、`visible`、`style` |
| `Scene` | `id`、`label`、`beats` | — |
| `Beat` | `durationMs`、`actions` | `transitionMs`、`caption` |

文档 `emphasis?: EmphasisColors` 接受可选字段 `fill`（节点高亮填充）、`stroke`（节点与连线高亮描边及标记底色）、`markerText`（标记文字）。核心视觉选项和浏览器 `PlayerOptions` 同样接受 `emphasis`；各字段依次取运行时覆盖、文档配置、当前主题。文档配色供浏览器悬停和全部导出共用；悬停本身不进入导出。浏览器播放器在创建时复制运行时配色，`load` 保留覆盖并从新文档重新读取缺省字段。非法运行时字段在分配浏览器资源前抛出带 `options.emphasis` 路径的 `TypeError`。颜色支持 `#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`；`undefined` 视为缺省，`null`、非法颜色和未知字段报告校验路径。

- **静态文档：**使用空 `scenes`。
- **节点类型：**`rect`、`roundedRect`、`ellipse`、`cylinder`、`group`、`diamond`、`parallelogram`、`document` 和 `predefinedProcess`。分组边框默认为圆角。
- **连线路由：**`straight`（默认）、`orthogonal`、`curved`。
- **端口方向：**`top`、`right`、`bottom`、`left`。
- **节拍时长：**`durationMs` 须为正数。`transitionMs` 须位于 `[0, durationMs]`，默认 `min(250, durationMs)`，并受有效节拍时长限制。

每个动作包含 `{ type, target }`，其他字段按动作类型确定：

| 动作类型 | 附加字段／目标 |
| --- | --- |
| `updateNode`、`updateEdge` | 必填 `value`，字段见下表 |
| `flow` | 必填 `direction: "forward" \| "reverse"`；可选 `text`、`highlightParticipants` 和 `highlightEdge`（两个布尔值均默认 `true`） |
| `focus` | 目标为节点／分组 ID，或用 `null` 恢复完整视图 |

| 更新动作 | `value` 支持的字段 |
| --- | --- |
| `updateNode` | `x`、`y`、`width`、`height`、`label`、`content`（`null` 清空）、`fill`、`stroke`、`opacity` |
| `updateEdge` | `label`、`stroke`、`strokeWidth`、`opacity` |

- **身份：**节点与连线 ID 全局唯一。
- **坐标：**子节点位置相对父分组。
- **内容类型：**从 `flowsvg` 导入 `NodeContent` 及其内容块类型。

### 时间线规则

`show`、`hide`、`highlight`、`unhighlight`、`updateNode`、`updateEdge`、`focus` 跨节拍继承；`flow` 仅在当前节拍生效。设置 `highlightEdge: false` 关闭该次传递的连线与标签自动着色，显式高亮和普通样式插值更新仍生效；`highlightParticipants` 独立控制端点。减少动画隐藏标记并尊重两个开关，即使关闭后没有自动可见提示也不补充提示。

显隐权重与基础透明度取最小值：已存储的透明度为 `0.4` 时，显示过渡中点仍为 `0.4`。祖先分组与连线端点也按最小值组合透明度。显式 `highlighted` 在拍初改变，着色权重继续过渡；取消高亮后显示最新基础颜色，包括同拍更新。详见[节拍与动作契约](../../docs/guides/sdk-guide.zh-CN.md#节拍与动作)。

| 节拍内容 | 有效时长 |
| --- | --- |
| 单条 `flow` | 按 180 图解单位／秒移动，最短 400 ms，再执行含高亮渐变的 500 ms 到达区间；替换 `durationMs` |
| 多条传递或无传递 | 作者指定的 `durationMs` |

实际边界从 `compiled.beats` 读取。阅读停留使用独立无传递节拍。

`viewport.fitHeight: { padding: 24 }` 让播放器、SVG 和 PNG 的完整视图按当前内容调整高度。

### 决策标签与测量

`diamond` 仅用纯文本 `label` 表达决策，拒绝结构化 `content`，包括空内容块数组。居中内接矩形取节点宽高的一半，再向内保留每侧 12 个图解单位。文字整体在安全区内居中，尽量整词换行，超宽单词或 URL 仅在完整字素之间拆分。溢出文字裁剪并报告 `text-overflow`，不自动缩字或改变节点尺寸。

指定高度前调用 `measureNodeLabel({ kind: "diamond", width, label, typography? })`。`label` 接受单字符串或非空只读版本数组；`typography` 使用文档文字配置。返回 `{ height, diagnostics }`，包含共用的有限正数高度及逐版本未解决的宽度问题。每条诊断包含 `versionIndex`、`path`、`dimension: "width"` 和 `message`；增加高度无法解决宽度不足。空标签合法；非法输入或无法表示为有限数的高度抛出 `DiagramValidationError`。从 `flowsvg` 导入类型 `NodeLabelMeasurementInput`、`NodeLabelMeasurement` 与 `NodeLabelMeasurementDiagnostic`。

四方向端口、直线/正交/曲线连接、命中和诊断使用真实轮廓。裁剪掉的文字不扩大命中区或自适应高度。分组、时间线与导出共享核心结果。[可运行的决策示例](examples/decision-branch.json)展示测量后的标签替换、尺寸变化和一个有意溢出的节点。

`parallelogram` 用于输入输出，沿用相同的纯文本限制、换行、裁剪和诊断规则。顶边向右倾斜，偏移 S = min(宽度 / 4, 24) 个图解单位。矩形安全区左右各保留 S + 12、上下各保留 12 个单位。完整标签行框高为 L 时，`measureNodeLabel` 返回 L + 24；多个版本取最大高度。不提供倾斜配置字段。四方向与自动连接、命中和诊断使用实际斜边轮廓。见[输入输出示例](examples/input-output.json)。

### 文档形报告标签

`document` 预置形状仅用纯文本 `label` 表达报告或文件产物，拒绝结构化 `content`，包括空内容块；时间线 `content: null` 仍可清空文字。顶边及两侧为直线，底部波浪带高度 B = min(height / 4, 24)，单位为图解单位。每侧内边距为 12，标签安全区为 `(12, 12, max(0, width - 24), max(0, height - B - 24))`。标签在波浪带上方整体居中，沿用决策标签的完整字素换行、裁剪和溢出诊断规则。

`measureNodeLabel({ kind: "document", width: 240, label: ["Report ready", "Revenue\nBy region\nFinal report"] })` 返回高度 108。完整行框高度为 L、T = L + 24 时，T ≤ 72 的建议高度为 4T/3，否则为 T + 24。采用建议高度后仍需处理宽度诊断。端口、命中与诊断均沿真实波浪轮廓计算，波浪凹入处下方的空白不属于节点。见[报告生成示例](examples/report-generation.json)，其中包含分组运动、尺寸变化、标签替换及刻意溢出。

### 预定义流程标签

`predefinedProcess` 表达调用已定义的子流程。它是一个普通节点，包含矩形外轮廓和两条内部装饰竖线，不执行子流程，也不容纳子节点。竖线距对应外边框的间隔 D = min(宽度 / 6, 12)。相对节点原点，标签安全区为 (D + 12, 12, max(0, 宽度 − 2D − 24), max(0, 高度 − 24))。

使用纯文本 `label`；结构化 `content` 对象会被拒绝，包括空内容块数组。时间线 `content: null` 保留清空语义。标签复用决策标签的居中、完整字素换行、裁剪和溢出诊断规则。调用 `measureNodeLabel({ kind: "predefinedProcess", width: 200, label: ["A", "A\nB"] })` 返回高度 64，建议高度等于完整行框高度加 24。仅外矩形提供连接和路由障碍；点击任一内部竖线都返回所属节点身份。

SDK 自有的[子流程调用示例](examples/subprocess-call.json)包含测量标签、尺寸变化、强调和有意溢出。先运行 `pnpm --filter flowsvg build`，再以 `packages/flowsvg` 为根目录启动静态服务，打开 `/tests/browser-predefined-process.html` 即可播放公开浏览器示例。

### 结构化内容与测量

矩形（`rect`）、圆角矩形（`roundedRect`）和圆柱（`cylinder`）支持结构化 `content`，可包含标题、段落、列表、标签和实体关系小图。

1. 指定固定尺寸前，调用 `measureNodeContent({ kind, width, content, typography? })`。传入单个 `NodeContent`，或非空的内容版本数组。
2. 检查返回的 `diagnostics`，每项包含 `{ versionIndex, path, dimension, message }`。
3. 单独处理宽度溢出和固定高度关系图块内部的溢出；增加节点高度不能解决这两类问题。
4. 将返回的 `height` 写入节点。传入多个版本时，测量返回所需高度最大值。

播放使用作者指定的尺寸。

### 文档级字号

在文档中设置 `typography: { nodeLabel: 32, edgeLabel: 24, flowLabel: 20 }`。字号使用图解单位。

| 字号角色 | 默认值 | 作用对象 |
| --- | --- | --- |
| `nodeLabel` | `16` | 节点标签与分组标题 |
| `edgeLabel` | `14` | 连线标签 |
| `flowLabel` | `12` | 单行传递胶囊 |

普通节点标签、边标签和 `wrapText` 保留完整的拉丁字母单词。单个单词超宽时允许超出估算行宽，字号不自动缩小。纯竖向连线标签以两个端点中较窄节点的宽度作为水平排字范围。标签发生遮挡时，请增加节点间距或节点宽度。GIF 说明文字使用相同的单词边界，并按实际字体宽度测量。

**校验：**设置须为有限正数。无法表示的派生文字指标抛出带 `typography.<字段>` 路径的 `DiagramValidationError`。

**尺寸与继承：**

- 普通标签的换行、绘制、命中及 `fitHeight` 共用有效字号。
- 传递胶囊跟随 `flowLabel`，保持单行且不可命中。
- 未指定的结构化内容字号按 `nodeLabel / 16` 缩放。
- 显式块、列表、条目及 span 字号按既有继承顺序保留。
- 节点宽高、坐标、padding、gap、实体图块高度和编译时长保持作者指定值。

改变字号后，用相同 `typography` 调用 `measureNodeContent`，再检查溢出。

[混合审批流程](examples/mixed-flow.json)将四种形状、普通节点、分组和三种路由组合在同一图解中；包含标签替换、尺寸与样式变化，以及一个有意裁剪的标签。[生成脚本](examples/create-mixed-flow.mjs)通过公开 `measureNodeLabel` 为多个标签版本预留共同高度。

安装 `flowsvg` 后，在可写目录中放置脚本并运行 `node create-mixed-flow.mjs`，再运行 `npx flowsvg mixed-flow.json --format html --output mixed-flow.html` 生成离线播放文件。

仓库内先执行 `pnpm --filter flowsvg build`，然后运行 `node packages/flowsvg/examples/create-mixed-flow.mjs`；以 `packages/flowsvg` 为静态服务根目录时，可打开 `/tests/browser-mixed-flow.html`。

## 核心 API — `flowsvg`

时间单位均为毫秒，位置与尺寸使用图解单位。

| `EvaluateOptions` | 含义 |
| --- | --- |
| `theme?: "light" \| "dark"` | 文档主题，未设置时为 `light` |
| `reducedMotion?: boolean` | 默认 `false` |

| 函数 | 返回值／行为 |
| --- | --- |
| `createDiagram(document: DiagramDocument): Diagram` | 校验、复制、冻结并编译文档，供重复查询。 |
| `renderSvg(document: DiagramDocument, timeMs = 0, options?): string` | 编译并渲染一帧静态 SVG。 |
| `validateDocument(input: unknown): ValidationIssue[]` | 检查字段与引用，返回 `{ path, message }` 问题列表。空数组表示这些检查通过；编译阶段仍可能拒绝非有限的派生传递时长。 |
| `measureNodeContent({ kind, width, content, typography? }): NodeContentMeasurement` | 返回 `{ height, diagnostics }`，见[内容与测量](#结构化内容与测量)。 |
| `measureNodeLabel({ kind, width, label, typography? }): NodeLabelMeasurement` | 测量预置形状标签的共用高度与宽度诊断，见[决策标签](#决策标签与测量)。 |
| `wrapText(label: string, maxWidth: number, typography?): string[]` | 无 DOM 的估算换行；可选排版对象须包含 `fontSize`、`lineHeight`、`charWidth` 三个数值字段，省略时使用节点排版参数。 |

| 编译后的 `Diagram` | 返回值／行为 |
| --- | --- |
| `totalDuration: number` | 只读有效总时长；静态文档为 `0`。 |
| `beats: readonly DiagramBeat[]` | 编译后的 `{ sceneId, beatId, beatIndex, startMs, endMs, caption? }` 区间。 |
| `evaluateAt(timeMs: number, options?): DiagramFrameState` | 返回 `{ timeMs, sceneId, beatId, beatProgress, nodes, edges, camera, caption?, warnings }`。 |
| `diagnoseAt(timeMs: number, options?): GeometryWarning[]` | 按需返回连线与节点、标签与节点、标签与标签三类风险；普通求值与播放不执行成对检查。 |
| `renderSvg(timeMs = 0, options?): string` | 渲染 SVG，复用编译结果。 |
| `hitTest(timeMs: number, point: DiagramPoint, options?): HitObject \| null` | 用图解坐标 `{ x, y }` 命中检测，返回 `{ id, type }` 或 `null`。 |

### 校验与警告

核心查询将时间限制在 `[0, totalDuration]` 内，非有限值按零处理。

| 结果 | 检查位置 |
| --- | --- |
| 非法文档 | `DiagramValidationError.issues`，包含字段路径与原因 |
| 文字溢出 | `evaluateAt(timeMs).warnings` |
| 内容测量问题 | `measureNodeContent(...).diagnostics`，见[测量步骤](#结构化内容与测量) |
| 估算的几何重叠 | `diagnoseAt(timeMs)`，与画面的文字溢出警告分开返回 |

### 几何诊断

`diagnoseAt` 复用该时点的镜头、字号、连线路径和内容安全区，估算连线与节点、标签与节点、标签与标签三类重叠风险。

安全区宽度或高度为零的预置形状标签不产生绘制重叠，仍保留 `text-overflow`。`predefinedProcess` 的可见内部竖线以所属节点身份参与检查，包括透明填充样式；空心内部不产生填充绘制区域。

| 结果字段 | 含义 |
| --- | --- |
| `code` | 风险类型 |
| `path`、`objectId` | 来源字段与对象 |
| `relatedObjectIds` | 其他参与对象 |
| `warningKey` | 区分角色、字段与文字行的规范身份；标签对使用固定顺序，说明文字不参与身份 |
| `message` | 供人阅读的说明 |

记录处理决定时，源数据、SDK 身份、时间与视觉选项须在 `warningKey` 之外另行绑定。

**检查范围：**

- 排除自身标签、祖先包含、路径端点和分组边界穿越。
- 包含边标签遮挡端点、分组标题遮挡子节点的情况。
- 跳过隐藏、零透明度及被裁剪的部分。
- 透明填充仍可能有可见描边，半透明绘制也参与检查。

**精度与复核：**

- 填充按实际轮廓判断；描边与曲线使用有限采样。
- 文字采用确定性估算，不保证真实字体像素或连续动画无碰撞。
- 诊断报告风险，不调整图解。交付前仍须按目标展示尺寸检查画面。

更多字段说明可在编辑器中查看包内 TypeScript 声明与 JSDoc。

[更新日志](https://cdn.jsdelivr.net/npm/flowsvg@0.3.1/CHANGELOG.md) · [MIT](https://cdn.jsdelivr.net/npm/flowsvg@0.3.1/LICENSE)
