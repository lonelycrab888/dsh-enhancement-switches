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
  stateVersion: 1,
  stateSchema: z.object({
    ralph: z.boolean(),
    teams: z.boolean(),
    codex: z.boolean().default(false),
    child: z.boolean(),
    inherited: z.number(),
    pending: z.array(z.object({ id: z.string(), feature: z.enum(features), enabled: z.boolean() }))
  }),
  init: (header, inherited) => ({
    ralph: false,
    teams: false,
    codex: false,
    child: header.origin === "subagent",
    inherited,
    pending: []
  }),
  apply(state, event) {
    if (event.seq < state.inherited) return state;
    if (event.type === "command/run" && event.data.name === "agentswitch") {
      const selection = parseSelection(event.data.args ?? "");
      if (!selection) return state;
      return { ...state, pending: [...state.pending, { id: event.data.commandId, ...selection }] };
    }
    if (event.type !== "command/done") return state;
    const attempt = state.pending.find((item) => item.id === event.data.commandId);
    if (!attempt) return state;
    const next = { ...state, pending: state.pending.filter((item) => item !== attempt) };
    if (event.data.kind === "success") next[attempt.feature] = attempt.enabled;
    return next;
  },
  wire: {
    viewSchema: z.object({ ralph: z.boolean(), teams: z.boolean(), codex: z.boolean(), child: z.boolean() }),
    view: ({ ralph, teams, codex, child }) => ({ ralph, teams, codex, child })
  }
};

// src/vendor/team-tools.ts
import z2 from "@deepseek-ai/schemastery";
import { TeamTaskId } from "@deepseek-ai/dsh-experimental-agent-team";
import { defineTool } from "@deepseek-ai/dsh-tools";
var Config = z2.object({
  interrupt: z2.boolean().default(true),
  freshProvider: z2.string().default("spawn"),
  forkProvider: z2.string().default("fork")
});
function teamPolicy(interrupt) {
  return `Agent Teams is available in this session

The Team Lead and all teammates share the same working directory and filesystem. Edits are immediately visible to every member. Split write work into disjoint scopes, record expected write scopes on shared tasks, and use task dependencies when work must be ordered. Write-scope overlap is advisory, not a lock.

Prefer read/edit/write for file changes. If a file operation returns FS_STALE_VERSION, read the current file, rebase your intended change onto the new content, and retry. Bash, formatters, code generators, and scripts are not fully protected by the filesystem version guard; coordinate them explicitly and have the Lead review the final diff and run tests.

Use the target returned by spawn_teammate or list_agents for send_message${interrupt ? " and interrupt_agent" : ""}, or as owner when assigning or filtering shared tasks. send_message steers a running target at its nearest step boundary and starts or resumes an inactive target. inactive means no turn is executing; it does not describe task completion, success, failure, or waiting for other agents. provisioning means member creation is in progress; failed means member creation failed. A peer message starts with its sender name. A successful send does not mean the recipient has processed it. Shared-task workflow is list, get, claim with the current revision, perform the work, then complete. Task readiness never starts an owner. Before wait_agent, use list_agents and make sure another required member is running or provisioning; use send_message first when the required member is inactive. wait_agent observes only changes after that call starts, never wakes a member, and returns noProgress immediately when no other member can produce a change. Re-list after wakeup or timeout. The Lead must wait for required teammates before giving the final answer.`;
}
var ACTIVE_WAIT_STATUSES = /* @__PURE__ */ new Set(["running", "provisioning"]);
var NO_ACTIVE_PEER_MESSAGE = "No other Team member is running or provisioning. wait_agent cannot make progress or wake inactive teammates. Re-list with list_agents and team_task_list, then use send_message to wake each required inactive teammate before waiting again.";
var MEMBER_VIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    target: { type: "string", required: true },
    role: { type: "string", required: true, enum: ["lead", "teammate"] },
    status: { type: "string", required: true, enum: ["running", "inactive", "provisioning", "failed"] },
    description: { type: "string" },
    provider: { type: "string" },
    context: { type: "string", enum: ["fresh", "fork"] },
    model: { type: "string" },
    diagnostics: { type: "array", required: true, items: { type: "string" } }
  }
};
function modelMember(member) {
  const { id: _id, name: name2, ...details } = member;
  return { target: name2, ...details };
}
var TASK_VIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", required: true },
    revision: { type: "integer", required: true },
    subject: { type: "string", required: true },
    description: { type: "string", required: true },
    status: { type: "string", required: true, enum: ["pending", "in_progress", "completed", "deleted"] },
    ownerName: { type: "string" },
    blockedBy: { type: "array", required: true, items: { type: "string" } },
    writeScopes: { type: "array", required: true, items: { type: "string" } },
    ready: { type: "boolean", required: true },
    writeScopeWarnings: { type: "array", required: true, items: { type: "string" } }
  }
};
var SPAWN_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    member: { ...MEMBER_VIEW_SCHEMA, required: true }
  }
};
var MEMBER_LIST_VALUE_SCHEMA = { type: "array", items: MEMBER_VIEW_SCHEMA };
var SEND_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sent: { type: "boolean", required: true, const: true }
  }
};
var WAIT_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    timedOut: { type: "boolean", required: true },
    noProgress: {
      type: "object",
      additionalProperties: false,
      properties: {
        reason: { type: "string", required: true, const: "no-active-peer" },
        message: { type: "string", required: true }
      }
    }
  }
};
var INTERRUPT_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    previousStatus: { type: "string", required: true, enum: ["running", "inactive"] }
  }
};
var TASK_LIST_VALUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tasks: { type: "array", required: true, items: TASK_VIEW_SCHEMA },
    nextCursor: { type: "integer" }
  }
};
function jsonOutput(schema) {
  return {
    schema,
    render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }]
  };
}
function callingAgent(agent, toolName) {
  if (agent === void 0) throw new Error(`${toolName} requires a calling Agent`);
  return agent;
}
function installTeamTools(agent, ctx, config, enabled) {
  const scoped = agent.ctx;
  const disposers = [];
  const register = (disposer) => {
    disposers.push(disposer);
  };
  const registerTool = (definition) => scoped.tools.register({
    ...definition,
    execute: (args, exec) => {
      if (!enabled()) throw new Error("Agent Teams is disabled in the root conversation.");
      return definition.execute(args, exec);
    }
  });
  try {
    register(scoped.systemPrompt.section({
      name: "team:policy",
      order: scoped.systemPrompt.getSectionOrder("TEAM_POLICY"),
      text: teamPolicy(config.interrupt)
    }));
    register(scoped.systemPrompt.context({
      name: "team:identity",
      order: scoped.systemPrompt.getContextOrder("TEAM_IDENTITY"),
      required: true,
      text: () => {
        const { role, name: name2 } = ctx.agentTeams.membership(agent);
        return `${role === "lead" ? 'You are the Team Lead named "lead".' : `You are teammate "${name2}".
Your Team Lead is named "lead".
To message your Team Lead, use send_message({ target: "lead", message: "..." }).`}
Use list_agents({}) to find your teammates and their names.
To message another teammate, use send_message({ target: "<teammate name>", message: "..." }).`;
      }
    }));
    register(registerTool(defineTool({
      name: "spawn_teammate",
      description: "Create one named, durable teammate. Only the Team Lead may call this tool.",
      parameters: {
        name: { type: "string", required: true, description: "Unique lower-kebab-case teammate name." },
        description: { type: "string", required: true, description: "Short description of the delegated responsibility." },
        prompt: { type: "string", required: true, description: "Complete initial task for the teammate." },
        context: {
          type: "string",
          enum: ["fresh", "fork"],
          description: "fresh starts without Lead history; fork inherits completed Lead turns. Defaults to fresh."
        }
      },
      output: jsonOutput(SPAWN_VALUE_SCHEMA),
      async execute(args, exec) {
        const agent2 = callingAgent(exec.agent, "spawn_teammate");
        const context = args.context ?? "fresh";
        const result = await ctx.agentTeams.spawnTeammate(agent2, {
          name: args.name,
          description: args.description,
          prompt: [{ type: "text", text: args.prompt }],
          context,
          provider: context === "fork" ? config.forkProvider : config.freshProvider,
          signal: exec.signal
        });
        return { member: modelMember(result.member) };
      }
    })));
    register(registerTool(defineTool({
      name: "send_message",
      description: "Send one message to another Team member. A running target receives it at the nearest step boundary; an inactive target starts or resumes a turn.",
      parameters: {
        target: { type: "string", required: true, description: "Member target returned by spawn_teammate or list_agents, including lead." },
        message: { type: "string", required: true, description: "Self-contained message for the target." }
      },
      output: jsonOutput(SEND_VALUE_SCHEMA),
      async execute(args, exec) {
        await ctx.agentTeams.sendMessage(callingAgent(exec.agent, "send_message"), {
          target: args.target,
          content: [{ type: "text", text: args.message }],
          signal: exec.signal
        });
        return { sent: true };
      }
    })));
    register(registerTool(defineTool({
      name: "list_agents",
      description: "List the Lead and every durable teammate with an addressable target and current availability. inactive means no turn is executing, not a task result. provisioning and failed describe member creation.",
      parameters: {},
      output: jsonOutput(MEMBER_LIST_VALUE_SCHEMA),
      execute(_args, exec) {
        return Promise.resolve(ctx.agentTeams.listMembers(callingAgent(exec.agent, "list_agents")).map(modelMember));
      }
    })));
    register(registerTool(defineTool({
      name: "wait_agent",
      description: "Wait for the next teammate status, message, or shared-task change after this call starts. This never wakes inactive members and returns noProgress immediately when no other member is running or provisioning. Re-list after wakeup or timeout instead of polling.",
      parameters: {
        timeout_ms: {
          type: "integer",
          description: "Wait duration in milliseconds, from 10000 through 3600000. Defaults to 30000."
        }
      },
      output: jsonOutput(WAIT_VALUE_SCHEMA),
      async execute(args, exec) {
        const caller = callingAgent(exec.agent, "wait_agent");
        const timeoutMs = args.timeout_ms ?? 3e4;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1e4 || timeoutMs > 36e5) {
          return await ctx.agentTeams.waitForChange(caller, timeoutMs, exec.signal);
        }
        const hasActivePeer = ctx.agentTeams.listMembers(caller).some((member) => member.id !== caller.id && ACTIVE_WAIT_STATUSES.has(member.status));
        if (!hasActivePeer) {
          return {
            timedOut: false,
            noProgress: {
              reason: "no-active-peer",
              message: NO_ACTIVE_PEER_MESSAGE
            }
          };
        }
        return await ctx.agentTeams.waitForChange(caller, timeoutMs, exec.signal);
      }
    })));
    if (config.interrupt) {
      register(registerTool(defineTool({
        name: "interrupt_agent",
        description: "Interrupt one teammate's current turn while preserving its pending inbox. Team Lead only.",
        parameters: {
          target: { type: "string", required: true, description: "Teammate target returned by spawn_teammate or list_agents." }
        },
        output: jsonOutput(INTERRUPT_VALUE_SCHEMA),
        execute(args, exec) {
          return Promise.resolve(ctx.agentTeams.interrupt(callingAgent(exec.agent, "interrupt_agent"), args.target));
        }
      })));
    }
    register(registerTool(defineTool({
      name: "team_task_create",
      description: "Create one unowned pending task on the shared Team task board.",
      parameters: {
        subject: { type: "string", required: true, description: "Concise task title." },
        description: { type: "string", required: true, description: "Complete task details and acceptance criteria." },
        blocked_by: { type: "array", items: { type: "string" }, description: "Task ids that must complete first." },
        write_scopes: {
          type: "array",
          items: { type: "string" },
          description: "Advisory workspace-relative file or directory prefixes this task expects to modify."
        }
      },
      output: jsonOutput(TASK_VIEW_SCHEMA),
      async execute(args, exec) {
        return await ctx.agentTeams.createTask(callingAgent(exec.agent, "team_task_create"), {
          subject: args.subject,
          description: args.description,
          ...args.blocked_by === void 0 ? {} : { blockedBy: args.blocked_by.map(TeamTaskId) },
          ...args.write_scopes === void 0 ? {} : { writeScopes: args.write_scopes }
        });
      }
    })));
    register(registerTool(defineTool({
      name: "team_task_list",
      description: "List shared tasks, including readiness, owner, revision, blockers, and write-scope warnings.",
      parameters: {
        status: {
          type: "string",
          enum: ["pending", "in_progress", "completed"],
          description: "Optional exact status filter."
        },
        owner: { type: "string", description: "Optional member target from spawn_teammate or list_agents, matching ownerName; use unowned for tasks without an owner." },
        ready: { type: "boolean", description: "Optional readiness filter." },
        cursor: { type: "integer", description: "Zero-based result offset. Defaults to 0." },
        limit: { type: "integer", description: "Number of rows, 1 through 100. Defaults to 50." }
      },
      output: jsonOutput(TASK_LIST_VALUE_SCHEMA),
      execute(args, exec) {
        const status = args.status;
        const filtered = ctx.agentTeams.listTasks(callingAgent(exec.agent, "team_task_list")).filter((task) => (status === void 0 || task.status === status) && (args.owner === void 0 || (args.owner === "unowned" ? task.ownerName === void 0 : task.ownerName === args.owner)) && (args.ready === void 0 || task.ready === args.ready));
        const cursor = args.cursor ?? 0;
        const limit = args.limit ?? 50;
        if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("cursor must be a non-negative safe integer");
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be an integer from 1 through 100");
        return Promise.resolve({
          tasks: filtered.slice(cursor, cursor + limit),
          ...cursor + limit < filtered.length ? { nextCursor: cursor + limit } : {}
        });
      }
    })));
    register(registerTool(defineTool({
      name: "team_task_get",
      description: "Read the complete latest value of one shared task before changing or executing it.",
      parameters: {
        task_id: { type: "string", required: true, description: "Shared task id." }
      },
      output: jsonOutput(TASK_VIEW_SCHEMA),
      async execute(args, exec) {
        return Promise.resolve(ctx.agentTeams.getTask(
          callingAgent(exec.agent, "team_task_get"),
          TeamTaskId(args.task_id)
        ));
      }
    })));
    register(registerTool(defineTool({
      name: "team_task_update",
      description: "Compare-and-set a shared task action using the latest revision from team_task_get or team_task_list.",
      parameters: {
        task_id: { type: "string", required: true, description: "Shared task id." },
        expected_revision: { type: "integer", required: true, description: "Current task revision used as the CAS precondition." },
        action: {
          type: "string",
          required: true,
          enum: ["claim", "release", "edit", "set_dependencies", "complete", "reopen", "reassign", "delete"],
          description: "Task transition to apply."
        },
        subject: { type: "string", description: "Replacement title for edit." },
        description: { type: "string", description: "Replacement details for edit." },
        blocked_by: { type: "array", items: { type: "string" }, description: "Complete blocker list for set_dependencies." },
        write_scopes: { type: "array", items: { type: "string" }, description: "Replacement advisory write scopes for edit." },
        owner: { type: "string", description: "Member target from spawn_teammate or list_agents for Lead-only reassign; omit to unassign." }
      },
      output: jsonOutput(TASK_VIEW_SCHEMA),
      async execute(args, exec) {
        return await ctx.agentTeams.updateTask(callingAgent(exec.agent, "team_task_update"), {
          taskId: TeamTaskId(args.task_id),
          expectedRevision: args.expected_revision,
          action: args.action,
          ...args.subject === void 0 ? {} : { subject: args.subject },
          ...args.description === void 0 ? {} : { description: args.description },
          ...args.blocked_by === void 0 ? {} : { blockedBy: args.blocked_by.map(TeamTaskId) },
          ...args.write_scopes === void 0 ? {} : { writeScopes: args.write_scopes },
          ...args.owner === void 0 ? {} : { owner: args.owner }
        });
      }
    })));
  } catch (error) {
    for (const dispose of disposers.reverse()) void dispose();
    throw error;
  }
  return () => {
    for (const dispose of disposers.reverse()) void dispose();
  };
}

// src/index.ts
var name = "agentswitch";
var inject = ["agents", "commands", "sessionProjections", "agentTeams", "workflowEngine", "subagents", "tools", "systemPrompt"];
var Config2 = Schema.object({
  maxRounds: Schema.number().step(1).min(1).default(8),
  codexModel: Schema.string().min(1)
});
var standaloneDelegation = ["subagent", "subagent_fork"];
var codexProvider = "enhancement-switches-codex";
var codexToolName = "subagent_codex";
function officialCodexModel(ctx) {
  const loader = ctx.get("loader");
  if (!loader) return void 0;
  for (const { options } of loader.entries()) {
    if (options.id !== "subagent-codex" || options.name !== "@deepseek-ai/dsh-subagent-codex") continue;
    const model = options.config?.model;
    if (typeof model === "string" && model.trim()) return model;
  }
}
async function apply2(ctx, config = { maxRounds: 8 }) {
  const saved = await ctx.sessionProjections.register(projection);
  const mounted = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  let codexBackend;
  let stopped = false;
  let queue = Promise.resolve();
  function selected(agent) {
    const state = { ...saved.stateOf(agent.session) };
    for (const change of pending.values()) {
      if (change.agent === agent) state[change.feature] = change.enabled;
    }
    return state;
  }
  function teamEnabled(agent) {
    const member = ctx.agentTeams.tryMembership(agent);
    return !stopped && member !== void 0 && selected(member.root).teams;
  }
  function ralphEnabled(agent) {
    return !stopped && agent.session.header.origin !== "subagent" && selected(agent).ralph;
  }
  function codexEnabled(agent) {
    return !stopped && agent.session.header.origin !== "subagent" && selected(agent).codex;
  }
  async function mountCodex(agent) {
    if (!codexBackend) {
      if (!ctx.get("subprocess")) throw new Error("Codex Subagent requires the host subprocess service.");
      const backend = await import("@deepseek-ai/dsh-subagent-codex");
      const model = config.codexModel ?? officialCodexModel(ctx);
      codexBackend = await ctx.plugin(backend, {
        providerName: codexProvider,
        ...model === void 0 ? {} : { model }
      });
      if (!ctx.subagents.getProvider(codexProvider)) {
        await codexBackend.dispose();
        codexBackend = void 0;
        throw new Error("Codex Subagent could not register its provider.");
      }
    }
    if (!ctx.subagents.getProvider(codexProvider)) throw new Error("Codex Subagent provider is unavailable.");
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
  function visibleStandaloneDelegation(agent) {
    return standaloneDelegation.filter((name2) => ctx.tools.get(name2, agent) !== void 0);
  }
  function mountTeams(agent) {
    const deny = visibleStandaloneDelegation(agent);
    const restore = deny.length > 0 ? agent.ctx.tools.restrict({ deny }) : void 0;
    try {
      const unmount = installTeamTools(
        agent,
        ctx,
        { interrupt: true, freshProvider: "spawn", forkProvider: "fork" },
        () => teamEnabled(agent)
      );
      return () => {
        try {
          unmount();
        } finally {
          restore?.();
        }
      };
    } catch (error) {
      restore?.();
      throw error;
    }
  }
  async function reconcile() {
    for (const agent of ctx.agents.list()) {
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
      const teams = teamEnabled(agent);
      if (entry.teams && (!teams || visibleStandaloneDelegation(agent).length > 0)) {
        entry.teams();
        delete entry.teams;
      }
      if (teams && !entry.teams) entry.teams = mountTeams(agent);
      if (codexEnabled(agent) && !entry.codex) {
        const scope = await mountCodex(agent);
        if (stopped || mounted.get(agent) !== entry) await scope.dispose();
        else entry.codex = scope;
      } else if (!codexEnabled(agent) && entry.codex) {
        const scope = entry.codex;
        delete entry.codex;
        await scope.dispose();
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
    async handler({ agent, commandId, rawInput }) {
      const selection = parseSelection(rawInput);
      if (!selection) return { kind: "error", text: "Usage: /agentswitch <ralph|teams|codex> <on|off>" };
      if (agent.session.header.origin === "subagent") {
        return { kind: "error", text: "Change these switches in the root conversation." };
      }
      pending.set(commandId, { agent, ...selection });
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
    entry?.teams?.();
    await entry?.ralph?.dispose();
    await entry?.codex?.dispose();
  });
  ctx.effect(() => async () => {
    stopped = true;
    await queue;
    for (const entry of mounted.values()) {
      entry.teams?.();
      await entry.ralph?.dispose();
      await entry.codex?.dispose();
    }
    mounted.clear();
    pending.clear();
  });
  await schedule();
}
export {
  Config2 as Config,
  apply2 as apply,
  inject,
  name
};
