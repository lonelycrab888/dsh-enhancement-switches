# 增强开关 · dsh-enhancement-switches

**简体中文** · [English](README.en.md)

> **改一行文案，也要让 Ralph Loop 跑上几轮？修个小问题，也要召集整支 Agent Team？**

给 DeepSeek Harness 的对话输入框加上三个独立开关：**Ralph Loop** 用于反复验证，**Agent Teams** 用于团队分工，**Codex Subagent** 用于把一项任务交给 Codex。每个对话单独保存设置。

**当前分支要求 DeepSeek Harness `0.2.2-rc.2` 或更高版本。** 已在 `0.2.2-rc.2` 实测。

## 这样用

![DeepSeek Harness 输入框上方有两个开关：Ralph Loop 灰色关闭，Agent Teams 蓝色开启](assets/conversation-switches.png)

*截图展示前两个开关。蓝色表示开启，灰色表示关闭。*

1. **选择工作区。** 打开空白首页时，先选工作区。会话建立后，输入框上方就会显示开关，发第一条消息前就能设置。
2. **按任务打开开关。** 三个开关可以单独开启，也可以同时开启。新对话和独立分叉默认关闭，回到原对话时会恢复之前的选择。
3. **发出具体任务。** 开关只负责让工具在当前对话可用。开启后，在消息里告诉 Agent 你希望它怎么做。

| 开关 | 适合什么时候用 | 可以这样说 |
| --- | --- | --- |
| **Ralph Loop** | 修复需要反复尝试和验证，适合让新 Agent 逐轮接手 | “用 Ralph Loop 修复这个问题，每轮跑测试，最多 3 轮。” |
| **Agent Teams** | 有几项可以并行推进的工作，需要队友和共享任务板 | “用 Agent Teams 并行检查前端和后端，最后汇总发现。” |
| **Codex Subagent** | 希望 Codex 在当前工作区执行一次独立任务 | “让 Codex 子智能体检查这次改动，列出可能的回归。” |

开关操作本身无需调用模型。三个开关都关闭时，普通子代理工具仍可使用。启用后的 token 用量取决于实际任务。关闭开关前已开始执行的工作可以继续完成。如需中止，请使用 Harness 的停止控制。

## 安装

> [!IMPORTANT]
> **从 v0.1.3 起，使用 Codex 对话开关必须先启用官方 Codex Subagent 插件。** 增强开关复用官方 Codex 后端，按对话控制工具是否可用。

请在 Harness 插件页按下表设置：

| 插件或开关 | 设置 | 作用 |
| --- | --- | --- |
| 官方 Ralph Loop 全局插件 | 关闭 | 由增强开关提供对话级控制 |
| 宿主内置 Agent Teams | 保留 | 与输入框和模型菜单的 Teams 开关共用会话状态 |
| 官方 Codex Subagent 插件 | 使用 Codex 时必须开启 | 提供 Codex 后端，管理模型、权限和环境配置 |
| 增强开关插件 | 开启 | 在对话界面提供三个开关 |
| 对话中的 Codex 开关 | 按需开启或关闭 | 控制当前对话能否调用 Codex 子智能体 |

**仅使用 Ralph Loop 或 Agent Teams 开关时，不需要启用官方 Codex 插件。** 官方 Codex 插件开启后，只要增强开关插件正在运行，Codex 工具仍由各对话的开关控制；新对话默认关闭。

若装过旧名称的版本，请先在对应 profile 中卸载旧版。

### 桌面端自动选择兼容版本

在 **插件 → 实验性插件** 启用 **自定义插件索引**，然后打开 **发现 → 添加索引源**，填入：

```text
https://raw.githubusercontent.com/lonelycrab888/dsh-enhancement-switches/main/plugin-index.json
```

选择 **增强开关** 并安装。Harness 会推荐索引中兼容当前宿主的最高版本。安装时使用对应标签指向的 Git 提交。

### 按版本手动安装

在 **插件 → 添加插件** 选择 **npm 官方源**，将对应地址填入 **包名或地址**：

| DeepSeek Harness | 增强开关 | Git 安装地址 |
| --- | --- | --- |
| `>=0.2.2-rc.2` | rc.2 维护分支 | `git+https://github.com/lonelycrab888/dsh-enhancement-switches.git#v0.2.2-rc.2` |
| `>=0.2.2-rc.2` | [v0.1.5](https://github.com/lonelycrab888/dsh-enhancement-switches/releases/tag/v0.1.5) | `git+https://github.com/lonelycrab888/dsh-enhancement-switches.git#v0.1.5` |
| `0.2.2-rc.1` | [v0.1.3](https://github.com/lonelycrab888/dsh-enhancement-switches/releases/tag/v0.1.3) | `git+https://github.com/lonelycrab888/dsh-enhancement-switches.git#v0.1.3` |

`#main` 安装主分支当前提交。需要自动选择兼容版本时，请使用上面的「发现」索引。rc.2 及以上用户也可以从 v0.1.5 Release 下载 `.tgz`，把本机绝对路径填入 **包名或地址**。

安装后按桌面端提示重启，并在插件页确认增强开关已启用。若官方 Ralph Loop 全局插件已开启，请关闭它以使用对话级开关。

### Web 和本地开发

Web 端可直接安装 rc.2 维护分支，适用于 `0.2.2-rc.2` 或更高版本：

```sh
dsh plugin --profile web add 'git+https://github.com/lonelycrab888/dsh-enhancement-switches.git#v0.2.2-rc.2'
dsh web
```

在插件仓库目录运行：

```sh
npm ci
npm run build
npm pack
```

Web 端在同一目录运行：

```sh
dsh plugin --profile web add "$PWD/dsh-enhancement-switches-0.1.5.tgz"
```

### 维护与发布

在对应分支维护宿主兼容性。rc.1 使用 [v0.2.2-rc.1](https://github.com/lonelycrab888/dsh-enhancement-switches/tree/v0.2.2-rc.1)，rc.2 使用 [v0.2.2-rc.2](https://github.com/lonelycrab888/dsh-enhancement-switches/tree/v0.2.2-rc.2)。`main` 承载后续开发和桌面端索引。

发版时，更新插件版本并运行 `npm run check`，提交版本文件和生成的 `lib/`。在该提交上创建与 `package.json` 版本一致的 `vX.Y.Z` 标签，再推送分支和标签。GitHub Actions 会读取标签中的 `engines.dsh`，自动更新 `main` 的插件索引。需要重新同步时，可在 Actions 页面手动运行 **Sync plugin index**。

GitHub Actions 不可用时，推送分支后运行 `node scripts/push-release-tag.mjs vX.Y.Z`。这条命令会一次推送标签和更新后的索引。

## 命令与配置

也可以直接在输入框使用宿主命令。命令会更新会话里的开关状态，无需发给模型：

```text
/agentswitch ralph on
/agentswitch ralph off
/agentswitch teams on
/agentswitch teams off
/agentswitch codex on
/agentswitch codex off
```

Ralph 默认最多 **8 轮**，每轮可能包含多次模型调用。要更改上限，在对应 profile 的 `cordis.patch.yml` 中覆盖以下配置，再重新加载插件或重启宿主：

```yaml
- id: agentswitch
  config:
    maxRounds: 8
```

输入框和模型与推理等级菜单中的 Teams 开关操作同一个根会话设置。开启后，整棵子代理树可使用四个共享任务工具。成员通过原生 `subagent` 或 `subagent_fork` 创建，可用 `name` 命名，再用 `send_message({ agent, message })` 协作。关闭 Teams 后，原生委派和通信仍可用，再次开启会恢复共享任务板。

首次打开旧会话时，会把 v0.1.3 保存的 Teams 选择迁移到宿主；已有的原生 Teams 选择优先。旧实验版的成员历史仍由宿主读取。旧插件的 `agentswitch-team-service`、`agentswitch-team-ui` 自定义覆盖可以移除，原生 Team 服务已由宿主加载。

Codex Subagent 开启后，当前根会话可使用 `subagent_codex`，团队成员和普通子智能体不会继承该工具。Harness 在调用工具时才启动 Codex，沿用本机 Codex 登录与配置。每次调用都是一次独立委派，Codex 收到任务描述和工作目录。首次使用前请在本机登录 Codex。

Codex 开关复用官方的 `codex` provider 和已有的 `subagent_codex` 工具。官方插件需要保持启用，模型、环境变量、审批模式和进程退出设置都由官方 `subagent-codex` 条目管理。开关关闭时，当前会话隐藏该工具并拒绝新调用，已经开始的委派由官方后端继续管理。禁用或卸载增强开关后，官方工具恢复全局可见。

升级旧配置时，请将 `agentswitch.config.codexModel` 移到官方条目的 `config.model`，然后删除旧的 `codexModel` 字段并重启 Harness。保留旧字段时，开启 Codex 会提示迁移，避免静默采用其他模型。

```yaml
- id: subagent-codex
  config:
    model: "<账号支持的 Codex 模型>"
```

如果委派在 `stage: turn` 报 `category: product-error`，请通过官方 Codex 插件做相同任务的对照。该诊断是官方后端返回的分类，可能涵盖多个原始错误。开关复用官方后端的诊断和二进制版本。

## 卸载

桌面端可在插件页禁用或卸载。Web CLI 使用：

```sh
dsh plugin --profile web remove dsh-enhancement-switches
```

卸载后，历史消息和已保存的开关选择会保留。Agent Teams 仍可通过宿主的模型与推理等级菜单控制。

[MIT License](LICENSE) · [第三方代码署名](THIRD_PARTY_NOTICES.md)

## Star History

<a href="https://www.star-history.com/?type=date&repos=lonelycrab888%2Fdsh-enhancement-switches">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=lonelycrab888/dsh-enhancement-switches&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=lonelycrab888/dsh-enhancement-switches&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=lonelycrab888/dsh-enhancement-switches&type=date&legend=top-left" />
 </picture>
</a>
