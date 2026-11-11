# 增强开关 · dsh-enhancement-switches

**简体中文** · [English](README.en.md)

> **改一行文案，也要让 Ralph Loop 跑上几轮？修个小问题，也要召集整支 Agent Team？**

给 DeepSeek Harness 的对话输入框加上两个独立开关。平时保持关闭，遇到值得反复验证的修复再开 **Ralph Loop**，遇到可以并行分工的任务再开 **Agent Teams**。其他对话照常进行。

**已验证版本：DeepSeek Harness `0.2.2-rc.1`** · 桌面端和 Web 可用

## 这样用

![DeepSeek Harness 输入框上方有两个开关：Ralph Loop 灰色关闭，Agent Teams 蓝色开启](assets/conversation-switches.png)

*图中只开启了 Agent Teams。蓝色表示开启，灰色表示关闭。*

1. **选择工作区。** 打开空白首页时，先选工作区。会话建立后，输入框上方就会显示开关，发第一条消息前就能设置。
2. **按任务打开开关。** 两个开关可以单独开启，也可以同时开启。新对话和独立分叉默认关闭，回到原对话时会恢复之前的选择。
3. **发出具体任务。** 开关只负责让工具在当前对话可用。开启后，在消息里告诉 Agent 你希望它怎么做。

| 开关 | 适合什么时候用 | 可以这样说 |
| --- | --- | --- |
| **Ralph Loop** | 修复需要反复尝试和验证，适合让新 Agent 逐轮接手 | “用 Ralph Loop 修复这个问题，每轮跑测试，最多 3 轮。” |
| **Agent Teams** | 有几项可以并行推进的工作，需要队友和共享任务板 | “用 Agent Teams 并行检查前端和后端，最后汇总发现。” |

开关操作本身无需调用模型。两项都关闭时，插件不会在该会话注册对应的工具和提示词。启用后的 token 用量取决于实际的任务、迭代轮数和团队活动。关闭开关前已开始执行的工作可以继续完成；要中止，请使用 Harness 的停止控制。

## 安装

> [!IMPORTANT]
> **启用增强开关前，请先在 Harness 的插件页手动关闭官方 Ralph Loop 和 Agent Teams 两个全局插件。** 增强开关会复用官方实现，按对话提供相应工具。

若装过旧名称的版本，请先在对应 profile 中卸载旧版。

### 桌面端

打开 **插件 → 添加插件**，将 **安装源** 选为 **npm 官方源**，然后把下面的 Git 地址粘贴到 **包名或地址**：

```text
git+https://github.com/lonelycrab888/dsh-enhancement-switches.git#main
```

如果安装日志显示 GitHub 在下载某个 npm 依赖时返回 404，请检查 **安装源** 是否选成了 GitHub 仓库地址，并切回 **npm 官方源**。Git 地址用于获取插件，npm 源用于下载依赖。

安装完成后，确认上述两个官方插件均已关闭，再在插件页启用 **增强开关**。

### Web CLI

直接从 GitHub 安装并启动 Web 端：

```sh
dsh plugin --profile web add 'git+https://github.com/lonelycrab888/dsh-enhancement-switches.git#main'
dsh web
```

仓库已包含 `lib/` 构建产物，可以直接安装。

## 命令与配置

也可以直接在输入框使用宿主命令。命令会更新会话里的开关状态，无需发给模型：

```text
/agentswitch ralph on
/agentswitch ralph off
/agentswitch teams on
/agentswitch teams off
```

Ralph 默认最多 **8 轮**，每轮可能包含多次模型调用。要更改上限，在对应 profile 的 `cordis.patch.yml` 中覆盖以下配置，再重新加载插件或重启宿主：

```yaml
- id: agentswitch
  config:
    maxRounds: 8
```

Team 成员跟随根会话的 Teams 开关。开启时，当前会话和团队成员通过 `spawn_teammate` 直接委派，普通的 `subagent` 和 `subagent_fork` 会从工具列表隐藏。关闭后恢复预设提供的普通委派和控制工具，可用原来的 Agent ID 继续管理切换前创建的普通子智能体。团队任务和成员记录会保留，再开启即可访问。

## 卸载

桌面端可在插件页禁用或卸载。Web CLI 使用：

```sh
dsh plugin --profile web remove dsh-enhancement-switches
```

卸载后，历史消息和已保存的开关选择会保留。此前关闭的官方全局插件可在插件页手动恢复。

[MIT License](LICENSE) · [第三方代码署名](THIRD_PARTY_NOTICES.md)

## Star History

<a href="https://www.star-history.com/#lonelycrab888/dsh-enhancement-switches&amp;Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=lonelycrab888%2Fdsh-enhancement-switches&amp;type=date&amp;legend=top-left&amp;theme=dark">
    <img alt="GitHub Star History for lonelycrab888/dsh-enhancement-switches" src="https://api.star-history.com/svg?repos=lonelycrab888%2Fdsh-enhancement-switches&amp;type=date&amp;legend=top-left">
  </picture>
</a>
