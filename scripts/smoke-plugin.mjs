// Loaded only by scripts/smoke.mjs in an isolated DSH_HOME. All model responses
// are deterministic and local. The actual host, Team service and Ralph worker run.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

export const inject = ['llm', 'agents', 'agentPresets', 'commands', 'tools', 'agentTeams', 'sessionPersistence']
class Mock extends LlmAdapter {
  requests = []
  async listModels() { return [{ id: 'mock', name: 'Enhancement Switches local test' }] }
  async resolveModel(provider, model) { return { provider, id: model, name: model } }
  async *stream(options) {
    this.requests.push(options.tools.map(tool => tool.name))
    if (options.tools.some(tool => tool.name === 'structured_output')) {
      const args = JSON.stringify({ status: 'complete', summary: 'Local smoke test completed', evidence: ['Deterministic local provider returned structured output'], nextSteps: [], blocker: '' })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: 'smoke-result', name: 'structured_output', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'smoke-result', name: 'structured_output', arguments: args } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'Local test completed.' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Local test completed.' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export function apply(ctx) {
  const adapter = new Mock()
  ctx.llm.registerAdapter(['agentswitch-test'], adapter)
  ctx.effect(() => {
    const timer = setTimeout(() => void run().catch(async error => {
      await writeFile(join(process.env.DSH_HOME, 'smoke-result.json'), JSON.stringify({ ok: false, error: error.stack }, null, 2))
    }), 1500)
    return () => clearTimeout(timer)
  })
  async function run() {
    const handles = []
    const checks = []
    const preset = (await ctx.agentPresets.resolve()).id
    const setup = async agentCtx => { await ctx.agentPresets.mount(agentCtx, preset) }
    const make = async id => {
      const handle = await ctx.agents.create({
        sessionId: SessionId(id),
        agentOptions: { provider: 'agentswitch-test', model: 'mock', cwd: process.env.DSH_HOME },
        meta: { cwd: process.env.DSH_HOME, agentPreset: preset },
        setup,
      })
      handles.push(handle)
      return handle.agent
    }
    const command = async (agent, args) => {
      const result = await ctx.commands.execute(agent, `/agentswitch ${args}`, [], new AbortController().signal)
      assert.equal(result?.result.kind, 'success', JSON.stringify(result))
    }
    const names = agent => ctx.tools.schemas(agent).map(tool => tool.name)
    const standalone = agent => names(agent).filter(name => name === 'subagent' || name === 'subagent_fork').sort()
    const standaloneNames = ['subagent', 'subagent_fork']
    const call = (agent, name, args) => {
      const tool = ctx.tools.definitions(agent).find(tool => tool.name === name)
      assert.ok(tool, `Missing ${name}`)
      return tool.execute(args, { agent, signal: AbortSignal.timeout(30000) })
    }
    try {
      const a = await make('agentswitch-smoke-a')
      const b = await make('agentswitch-smoke-b')
      assert.ok(!names(a).includes('ralph') && !names(a).includes('spawn_teammate'))
      assert.deepEqual(standalone(a), standaloneNames)
      const ordinary = await call(a, 'subagent', { description: 'Ordinary child before switching', prompt: 'Reply with a short local test confirmation' })
      assert.ok(ordinary.subagentId)
      checks.push('Both features default off')
      await command(a, 'ralph on')
      await command(a, 'teams on')
      assert.ok(names(a).includes('ralph') && names(a).includes('spawn_teammate'))
      assert.ok(!names(b).includes('ralph') && !names(b).includes('spawn_teammate'))
      assert.deepEqual(standalone(a), [])
      assert.deepEqual(standalone(b), standaloneNames)
      checks.push('Teams hides ordinary delegation in one session and preserves it in another')
      const task = await call(a, 'team_task_create', { subject: 'Smoke test', description: 'Verify shared task persistence' })
      assert.equal(task.subject, 'Smoke test')
      checks.push('Official Team task board creates tasks')
      const spawned = await call(a, 'spawn_teammate', { name: 'smoke-worker', description: 'Local test worker', prompt: 'Reply with local test completed', context: 'fresh' })
      assert.equal(spawned.member.target, 'smoke-worker')
      const member = ctx.agentTeams.listMembers(a).find(row => row.name === spawned.member.target)
      const teammate = member && ctx.agents.get(member.id)
      assert.ok(teammate)
      assert.deepEqual(standalone(teammate), [])
      assert.ok(names(teammate).includes('send_message'))
      checks.push('Official Team service spawns a member with the same delegation filter')
      const ralph = await call(a, 'ralph', { objective: 'Complete the deterministic local smoke test', maxRounds: 1 })
      assert.equal(ralph.result.status, 'complete')
      assert.equal(ralph.agentsStarted, 1)
      checks.push('Official Ralph workflow completes one fresh-agent round')
      await command(a, 'teams off')
      assert.ok(!names(a).includes('spawn_teammate'))
      assert.deepEqual(standalone(a), standaloneNames)
      assert.deepEqual(standalone(teammate), standaloneNames)
      const receipt = await call(a, 'send_message', { agent_id: ordinary.subagentId, message: 'Confirm this existing ordinary child remains reachable.' })
      assert.ok(receipt.messageId)
      checks.push('Turning Teams off restores ordinary delegation and messaging to an existing child')
      await command(a, 'teams on')
      const tasks = await call(a, 'team_task_list', {})
      assert.ok(tasks.tasks.some(row => row.subject === 'Smoke test'))
      checks.push('Switching off/on retains Team tasks')
      const id = a.id
      await handles[0].dispose()
      handles.shift()
      const resumed = await ctx.agents.resume({ resumeSessionId: id, setup })
      handles.push(resumed)
      assert.ok(names(resumed.agent).includes('ralph') && names(resumed.agent).includes('spawn_teammate'))
      assert.deepEqual(standalone(resumed.agent), [])
      checks.push('Disk-backed session resume restores both switches')
      await writeFile(join(process.env.DSH_HOME, 'smoke-result.json'), JSON.stringify({ ok: true, checks, modelCalls: adapter.requests.length, toolSets: adapter.requests }, null, 2))
    } finally {
      for (const handle of handles.reverse()) await handle.dispose()
    }
  }
}
