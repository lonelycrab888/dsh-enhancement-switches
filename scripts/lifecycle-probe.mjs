// A local, model-free probe loaded by lifecycle.mjs into the real host.
import assert from 'node:assert/strict'
import * as Codex from '@deepseek-ai/dsh-subagent-codex'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'

export const inject = ['agents', 'agentPresets', 'commands', 'tools', 'systemPrompt', 'sessionPersistence', 'agentTeams', 'sessions']
export async function apply(ctx) {
  await ctx.plugin(Codex, { providerName: 'codex' })
  ctx.effect(() => {
    const timer = setTimeout(() => void run().catch(error => save({ ok: false, error: error.stack })), 1500)
    return () => clearTimeout(timer)
  })
  const save = result => writeFile(join(process.env.DSH_HOME, `${process.env.AGENTSWITCH_PHASE}.json`), JSON.stringify(result, null, 2))
  async function run() {
    const phase = process.env.AGENTSWITCH_PHASE
    const preset = (await ctx.agentPresets.resolve()).id
    const setup = async agentCtx => { await ctx.agentPresets.mount(agentCtx, preset) }
    const handle = phase === 'baseline'
      ? await ctx.agents.create({ sessionId: SessionId('agentswitch-lifecycle'), agentOptions: {}, meta: { cwd: process.env.DSH_HOME, agentPreset: preset }, setup })
      : await ctx.agents.resume({ resumeSessionId: SessionId('agentswitch-lifecycle'), setup })
    const agent = handle.agent
    const snapshot = async () => {
      const toolSet = await ctx.tools.resolve({ agent, modelSelection: {}, signal: AbortSignal.timeout(10000) })
      try {
        return {
          tools: ctx.tools.schemas(agent, toolSet).toSorted((a, b) => a.name.localeCompare(b.name)),
          prompt: await ctx.systemPrompt.assemble({ agent, scope: agent, toolSet }),
          commands: ctx.commands.list(agent).toSorted((a, b) => a.name.localeCompare(b.name)),
        }
      } finally {
        toolSet.dispose()
      }
    }
    const command = async args => {
      const response = await ctx.commands.execute(agent, `/agentswitch ${args}`, [], new AbortController().signal)
      assert.equal(response?.result.kind, 'success')
    }
    try {
      const result = { ok: true, preset, initial: await snapshot() }
      const legacyId = SessionId('agentswitch-lifecycle-legacy')
      if (phase === 'baseline') {
        await ctx.agentTeams.setEnabled(agent, true)
        result.nativeTeamsOn = await snapshot()
        await ctx.agentTeams.setEnabled(agent, false)
        const legacy = await ctx.agents.create({ sessionId: legacyId, agentOptions: {}, meta: { cwd: process.env.DSH_HOME, agentPreset: preset }, setup })
        try {
          legacy.agent.session.append('command/run', { commandId: 'legacy-teams', name: 'agentswitch', args: 'teams on' })
          legacy.agent.session.append('command/done', { commandId: 'legacy-teams', kind: 'success' })
          await ctx.sessions.flush(legacy.agent.session)
        } finally {
          await legacy.dispose()
        }
      }
      if (phase === 'enabled') {
        const legacy = await ctx.agents.resume({ resumeSessionId: legacyId, setup })
        try {
          assert.equal(ctx.agentTeams.isEnabled(legacy.agent), true, 'The saved rc.1 command migrates on resume')
          await ctx.agentTeams.setEnabled(legacy.agent, false)
        } finally {
          await legacy.dispose()
        }
        const reopened = await ctx.agents.resume({ resumeSessionId: legacyId, setup })
        try {
          assert.equal(ctx.agentTeams.isEnabled(reopened.agent), false, 'Native off wins over the historical rc.1 command')
        } finally {
          await reopened.dispose()
        }
        await command('ralph on')
        await command('teams on')
        await command('codex on')
        result.on = await snapshot()
        assert.ok(result.on.tools.some(tool => tool.name === 'ralph'))
        assert.ok(result.on.tools.some(tool => tool.name === 'team_task_list'))
        assert.ok(result.on.tools.some(tool => tool.name === 'subagent_codex'))
        for (const name of ['subagent', 'subagent_fork']) {
          assert.ok(result.initial.tools.some(tool => tool.name === name))
          assert.ok(result.on.tools.some(tool => tool.name === name))
        }
        await command('ralph off')
        await command('teams off')
        await command('codex off')
        result.off = await snapshot()
        // Leave all three on. Native Team mode outlives the plugin.
        await command('ralph on')
        await command('teams on')
        await command('codex on')
      }
      await save(result)
    } finally { await handle.dispose() }
  }
}
