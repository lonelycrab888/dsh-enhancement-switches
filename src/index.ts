import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-experimental-agent-team'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import * as Ralph from '@deepseek-ai/dsh-tool-ralph'
import { projection, parseSelection, type Selection } from './state.ts'
import { installTeamTools } from './vendor/team-tools.ts'

export const name = 'agentswitch'
export const inject = ['agents', 'commands', 'sessionProjections', 'agentTeams', 'workflowEngine', 'subagents', 'tools', 'systemPrompt']
export interface Config { maxRounds: number }
export const Config = Schema.object({ maxRounds: Schema.number().step(1).min(1).default(8) })

const standaloneDelegation = ['subagent', 'subagent_fork']

/** Scope ownership keeps global bundles and ordinary presets independent. */
export async function apply(ctx: Context, config: Config = { maxRounds: 8 }): Promise<void> {
  const saved = await ctx.sessionProjections.register(projection)
  const mounted = new Map<Agent, { ralph?: Scope; teams?: () => void }>()
  const pending = new Map<string, { agent: Agent; feature: 'ralph' | 'teams'; enabled: boolean }>()
  let stopped = false
  let queue: Promise<void> = Promise.resolve()

  function selected(agent: Agent): Selection {
    const state = { ...saved.stateOf(agent.session) }
    for (const change of pending.values()) {
      if (change.agent === agent) state[change.feature] = change.enabled
    }
    return state
  }

  function teamEnabled(agent: Agent): boolean {
    const member = ctx.agentTeams.tryMembership(agent)
    return !stopped && member !== undefined && selected(member.root).teams
  }

  function ralphEnabled(agent: Agent): boolean {
    return !stopped && agent.session.header.origin !== 'subagent' && selected(agent).ralph
  }

  function visibleStandaloneDelegation(agent: Agent): string[] {
    return standaloneDelegation.filter(name => ctx.tools.get(name, agent) !== undefined)
  }

  function mountTeams(agent: Agent): () => void {
    const deny = visibleStandaloneDelegation(agent)
    const restore = deny.length > 0 ? agent.ctx.tools.restrict({ deny }) : undefined
    try {
      const unmount = installTeamTools(agent, ctx,
        { interrupt: true, freshProvider: 'spawn', forkProvider: 'fork' }, () => teamEnabled(agent))
      return () => {
        try {
          unmount()
        } finally {
          restore?.()
        }
      }
    } catch (error) {
      restore?.()
      throw error
    }
  }

  async function reconcile(): Promise<void> {
    for (const agent of ctx.agents.list()) {
      if (!mounted.has(agent)) mounted.set(agent, {})
      const entry = mounted.get(agent)!
      if (ralphEnabled(agent) && !entry.ralph) {
        const scope = createScope(ctx, agent)
        try {
          Ralph.apply(scope.ctx, { maxRounds: config.maxRounds, subagentProvider: 'spawn' })
          // A tool set may have been prepared before the user switched off.
          // The guard survives the dynamic Ralph registration below.
          entry.ralph = scope
        } catch (error) {
          await scope.dispose()
          throw error
        }
      } else if (!ralphEnabled(agent) && entry.ralph) {
        const scope = entry.ralph
        delete entry.ralph
        await scope.dispose()
      }
      const teams = teamEnabled(agent)
      // A preset or provider change can expose a delegation tool that was absent at mount time.
      if (entry.teams && (!teams || visibleStandaloneDelegation(agent).length > 0)) {
        entry.teams()
        delete entry.teams
      }
      if (teams && !entry.teams) entry.teams = mountTeams(agent)
    }
  }

  function schedule(): Promise<void> {
    const task = queue.then(reconcile)
    queue = task.catch(error => { ctx.logger.error('Enhancement Switches reconciliation failed', error) })
    return task
  }

  ctx.tools.guard(execution => {
    if (execution.name === 'ralph' && (!execution.agent || !ralphEnabled(execution.agent))) {
      return 'Ralph Loop is disabled in this conversation.'
    }
  })

  ctx.commands.register({
    name: 'agentswitch',
    description: 'Enable Ralph Loop or Agent Teams for this conversation',
    input: { hint: '<ralph|teams> <on|off>' },
    async handler({ agent, commandId, rawInput }) {
      const selection = parseSelection(rawInput)
      if (!selection) return { kind: 'error', text: 'Usage: /agentswitch <ralph|teams> <on|off>' }
      if (agent.session.header.origin === 'subagent') {
        return { kind: 'error', text: 'Change these switches in the root conversation.' }
      }
      pending.set(commandId, { agent, ...selection })
      try {
        await schedule()
        return { kind: 'success', text: `${selection.feature} ${selection.enabled ? 'on' : 'off'}` }
      } catch (error) {
        pending.delete(commandId)
        await schedule()
        throw error
      }
    },
  })

  ctx.on('session/event', (_session, event) => {
    if (event.type === 'command/done' && pending.delete(event.data.commandId)) void schedule().catch(() => {})
  })
  ctx.on('agent/created', async () => { await schedule() })
  ctx.on('agent/pre-step', async (_event, next) => {
    await schedule()
    return next()
  })
  ctx.on('agent/disposed', async ({ agent }) => {
    const entry = mounted.get(agent)
    mounted.delete(agent)
    entry?.teams?.()
    await entry?.ralph?.dispose()
  })
  ctx.effect(() => async () => {
    stopped = true
    await queue
    for (const entry of mounted.values()) {
      entry.teams?.()
      await entry.ralph?.dispose()
    }
    mounted.clear()
    pending.clear()
  })
  await schedule()
}
