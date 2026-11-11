# Enhancement Switches for DeepSeek Harness

[简体中文](README.md) · **English**

> **Does a one-line copy edit need several rounds of Ralph Loop? Does a small fix need a whole Agent Team?**

`dsh-enhancement-switches` adds two independent switches above the DeepSeek Harness message box. Turn on **Ralph Loop** for fixes that need repeated testing, or **Agent Teams** for work that can run in parallel. Each conversation saves its own settings.

**Tested with DeepSeek Harness `0.2.2-rc.1`** · Desktop and Web

## How to use it

![Two switches above the DeepSeek Harness message box. Ralph Loop is gray and off. Agent Teams is blue and on.](assets/conversation-switches.png)

*In this example, Agent Teams is on. Blue means on and gray means off.*

1. **Choose a workspace.** If you're on the blank home screen, choose a workspace to start a conversation. The switches appear above the message box before you send your first message.
2. **Choose what the task needs.** Turn on either switch or both. Both are off by default in new conversations and independent forks. Reopening a conversation restores its saved settings.
3. **Tell the agent what to do.** The switches make the corresponding tools available in that conversation. Use your message to ask for the workflow you want.

| Switch | When to use it | Example prompt |
| --- | --- | --- |
| **Ralph Loop** | A fix needs repeated attempts and verification, with a fresh agent taking each round | “Use Ralph Loop to fix this issue. Run the tests after each round and stop after at most three rounds.” |
| **Agent Teams** | Several parts of a task can run in parallel with teammates and a shared task board | “Use Agent Teams to review the frontend and backend in parallel, then summarize the findings.” |

Changing a switch takes no model call. With both switches off, the plugin leaves the corresponding tools and prompts out of that conversation. When enabled, token use depends on the task, the number of rounds, and team activity. Work already in progress can continue after you turn a switch off. Use Harness's stop control to cancel it.

## Installation

> [!IMPORTANT]
> **Before enabling Enhancement Switches, manually disable both official global plugins, Ralph Loop and Agent Teams, in the Harness Plugins panel.** Enhancement Switches reuses their implementations and makes the tools available per conversation.

If you installed a version under an older package name, uninstall it from the corresponding profile first.

### Desktop

Open **Plugins → Add Plugin**, select the **official npm registry** as the installation source, and paste the Git URL into **Package name or address**.

```text
git+https://github.com/lonelycrab888/dsh-enhancement-switches.git#main
```

If the install log shows GitHub returning a 404 for an npm dependency, check the installation source and switch it back to the **official npm registry**. The Git URL locates the plugin, while the npm registry serves its dependencies.

Once installation finishes, confirm that both official plugins are disabled, then enable **Enhancement Switches** in the Plugins panel.

### Web CLI

Install directly from GitHub, then start the Web interface.

```sh
dsh plugin --profile web add 'git+https://github.com/lonelycrab888/dsh-enhancement-switches.git#main'
dsh web
```

The repository includes the compiled files in `lib/` for direct installation.

## Commands and configuration

You can also enter these commands in the message box. Harness updates the conversation settings without a model call.

```text
/agentswitch ralph on
/agentswitch ralph off
/agentswitch teams on
/agentswitch teams off
```

Ralph has a default limit of **8 rounds**, and each round may make several model calls. To change the limit, override `maxRounds` in the profile's `cordis.patch.yml`, then reload the plugin or restart Harness.

```yaml
- id: agentswitch
  config:
    maxRounds: 8
```

Team members follow the Teams setting of the root conversation. Turning Teams off preserves the task board and member records, which you can access again by turning it back on. Regular subagents are controlled by the active agent preset.

## Uninstall

Disable or uninstall the plugin from the desktop Plugins panel. For Web CLI, run the following command.

```sh
dsh plugin --profile web remove dsh-enhancement-switches
```

Uninstalling preserves conversation history and saved switch settings. You can re-enable the official global plugins from the Plugins panel.

[MIT License](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

## Star History

<a href="https://www.star-history.com/#lonelycrab888/dsh-enhancement-switches&amp;Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=lonelycrab888%2Fdsh-enhancement-switches&amp;type=date&amp;legend=top-left&amp;theme=dark">
    <img alt="GitHub Star History for lonelycrab888/dsh-enhancement-switches" src="https://api.star-history.com/svg?repos=lonelycrab888%2Fdsh-enhancement-switches&amp;type=date&amp;legend=top-left">
  </picture>
</a>
