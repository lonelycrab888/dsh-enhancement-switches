// A local, model-free probe loaded by lifecycle.mjs into the real host.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SessionId } from '@deepseek-ai/dsh-session'

export const inject = ['agents', 'agentPresets', 'commands', 'tools', 'systemPrompt', 'sessionPersistence']
export function apply(ctx) {
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
    const snapshot = async () => ({
      tools: ctx.tools.schemas(agent).toSorted((a, b) => a.name.localeCompare(b.name)),
      prompt: await ctx.systemPrompt.assemble({ agent, scope: agent }),
      commands: ctx.commands.list(agent).toSorted((a, b) => a.name.localeCompare(b.name)),
    })
    const command = async args => {
      const response = await ctx.commands.execute(agent, `/agentswitch ${args}`, [], new AbortController().signal)
      assert.equal(response?.result.kind, 'success')
    }
    try {
      const result = { ok: true, preset, initial: await snapshot() }
      if (phase === 'enabled') {
        await command('ralph on')
        await command('teams on')
        result.on = await snapshot()
        assert.ok(result.on.tools.some(tool => tool.name === 'ralph'))
        assert.ok(result.on.tools.some(tool => tool.name === 'spawn_teammate'))
        for (const name of ['subagent', 'subagent_fork']) {
          assert.ok(result.initial.tools.some(tool => tool.name === name))
          assert.ok(!result.on.tools.some(tool => tool.name === name))
        }
        await command('ralph off')
        await command('teams off')
        result.off = await snapshot()
        // Leave durable selections ON so disabling/uninstalling must suppress them.
        await command('ralph on')
        await command('teams on')
      }
      await save(result)
    } finally { await handle.dispose() }
  }
}
