import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import Commands from '@deepseek-ai/dsh-commands'
import SessionStore, { Session, SessionId, SessionLogOffset, type SessionEvent } from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Prompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as NativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { createScope } from '@deepseek-ai/dsh-scope'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import * as Plugin from '../src/index.ts'
import { projection } from '../src/state.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function setup(config: Plugin.Config = { maxRounds: 8 }) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(Prompt)
  await ctx.plugin(Tools)
  await ctx.plugin(NativeExecutor)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(Commands)
  await ctx.plugin(Projections)
  // Only the Team domain is stubbed. Commands, session logs, scoped tool
  // registration, guards, projections and the Native executor are real DSH.
  await ctx.plugin((inner: Context) => {
    inner.provide('subagents', { getProvider: (name: string) => name === 'codex' ? { name } : undefined })
    inner.provide('workflowEngine', { start() { throw new Error('workflow not expected in this test') } })
    inner.provide('agentTeams', {
      tryMembership(agent: Agent) {
        const root = agent.session.header.parentSession
          ? ctx.agents.get(agent.session.header.parentSession) : agent
        return root ? { root, role: root === agent ? 'lead' : 'teammate', name: root === agent ? 'lead' : 'worker' } : undefined
      },
      membership(agent: Agent) { return this.tryMembership(agent) },
      listTasks() { return [] },
    })
  })
  const fiber = await ctx.plugin(Plugin, config)
  return { ctx, fiber }
}

async function agent(ctx: Context, id: string, seed: readonly SessionEvent[] = [], parent?: Agent, inherited = 0) {
  const session = Session.create(SessionId(id), seed, {
    version: 4, id: SessionId(id), createdAt: Date.now(), isSeeded: inherited > 0,
    ...(parent ? { origin: 'subagent' as const, parentSession: parent.id } : {}),
  }, SessionLogOffset(inherited))
  ctx.sessions.enter(session)
  ctx.sessions.announce(session)
  const value = { id: session.id, session, options: {}, status: 'idle' } as Agent
  await ctx.plugin(Object.assign((inner: Context) => {
    Object.assign(value, { ctx: createScope(inner, value).ctx })
  }, { inject: ['tools', 'systemPrompt'] }))
  ctx.agents.enter(value)
  ctx.agents.announce(value)
  await boundary(ctx, value)
  return value
}

async function boundary(ctx: Context, value: Agent) {
  const message = createUserMessage({ content: [{ type: 'text', text: 'probe' }], source: { kind: 'user' } })
  await agentEvents(ctx, value).waterfall('agent/pre-step', {
    messages: [message], turn: 1, step: 1, signal: new AbortController().signal,
  }, async () => ({ kind: 'enter', messages: [message] }))
}
async function command(ctx: Context, value: Agent, args: string) {
  return ctx.commands.execute(value, `/agentswitch ${args}`, [], new AbortController().signal)
}
const names = (ctx: Context, value: Agent) => ctx.tools.schemas(value).map(tool => tool.name)

describe('session switches using the DSH 0.2.2 runtime', () => {

  it('gates the existing official tool and restores it on plugin disposal', async () => {
    const { ctx, fiber } = await setup()
    const original = { name: 'subagent_codex', description: 'Official shared tool', parameters: {}, output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'completed' }] }, execute: async () => 'completed' }
    ctx.tools.register(original as never)
    const a = await agent(ctx, 'codex-lead')
    const b = await agent(ctx, 'codex-other')
    const child = await agent(ctx, 'codex-child', [], a)
    expect(names(ctx, a)).not.toContain('subagent_codex')
    await command(ctx, a, 'codex on')
    expect(ctx.tools.get('subagent_codex', a)).toBe(original)
    expect(names(ctx, a).filter(name => name === 'subagent_codex')).toHaveLength(1)
    expect(names(ctx, b)).not.toContain('subagent_codex')
    expect(names(ctx, child)).not.toContain('subagent_codex')
    await command(ctx, a, 'codex off')
    expect(names(ctx, a)).not.toContain('subagent_codex')
    await fiber.dispose()
    expect(ctx.tools.get('subagent_codex', a)).toBe(original)
    expect(ctx.tools.get('subagent_codex', b)).toBe(original)
  })

  it('rolls back Codex activation when the official provider is absent', async () => {
    const { ctx } = await setup()
    ctx.subagents.getProvider = () => undefined
    const a = await agent(ctx, 'missing-codex')
    await expect(command(ctx, a, 'codex on')).rejects.toThrow('Enable the official Codex Subagent')
    expect(names(ctx, a)).not.toContain('subagent_codex')
    await boundary(ctx, a)
    expect(names(ctx, a)).not.toContain('subagent_codex')
  })

  it('explains migration of the former private-provider model setting', async () => {
    const { ctx } = await setup({ maxRounds: 8, codexModel: 'old-model' })
    const a = await agent(ctx, 'old-codex-config')
    await expect(command(ctx, a, 'codex on')).rejects.toThrow('subagent-codex.config.model')
    expect(names(ctx, a)).not.toContain('subagent_codex')
  })

  it('starts off and keeps simultaneous conversations isolated', async () => {
    const { ctx } = await setup()
    const a = await agent(ctx, 'a')
    const b = await agent(ctx, 'b')
    expect(names(ctx, a)).not.toContain('ralph')
    expect(names(ctx, a)).not.toContain('spawn_teammate')
    await command(ctx, a, 'ralph on')
    expect(names(ctx, a)).toContain('ralph')
    expect(names(ctx, b)).not.toContain('ralph')
    expect(ctx.tools.schemas().map(tool => tool.name)).not.toContain('ralph')
    await command(ctx, a, 'teams on')
    expect(names(ctx, a)).toContain('spawn_teammate')
    expect(names(ctx, b)).not.toContain('spawn_teammate')
    await command(ctx, a, 'ralph off')
    expect(names(ctx, a)).not.toContain('ralph')
    expect(names(ctx, a)).toContain('spawn_teammate')
  })

  it('removes feature guidance when switched off', async () => {
    const { ctx } = await setup()
    const a = await agent(ctx, 'guidance')
    await command(ctx, a, 'teams on')
    expect(JSON.stringify(await ctx.systemPrompt.assemble({ agent: a, scope: a }))).toContain('Team Lead')
    await command(ctx, a, 'teams off')
    expect(JSON.stringify(await ctx.systemPrompt.assemble({ agent: a, scope: a }))).not.toContain('Team Lead')
  })

  it('rejects a team tool captured before disabling', async () => {
    const { ctx } = await setup()
    const a = await agent(ctx, 'stale')
    await command(ctx, a, 'teams on')
    const tool = ctx.tools.definitions(a).find(tool => tool.name === 'team_task_list')!
    await command(ctx, a, 'teams off')
    await expect(async () => tool.execute({}, { agent: a } as never)).rejects.toThrow('disabled')
  })

  it('denies stale Ralph calls after switching off', async () => {
    const { ctx } = await setup()
    const a = await agent(ctx, 'ralph-guard')
    await command(ctx, a, 'ralph on')
    expect(ctx.tools.checkGuards({ name: 'ralph', agent: a } as never)).toBeUndefined()
    await command(ctx, a, 'ralph off')
    expect(ctx.tools.checkGuards({ name: 'ralph', agent: a } as never)).toContain('disabled')
  })

  it('inherits Teams for members, keeps Ralph off, and rejects child changes', async () => {
    const { ctx } = await setup()
    const a = await agent(ctx, 'parent')
    await command(ctx, a, 'teams on')
    await command(ctx, a, 'ralph on')
    const child = await agent(ctx, 'child', [], a)
    expect(names(ctx, child)).toContain('team_task_list')
    expect(names(ctx, child)).not.toContain('ralph')
    await command(ctx, child, 'ralph on')
    expect(names(ctx, child)).not.toContain('ralph')
    await command(ctx, a, 'teams off')
    expect(names(ctx, child)).not.toContain('team_task_list')
  })

  it('restores recorded selections and resets independent forks', async () => {
    const { ctx } = await setup()
    const a = await agent(ctx, 'recorded')
    await command(ctx, a, 'teams on')
    await command(ctx, a, 'ralph on')
    const events = a.session.snapshotEvents()
    const resumed = await agent(ctx, 'resumed', events)
    expect(names(ctx, resumed)).toContain('ralph')
    expect(names(ctx, resumed)).toContain('spawn_teammate')
    const fork = await agent(ctx, 'fork', events, undefined, events.length)
    expect(names(ctx, fork)).not.toContain('ralph')
    expect(names(ctx, fork)).not.toContain('spawn_teammate')
  })

  it('handles duplicate and simultaneous commands without leaking registrations', async () => {
    const { ctx } = await setup()
    const a = await agent(ctx, 'parallel')
    await Promise.all([command(ctx, a, 'teams on'), command(ctx, a, 'ralph on')])
    await command(ctx, a, 'teams on')
    expect(names(ctx, a).filter(name => name === 'spawn_teammate')).toHaveLength(1)
    await Promise.all([command(ctx, a, 'teams off'), command(ctx, a, 'ralph off')])
    await boundary(ctx, a)
    expect(names(ctx, a)).not.toContain('ralph')
    expect(names(ctx, a)).not.toContain('spawn_teammate')
  })

  it('unloads registrations and can restore them on reload', async () => {
    const { ctx, fiber } = await setup()
    const a = await agent(ctx, 'reload')
    await command(ctx, a, 'teams on')
    await command(ctx, a, 'ralph on')
    await fiber.dispose()
    expect(names(ctx, a)).not.toContain('ralph')
    expect(names(ctx, a)).not.toContain('spawn_teammate')
    await ctx.plugin(Plugin, { maxRounds: 8 })
    expect(names(ctx, a)).toContain('spawn_teammate')
  })

  it('ignores incomplete and failed persisted commands', () => {
    const initial = projection.init({ origin: undefined } as never, SessionLogOffset(0))
    const run = { seq: 0, type: 'command/run', data: { commandId: 'x', name: 'agentswitch', args: 'ralph on' } } as SessionEvent
    const started = projection.apply(initial, run)
    expect(started.ralph).toBe(false)
    const done = { seq: 1, type: 'command/done', data: { commandId: 'x', kind: 'error' } } as SessionEvent
    expect(projection.apply(started, done).ralph).toBe(false)
  })

  it('defaults Codex to off when reading an existing two-switch checkpoint', () => {
    const old = { ralph: true, teams: true, child: false, inherited: 0, pending: [] }
    const restored = projection.stateSchema.parse(old)
    expect(projection.wire.view(restored)).toEqual({ ralph: true, teams: true, codex: false, child: false })
  })
})
