// src/index.ts
import Schema from "@deepseek-ai/schemastery";
import { createScope } from "@deepseek-ai/dsh-scope";
import * as Ralph from "@deepseek-ai/dsh-tool-ralph";

// src/state.ts
import { z } from "zod";
var features = ["ralph", "teams", "codex"];
function parseSelection(input) {
  const match = /^(ralph|teams|codex)\s+(on|off)$/.exec(input.trim());
  if (!match) return void 0;
  return { feature: match[1], enabled: match[2] === "on" };
}
var projection = {
  key: "agentswitch",
  stateVersion: 2,
  stateSchema: z.object({
    ralph: z.boolean(),
    codex: z.boolean(),
    child: z.boolean(),
    inherited: z.number(),
    legacyTeams: z.boolean().optional(),
    hasNativeTeamMode: z.boolean(),
    pending: z.array(z.object({ id: z.string(), feature: z.enum(features), enabled: z.boolean() }))
  }),
  init: (header, inherited) => ({
    ralph: false,
    codex: false,
    child: header.origin === "subagent",
    inherited,
    hasNativeTeamMode: false,
    pending: []
  }),
  apply(state, event) {
    if (event.seq < state.inherited) return state;
    if (event.type === "team/mode") return { ...state, hasNativeTeamMode: true, legacyTeams: void 0 };
    if (event.type === "command/run" && event.data.name === "agentswitch") {
      const selection = parseSelection(event.data.args ?? "");
      if (!selection || selection.feature === "teams" && state.hasNativeTeamMode) return state;
      return { ...state, pending: [...state.pending, { id: event.data.commandId, ...selection }] };
    }
    if (event.type !== "command/done") return state;
    const attempt = state.pending.find((item) => item.id === event.data.commandId);
    if (!attempt) return state;
    const next = { ...state, pending: state.pending.filter((item) => item !== attempt) };
    if (event.data.kind === "success") {
      if (attempt.feature !== "teams") next[attempt.feature] = attempt.enabled;
      else if (!next.hasNativeTeamMode) next.legacyTeams = attempt.enabled;
    }
    return next;
  },
  wire: {
    viewSchema: z.object({ ralph: z.boolean(), codex: z.boolean(), child: z.boolean() }),
    view: ({ ralph, codex, child }) => ({ ralph, codex, child })
  }
};

// src/index.ts
var name = "agentswitch";
var inject = ["agents", "commands", "sessionProjections", "agentTeams", "workflowEngine", "subagents", "tools", "systemPrompt"];
var Config = Schema.object({
  maxRounds: Schema.number().step(1).min(1).default(8),
  codexModel: Schema.string().min(1)
});
var codexProvider = "codex";
var codexToolName = "subagent_codex";
async function apply2(ctx, config = { maxRounds: 8 }) {
  const saved = await ctx.sessionProjections.register(projection);
  const mounted = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  let stopped = false;
  let queue = Promise.resolve();
  function selected(agent) {
    const state = { ...saved.stateOf(agent.session) };
    for (const change of pending.values()) {
      if (change.agent === agent) state[change.feature] = change.enabled;
    }
    return state;
  }
  async function migrateTeams(agent) {
    if (agent.session.header.origin === "subagent") return;
    const { hasNativeTeamMode, legacyTeams } = saved.stateOf(agent.session);
    if (!hasNativeTeamMode && legacyTeams !== void 0 && ctx.agentTeams.isEnabled(agent) !== legacyTeams) {
      await ctx.agentTeams.setEnabled(agent, legacyTeams);
    }
  }
  function ralphEnabled(agent) {
    return !stopped && agent.session.header.origin !== "subagent" && selected(agent).ralph;
  }
  function codexEnabled(agent) {
    return !stopped && agent.session.header.origin !== "subagent" && selected(agent).codex && codexUnavailable() === void 0;
  }
  function codexUnavailable() {
    if (config.codexModel !== void 0) {
      return "Move agentswitch.codexModel to subagent-codex.config.model, then remove codexModel.";
    }
    if (!ctx.subagents.getProvider(codexProvider)) {
      return "Enable the official Codex Subagent plugin first. Enhancement Switches uses its codex provider.";
    }
  }
  async function mountCodex(agent) {
    const tool = await import("@deepseek-ai/dsh-tool-subagent");
    const scope = createScope(ctx, agent);
    try {
      await tool.apply(scope.ctx, { provider: codexProvider, toolName: codexToolName, maxDepth: "provider-managed" });
      return scope;
    } catch (error) {
      await scope.dispose();
      throw error;
    }
  }
  async function reconcile() {
    for (const agent of ctx.agents.list()) {
      if (stopped) return;
      await migrateTeams(agent).catch((error) => ctx.logger.error("Unable to migrate the saved Agent Teams selection", error));
      if (stopped || ctx.agents.get(agent.id) !== agent) continue;
      if (!mounted.has(agent)) mounted.set(agent, {});
      const entry = mounted.get(agent);
      if (ralphEnabled(agent) && !entry.ralph) {
        const scope = createScope(ctx, agent);
        try {
          Ralph.apply(scope.ctx, { maxRounds: config.maxRounds, subagentProvider: "spawn" });
          entry.ralph = scope;
        } catch (error) {
          await scope.dispose();
          throw error;
        }
      } else if (!ralphEnabled(agent) && entry.ralph) {
        const scope = entry.ralph;
        delete entry.ralph;
        await scope.dispose();
      }
      if (codexEnabled(agent) && entry.restoreCodex) {
        entry.restoreCodex();
        delete entry.restoreCodex;
      }
      if (codexEnabled(agent) && !entry.codex && !ctx.tools.get(codexToolName, agent)) {
        const scope = await mountCodex(agent);
        if (stopped || mounted.get(agent) !== entry) await scope.dispose();
        else entry.codex = scope;
      } else if (!codexEnabled(agent) && entry.codex) {
        const scope = entry.codex;
        delete entry.codex;
        await scope.dispose();
      }
      if (!codexEnabled(agent) && !entry.restoreCodex && ctx.tools.get(codexToolName)) {
        entry.restoreCodex = agent.ctx.tools.restrict({ deny: [codexToolName] });
      }
    }
  }
  function schedule() {
    const task = queue.then(reconcile);
    queue = task.catch((error) => {
      ctx.logger.error("Enhancement Switches reconciliation failed", error);
    });
    return task;
  }
  ctx.tools.guard((execution) => {
    if (execution.name === "ralph" && (!execution.agent || !ralphEnabled(execution.agent))) {
      return "Ralph Loop is disabled in this conversation.";
    }
    if (execution.name === codexToolName && (!execution.agent || !codexEnabled(execution.agent))) {
      return "Codex Subagent is disabled in this conversation.";
    }
  });
  ctx.commands.register({
    name: "agentswitch",
    description: "Enable Ralph Loop, Agent Teams, or Codex Subagent for this conversation",
    input: { hint: "<ralph|teams|codex> <on|off>" },
    async handler({ agent, commandId, rawInput, signal }) {
      const selection = parseSelection(rawInput);
      if (!selection) return { kind: "error", text: "Usage: /agentswitch <ralph|teams|codex> <on|off>" };
      if (agent.session.header.origin === "subagent") {
        return { kind: "error", text: "Change these switches in the root conversation." };
      }
      if (selection.feature === "teams") {
        await ctx.agentTeams.setEnabled(agent, selection.enabled, signal);
        return { kind: "success", text: `teams ${selection.enabled ? "on" : "off"}` };
      }
      if (selection.feature === "codex" && selection.enabled) {
        const error = codexUnavailable();
        if (error !== void 0) return { kind: "error", text: error };
      }
      pending.set(commandId, { agent, feature: selection.feature, enabled: selection.enabled });
      try {
        await schedule();
        return { kind: "success", text: `${selection.feature} ${selection.enabled ? "on" : "off"}` };
      } catch (error) {
        pending.delete(commandId);
        await schedule();
        throw error;
      }
    }
  });
  ctx.on("session/event", (_session, event) => {
    if (event.type === "command/done" && pending.delete(event.data.commandId)) void schedule().catch(() => {
    });
  });
  ctx.on("agent/created", async () => {
    await schedule();
  });
  ctx.on("agent/pre-step", async (_event, next) => {
    await schedule();
    return next();
  });
  ctx.on("agent/disposed", async ({ agent }) => {
    const entry = mounted.get(agent);
    mounted.delete(agent);
    await entry?.ralph?.dispose();
    await entry?.codex?.dispose();
    entry?.restoreCodex?.();
  });
  ctx.effect(() => async () => {
    stopped = true;
    await queue;
    for (const entry of mounted.values()) {
      await entry.ralph?.dispose();
      await entry.codex?.dispose();
      entry.restoreCodex?.();
    }
    mounted.clear();
    pending.clear();
  });
  await schedule();
}
export {
  Config,
  apply2 as apply,
  inject,
  name
};
