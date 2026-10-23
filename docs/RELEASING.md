# npm 发布指南

项目品牌名为 FlowSVG（流形）。唯一发布包是 `packages/flowsvg`，npm 包名为 [`flowsvg`](https://www.npmjs.com/package/flowsvg)，维护者为 `zac_ma`。工作区根包与示例包均为 private。开发与发布需要 Node.js 22.12+ 和 pnpm 10.12.1。

截至 2026-10-23，已核对 npm 的 `latest` 为 `0.2.0`。仓库 SDK 版本已更新为待发布的 `0.2.1`，包含画面状态求值复用、React/Vue 共享宿主生命周期，以及 Node GIF runtime 与取消资源清理优化。公开 API 和既有时序、渲染契约保持不变。`0.2.1` 尚未上传到 npm。

发布脚本读取 SDK `package.json` 的版本，生成 `dist/releases/flowsvg-0.2.1.tgz`。先运行下方发布预演，再显式执行上传。包内 CHANGELOG 的 `0.2.1` 记录本次优化。`0.2.0` 的时序契约继续生效：单条传递节拍改为按距离移动加 500ms 到达区间，迁移时使用 `Diagram.beats` 读取实际边界；较长阅读时间使用独立无传递节拍。已发布的 `0.2.0` 及更早产物不可覆盖，同一版本不能重复发布。

## 浏览器与最低运行时准备

先在仓库根目录安装依赖：

```sh
pnpm install --frozen-lockfile
```

完整 SDK 与发布验收需要预先准备的 Chromium、系统库和字体。可以使用已有 Chromium 的可执行文件，也可以在联网准备阶段显式安装：

```sh
pnpm --filter flowsvg exec playwright-core install chromium
```

上述命令显式下载浏览器；普通安装和测试不会下载浏览器。在受支持的 Linux 系统中，可用 `install --with-deps chromium` 同时准备系统库。中文及其他所需字体须提前安装，验收不承诺跨平台像素一致。

如使用工具默认安装的 Chromium，可查询可执行文件路径：

```sh
pnpm --filter flowsvg exec node --input-type=module -e 'import { chromium } from "playwright-core"; console.log(chromium.executablePath())'
```

把查询结果或已有 Chromium 的路径设为 `FLOWSVG_CHROMIUM_PATH`。发布验收要求显式设置该变量，即使默认缓存中已有浏览器。

浏览器用于发布前的真实产物验收：脚本安装打包后的 SDK，启动 Chromium 检查 Node GIF 导出，以及离线 HTML 的播放和 GIF 下载。上传 npm 本身不需要浏览器，但 `pnpm release`、`pnpm release:verify` 和 `pnpm release:publish` 都包含这项检查。

内部架构优化保留上述真实浏览器验收。`adapters/host-lifecycle` 与 `node/gif-runtime` 是打包文件清单中的内部运行依赖，不是新增 npm 导出入口。Node runtime 的确定性测试补充取消与资源清理覆盖；它们不替代安装 tarball 后的 Chromium 验收。构建和 `release:verify` 都会重建 `dist`，须顺序执行。

macOS 已安装 Google Chrome 时，可直接使用以下路径，无需另行下载 Chromium。在仓库根目录运行预演：

```sh
FLOWSVG_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm release
```

确认准备上传时，可在同一命令中指定路径：

```sh
FLOWSVG_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" pnpm release:publish
```

上述写法只对该命令生效。`export` 则对当前终端及其子进程生效；关闭终端或重启 VS Code 后，临时设置不会保留。使用 zsh 时，如需新终端自动加载路径，将以下一行加入 `~/.zshrc`：

```sh
export FLOWSVG_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

保存后新建终端，或在当前终端运行 `source ~/.zshrc`。VS Code 终端须使用 zsh 才会读取该文件。上传前可检查变量和可执行文件：

```sh
printenv FLOWSVG_CHROMIUM_PATH
test -x "$FLOWSVG_CHROMIUM_PATH" && "$FLOWSVG_CHROMIUM_PATH" --version
```

若报错 `Set FLOWSVG_CHROMIUM_PATH to prepared Chromium`，表示运行发布脚本的进程未收到该变量；使用上方单行命令，或在同一终端重新 `export`。若路径存在但浏览器启动失败，检查浏览器安装、系统库和字体。`whatwg-encoding` 弃用警告不是此次缺少变量的原因；`Node 18 executable not provided` 表示跳过最低运行时检查。

`FLOWSVG_NODE18_PATH` 和 `FLOWSVG_NODE20_PATH` 分别引用已准备的 Node 18、Node 20 可执行文件，用于确认最低运行时。省略 Node 18 路径时，脚本报告跳过最低运行时检查；省略 Node 20 路径时，脚本使用当前 Node。检查不安装 Node。

## 发布预演

完成上述准备后，在仓库根目录执行。下方路径须替换为实际可执行文件：

```sh
export FLOWSVG_CHROMIUM_PATH=/absolute/path/to/chromium
pnpm release
```

`pnpm release` 默认只预演，不上传，也不要求 npm 登录。脚本依次完成：

1. 运行 SDK 类型检查。
2. 运行 SDK 行为测试与发布脚本测试。
3. 打包并在临时项目中验证 tarball。
4. 输出已验证的 tarball 路径与 SHA256。
5. 对该 tarball 运行 `npm publish --dry-run`。

任一步失败，脚本立即停止。SDK 发布门禁不读取或构建示例 app、共享展示 package。SDK 类型、行为、浏览器与 tarball 消费验收只使用 SDK 自有输入。示例交付通过 `pnpm build:examples` 和 `pnpm test:examples` 单独运行；`pnpm test:all` 显式组合 SDK 与示例验收，但不进入发布门禁。根路径/子路径独立交付检查见[展示验收说明](SHOWCASE-VERIFICATION.md)。依赖检查与逐项迁移映射见 [SDK 验收说明](SDK-VERIFICATION.md)。可运行 `pnpm release --help` 查看参数；`pnpm release --dry-run` 与默认行为相同。

tarball 验证先删除 SDK 的 `dist`，再通过 `npm pack` 触发 `prepack` 构建，并检查所有导出文件、类型声明、样式、图片和文件白名单。脚本将构建后的包解压到临时目录，如临时 README 包含相对图片地址，则将其转换为当前包版本的 npm CDN 地址，再以 `--ignore-scripts` 重新打包，确认文件集合未变。源码 README 保留相对图片地址，本地预览不依赖版本发布。随后脚本在临时项目中验证无框架安装、无 DOM 导入、严格类型检查、最低 React 18.0.0 / Vue 3.5.0 的类型与服务端渲染，以及原生、Web Component、React 和 Vue 的挂载、更新与清理。临时安装默认自动删除。

核心消费验收还通过已安装包的公开入口验证无 DOM 的 `measureNodeContent` 调用、只读内容版本集合、已知推荐高度及写回尺寸后的求值结果；严格类型检查覆盖三项公开测量类型。

验证通过的同一份 tarball 保存在 `dist/releases/flowsvg-<version>.tgz`，后续预演与上传均使用该文件，不重新打包。发布文件应只有 `package.json`、中英文 README、CHANGELOG、PATTERNS、LICENSE，列出的 `docs/images/*.png` 示例图和 `docs/images/flowsvg-wordmark.gif` 品牌图，以及公开入口、`dist/core/`、`dist/browser/`、`dist/export/`、`dist/node/` 与 `dist/adapters/` 内部模块的 JavaScript 与类型声明、`dist/styles.css`，以及 `dist/portable/` 的播放器、导出器、CSS、版本清单和许可证。各分入口 TypeScript 编译保留内部目录层级。`scripts/verify-release.mjs` 逐模块列出允许产物；增加内部模块时同步更新允许清单。源 `.ts`、测试产物、fixture 和未声明文件均不得进入 tarball。

## 登录与上传

确认源码已提交到准备发布的提交，且发布版本尚未使用。包内中英文 README 应描述本次 tarball 提供的能力；发布状态与预演流程保留在仓库文档中。同步更新根目录 README 的“尚未发布”说明与本指南中的版本信息。检查 `package.json` 中的仓库、主页和问题反馈地址。发布元数据指向公开源码仓库；发布前核对仓库、主页与问题反馈地址。

包内中英文 README 面向前端开发者，仅保留定义图解、播放、控制和导出。详细字段、接入语义与示例图保存在仓库的 [SDK 手册](SDK-GUIDE.zh-CN.md)，不额外加入 npm 文件白名单。示例图源文件仍位于 `packages/flowsvg/docs/images/` 并随包分发。当前 README 在最前面居中展示动态 Logo，不嵌入完整图库。发布脚本将 Markdown 图片和 HTML `<img>` 中的 `./docs/images/` 地址转换为按包版本固定的 npm CDN 地址，且只修改临时 README 副本。语言切换与许可证链接继续指向 npm CDN；完整手册链接指向 GitHub 仓库，访问范围取决于仓库可见性。上传时使用重新生成并验证的最终 tarball。图片生成来源与刷新方式见[图片说明](README_IMAGES.md)。

登录 npm 官方 registry：

```sh
npm login --registry=https://registry.npmjs.org/
```

`flowsvg` 的维护者已确认为 `zac_ma`。发布时使用该账号或已获授权的其他账号。可通过 `npm whoami --registry=https://registry.npmjs.org/` 核对当前账号，通过 `npm owner ls flowsvg --registry=https://registry.npmjs.org/` 核对维护者。

准备上传时，在仓库根目录执行：

```sh
pnpm release:publish
```

该命令等同于 `pnpm release --publish`。脚本先检查 npm 登录状态，再重新运行全部检查、打包与预演；全部通过后，将同一份已验证的 tarball 上传到 npm 官方 registry，并按 npm 提示完成双重验证。脚本不会创建 Git 提交或版本标签。

如果 npm 返回 HTTP 202 并提示包正在处理，表示 registry 已接受上传。等待处理完成后再运行下方的版本查询；此时公开 registry 可能短暂显示占位版本。

如需单独运行 tarball 验证，可执行 `pnpm release:verify`。需要保留验证产物时，在仓库根目录执行 `node scripts/verify-release.mjs --pack-destination ./dist/releases`。发布 tarball 不会重新运行包目录的生命周期钩子，因此上传入口会显式运行全部检查。

## 上传后确认

上传成功后查询 `latest` 的版本与导出元数据，确认版本等于本次发布版本，新增入口和 CLI 均存在：

```sh
npm view flowsvg version exports bin dist.integrity --json --registry=https://registry.npmjs.org/
```

在仓库外的新项目中安装本次发布的明确版本，按 SDK README 验证需要的入口。确认成功后再创建对应的版本标签。后续发布时同时更新包版本、CHANGELOG、受影响的 SDK 用法、根目录 README 的发布状态和本指南中的版本说明；发布流程自动根据包版本生成图片 URL。

## 离线 HTML 与 GIF 资产

构建保留 ESM 与类型声明，另生成 Node 20+ 入口、CLI 和 `dist/portable/` 资产。白名单逐项列出模块、CSS、版本清单和许可证。`esbuild` 是固定版本的构建依赖；HTML 生成和复制后的 HTML 工具无需 `node_modules` 或浏览器。复制工具时须保留完整、同版本的 `dist/`。

`renderHtml(document, { gifExport: true })` 和 HTML CLI `--gif-export` 在播放器前内嵌匹配的导出器与 worker；默认 HTML 不包含编码器。验收覆盖两种装配的离线 `file://` 播放、恶意嵌入文本和实际下载 GIF 的独立解码。

`dist/portable/export.js` 内嵌 gifenc worker，发布白名单同时要求 `LICENSE.gifenc.txt`。导出资产与普通播放器分开装配。

Node GIF 导出把 `playwright-core@1.58.2` 声明为运行依赖，并只在需要启动浏览器时动态加载。普通安装不包含 Chromium，也不自动下载浏览器。HTML 生成和复制后的 HTML 工具无需自动化依赖；复制后的 GIF 工具需要在工具旁安装该版本的 `playwright-core`，并提前准备浏览器、系统库和字体。新增 Node 入口和 CLI 要求 Node 20+；既有核心入口继续要求 Node 18+。

Node 函数通过 `executablePath` 使用预装 Chromium，也可传入已连接的 Playwright `browser`。验收需要核对任务 context 清理且外部会话保留、SIGINT/SIGTERM 取消非零退出，以及 HTML/GIF 原子交付和默认不覆盖。任务不使用浏览器自动化库的默认进程信号处理，避免进程在资源清理前退出。

## 独立产物验收

`verify-release.mjs` 在缺失 `dist` 时触发冷构建，逐文件检查新增入口、声明、CLI、portable manifest、内嵌 worker 与许可证，然后正常安装真实 tarball。安装允许依赖生命周期脚本；隔离的浏览器目录必须保持不存在。严格类型检查明确加载 Node/React 类型，不跳过依赖声明检查。

脚本把 `verify-portable-consumer.mjs` 复制到临时消费项目，只调用安装后的公开入口。随后复制完整 `dist/` 和固定版本 `playwright-core` 到独立目录，阻断网络后生成 HTML 和 GIF。在离线 Chromium 中打开 `file://`、播放并下载 GIF；使用独立 `gifuct-js` 解码尺寸、像素、延迟和循环字段。Node API 验收还覆盖区间、速度、帧率、说明、减少动画、资源上限、取消和环境错误。

准备 Node 18 与 Node 20 可执行文件后，可在仓库根目录运行完整最低版本验收：

```sh
FLOWSVG_NODE18_PATH=/absolute/path/to/node18 \
FLOWSVG_NODE20_PATH=/absolute/path/to/node20 \
FLOWSVG_CHROMIUM_PATH=/absolute/path/to/chromium \
pnpm release
```

环境准备和省略路径时的行为见[浏览器与最低运行时准备](#浏览器与最低运行时准备)。GIF 有效时长、采样、最终编码帧和尺寸上限见 [SDK 使用手册](SDK-GUIDE.zh-CN.md#浏览器-gif-导出)。保留临时消费目录时设置 `KEEP_RELEASE_TEMP=1`；默认在验收结束后删除。每次验收重新记录实际环境与结果；临时日志和产物指纹保存在本地。
