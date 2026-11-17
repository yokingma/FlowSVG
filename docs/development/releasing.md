# npm 与 GitHub Release 发布指南

本文供发布维护者及协助发布的代理使用。唯一 npm 发布包是 `packages/flowsvg`；SDK 使用者从包内 README 开始。版本说明以 [SDK CHANGELOG](../../packages/flowsvg/CHANGELOG.md) 为准。

## 选择入口

先检查目标版本的 npm 状态，以及本地是否存在 `dist/releases/flowsvg-<version>.tgz.release.json`（下文称“发布记录”）。

| 当前任务或状态 | 入口 | 完成条件 |
| --- | --- | --- |
| 仅验证源码和待发布产物 | [发布预演](#发布预演) | 命令成功退出，输出 tarball 路径、SHA256 和预演通过提示 |
| 新版本尚未被 npm 使用，且无发布记录 | [正式发布](#正式发布) | npm 完整性匹配，GitHub 标签和正式 Release 对应发布提交 |
| 已有发布记录，无论上传结果 | [GitHub Release 恢复](#github-release-恢复) | 匹配的正式 Release 已可见，或确认 npm 未接受且已移走记录 |
| npm 已发布，且无发布记录 | [无发布记录的旧版本](#无发布记录的旧版本) | 已发布产物与原始提交核对完成，再单独补建 GitHub Release |

普通 Git push 不触发此流程。发布预演只验证本地源码和产物；正式发布与有记录的恢复才会执行 GitHub 创建步骤。参数以 `pnpm release --help` 为准，命令映射见根 [package.json](../../package.json)。

## 浏览器与最低运行时准备

预演和正式发布需要仓库开发环境。Node.js 与 pnpm 要求见[开发说明](../../README.zh-CN.md#开发)。在仓库根目录安装依赖：

```sh
pnpm install --frozen-lockfile
```

产物验收需要预装 Chromium、系统库及所需字体。将已有浏览器路径设为 `FLOWSVG_CHROMIUM_PATH`；验收要求显式传入该变量，即使默认缓存中已有浏览器。macOS 已安装 Google Chrome 时，可在运行预演的同一终端设置：

```sh
export FLOWSVG_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
test -x "$FLOWSVG_CHROMIUM_PATH" && "$FLOWSVG_CHROMIUM_PATH" --version
```

完成条件：终端输出浏览器版本。其他系统使用实际 Chromium 可执行文件路径。若需下载浏览器，在联网准备阶段显式运行 `pnpm --filter flowsvg exec playwright-core install chromium`；Linux 系统库可通过 `install --with-deps chromium` 准备。普通安装和测试不自动下载浏览器，字体须单独准备。

最低运行时验收使用 `FLOWSVG_NODE18_PATH` 和 `FLOWSVG_NODE20_PATH` 指向已准备的 Node 可执行文件。省略前者会跳过 Node 18 检查，省略后者会使用当前 Node。完整最低版本验收须提供两者，并在日志中确认均已运行。

环境变量只对当前终端及其子进程生效。若脚本报告 `Set FLOWSVG_CHROMIUM_PATH to prepared Chromium`，在执行命令的终端检查 `printenv FLOWSVG_CHROMIUM_PATH`。需要新终端自动加载时，将对应的 `export` 放入所用 shell 的启动文件。

## 发布预演

完成[环境准备](#浏览器与最低运行时准备)后，在仓库根目录运行：

```sh
pnpm release
```

脚本依次运行类型检查、行为与发布脚本测试、真实 tarball 消费验收，以及该 tarball 的 npm 发布预演。任一步失败，命令停止；无需 npm 或 GitHub 登录。

完成条件：命令成功退出，显示 `Release preview passed`，并在 `dist/releases/flowsvg-<version>.tgz` 保留已验证产物。预演结果只证明本次源码和产物通过检查，不证明该版本已发布到 npm。

SDK 验收使用 SDK 自有输入；示例交付按[展示验收说明](../verification/showcase-verification.md)单独运行。打包检查、安装后的公开入口及浏览器验收范围见 [SDK 验证说明](../verification/sdk-verification.md)。修改发布文件集合时，同时核对包内 `package.json` 的 `files` 与 [verify-release.mjs](../../scripts/verify-release.mjs) 的允许清单。

## 正式发布

### 1. 准备版本与源码

读取包内 `package.json` 的目标版本，再查询 npm 当前版本和历史记录：

```sh
npm view flowsvg versions --json --registry=https://registry.npmjs.org/
npm view flowsvg time --json --registry=https://registry.npmjs.org/
```

完成条件：目标版本在两份记录中均未使用，且为不含预发布后缀的 `major.minor.patch`。包名转移不清除历史版本占用；已发布版本不可复用。有发布记录时，先按[恢复分支](#github-release-恢复)处理。

在 SDK CHANGELOG 中添加非空的 `## <version> - YYYY-MM-DD` 条目。同步版本链接和受影响的使用文档；README 更新条件按仓库文档同步规则判断。图片维护遵循[预览图说明](../assets/image-previews.md)，上传前按 [Pages 验收步骤](github-pages.md#verify-a-deployment)确认四个展示 GIF 的公开地址可访问且字节与源码一致。

远程操作前核对 `git remote -v`，再提交并推送全部发布变更。完成条件：工作区干净，HEAD 与 `origin/main` 一致；包内 `repository.url` 指向 GitHub HTTPS 仓库，`origin` 为同仓库的 `https://github.com/<owner>/<repo>.git`；已有 `v<version>` 标签须指向该提交。

### 2. 确认两端权限

npm 账号须有该包的发布权限，GitHub 账号须有目标仓库写权限。首次使用或登录失效时，分别完成登录：

```sh
npm login --registry=https://registry.npmjs.org/
gh auth login --hostname github.com
```

完成条件：npm 当前账号可由 `npm whoami --registry=https://registry.npmjs.org/` 确认，GitHub CLI 已登录 github.com；正式命令还会在运行门禁前检查两端身份与 GitHub 仓库写权限。

### 3. 执行并确认

完成[环境准备](#浏览器与最低运行时准备)和[预演](#发布预演)后，在仓库根目录运行：

```sh
pnpm release:publish
```

脚本重新运行全部门禁和预演，确认源码提交未变，再保存原始提交、对应版本的 CHANGELOG 正文及已验证 tarball 的 SHA512 完整性到发布记录。随后上传同一次运行中验证的 tarball，按 npm 提示完成双重验证。

npm 上传成功后，脚本查询明确版本的 `dist.integrity`。只有完整性匹配，才在保存的提交上创建 `v<version>` 标签和正式 GitHub Release；正文仅使用该版本的 CHANGELOG 条目。版本暂不可见时，脚本有限重试；等待策略见 [github-release.mjs](../../scripts/github-release.mjs) 的 `REGISTRY_*` 常量。超出等待范围或查询失败时，保留发布记录并进入[恢复分支](#github-release-恢复)。

完成条件：命令成功退出，npm 查询返回目标版本及预期的公开入口、CLI 和完整性，GitHub Releases 页面中的标签指向发布提交且正文对应该版本。将 `<version>` 替换为本次发布的版本后查询：

```sh
npm view 'flowsvg@<version>' version exports bin dist.integrity --json --registry=https://registry.npmjs.org/
```

最后在仓库外的新项目安装本次发布的明确版本，按 SDK README 验证所需入口。将实际环境、命令结果与产物指纹保存在本地 `.scratch/`，区分脚本验证和安装后的人工确认。

## GitHub Release 恢复

本分支使用已有发布记录恢复 GitHub 发布。记录保存在被 Git 忽略的 `dist/releases/` 中；清理产物或迁移机器前须保留记录。npm 上传前脚本已写入记录，因此上传失败也可能留下该文件。

1. 保留记录，结合 npm 上传回执、处理状态和明确版本查询，确认 registry 是否已接受产物。单次查询返回 404 不足以判断上传未被接受；**已接受或仍待确认时，不再运行 npm 上传**。
2. registry 已接受产物时，确认包内版本与记录一致，`origin` 及 GitHub 权限满足[正式发布的要求](#正式发布)。在仓库根目录运行：

   ```sh
   pnpm release:github
   ```

3. 完成条件：命令成功退出，GitHub 正式 Release 的标签指向记录中的提交。命令会重新比较 npm 完整性；随后创建缺失的 Release，或保留已存在的匹配 Release。

恢复只使用记录中的提交、正文和完整性，不重建、不再次上传 npm，也不依赖本地 tarball。后续 HEAD、CHANGELOG 或预演产物变化不会改写原始记录。以下情况须停止并人工核对：

| 情况 | 后续处理 |
| --- | --- |
| npm 版本尚不可见 | 等待 registry 状态明确后重试恢复 |
| npm 完整性不匹配、标签指向其他提交、已有草稿或预发布、GitHub 查询错误 | 核对对应服务的状态及权限；保留原记录和已发布标签 |
| 已确认 registry 未接受目标版本 | 人工移走该版本记录，再从正式发布步骤重新开始 |
| 发布记录缺失 | 转到[无发布记录的旧版本](#无发布记录的旧版本)；恢复命令会因缺少文件而失败 |

## 无发布记录的旧版本

在自动化加入前已发布的版本，以及发布记录已丢失的版本，均不能直接使用 `pnpm release:github`。现有 `.tgz` 也不能替代包含原始提交和发布说明的记录。

此时单独补建 GitHub Release：先确定原发布提交与对应 CHANGELOG，再核对 npm 已发布产物的完整性及已有标签。完成这些核对后，使用明确提交创建缺失的版本标签和 Release。该分支需人工确定源码与产物的对应关系，现有 CLI 不会代为推断；不要通过重新发布 npm 或把当前 HEAD 当作历史发布提交来补齐。

## 单独验收与排查

仅检查打包与安装后的产物时，运行 `pnpm release:verify`。需要保留通过验收的 tarball 时，在仓库根目录运行：

```sh
node scripts/verify-release.mjs --pack-destination ./dist/releases
```

完成条件：验收命令成功退出，并输出保留产物的路径。构建和验收会重建共享 `dist`，须顺序执行。需要检查临时消费项目时设置 `KEEP_RELEASE_TEMP=1`，并从日志获取保留路径；默认会清理临时目录。

维护验收覆盖范围时，查阅 [SDK 验证说明](../verification/sdk-verification.md)和 [SDK patterns](../../packages/flowsvg/PATTERNS.md)。修改 portable 资产、公开入口、README 图片重写或复制后的工具时，同时核对允许清单与安装后验收；这些检查以最终交付字节为边界。
