// Loaded only by scripts/smoke.mjs in an isolated DSH_HOME. All model responses
// are deterministic and local. The host loads the official Team, Ralph and Codex integrations.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'

export const inject = ['llm', 'agents', 'agentPresets', 'commands', 'tools', 'agentTeams', 'subagents', 'sessionPersistence', 'sessionProjections']
const teammatePrompt = 'Reply to this smoke test as the named teammate.'
class Mock extends LlmAdapter {
  requests = []
  teammateStarted = Promise.withResolvers()
  teammateMayFinish = Promise.withResolvers()
  async listModels(provider) { return [{ provider, id: 'mock', name: 'Enhancement Switches local test' }] }
  async resolveModel(provider, model) { return { provider, id: model, name: model } }
  async *stream(options) {
    const names = options.tools.map(tool => tool.name)
    this.requests.push(names)
    if (JSON.stringify(options.messages).includes(teammatePrompt)) {
      this.teammateStarted.resolve(names)
      await this.teammateMayFinish.promise
    }
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

export async function apply(ctx) {
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
    const resolveTools = agent => ctx.tools.resolve({
      agent, modelSelection: { provider: 'agentswitch-test', model: 'mock' }, signal: AbortSignal.timeout(30000),
    })
    const names = async agent => {
      const tools = await resolveTools(agent)
      try { return ctx.tools.schemas(agent, tools).map(tool => tool.name) }
      finally { tools.dispose() }
    }
    const call = async (agent, name, args) => {
      const tools = await resolveTools(agent)
      const signal = AbortSignal.timeout(30000)
      try {
        const tool = ctx.tools.executable(name, agent, tools)
        assert.ok(tool, `Missing ${name}`)
        return await tool.execute(args, { agent, signal })
      } finally { tools.dispose() }
    }
    const teamView = agent => ctx.sessionProjections.snapshot(agent.session, ['agentTeam']).values.agentTeam
    try {
      const a = await make('agentswitch-smoke-a')
      const b = await make('agentswitch-smoke-b')
      const initial = await names(a)
      for (const name of ['ralph', 'team_task_create', 'subagent_codex', 'spawn_teammate', 'interrupt_agent']) {
        assert.ok(!initial.includes(name), `${name} should be absent by default`)
      }
      for (const name of ['subagent', 'subagent_fork', 'send_message', 'list_agents', 'wait_agent']) {
        assert.ok(initial.includes(name), `Missing native ${name}`)
      }
      const officialProvider = ctx.subagents.getProvider('codex')
      const officialTool = ctx.tools.get('subagent_codex')
      assert.ok(officialProvider && officialTool)
      checks.push('Default off preserves standard named delegation and controls')
      await command(a, 'ralph on')
      await command(a, 'teams on')
      await command(a, 'codex on')
      assert.equal(teamView(a).enabled, true)
      assert.equal(teamView(b).enabled, false)
      assert.equal(ctx.tools.get('subagent_codex', a), officialTool)
      assert.equal(ctx.tools.get('subagent_codex', b), undefined)
      assert.equal(ctx.tools.checkGuards({ name: 'subagent_codex', agent: a }), undefined)
      const enabled = await names(a)
      for (const name of ['ralph', 'team_task_create', 'team_task_list', 'team_task_get', 'team_task_update', 'subagent_codex', 'subagent', 'subagent_fork']) {
        assert.ok(enabled.includes(name), `Missing ${name}`)
        if (name !== 'subagent' && name !== 'subagent_fork') assert.ok(!(await names(b)).includes(name))
      }
      checks.push('Each switch changes only the selected root and Teams keeps native delegation')
      const task = await call(a, 'team_task_create', { subject: 'Smoke test', description: 'Verify shared task persistence' })
      assert.equal(task.subject, 'Smoke test')
      const spawned = await call(a, 'subagent', { name: 'smoke-worker', description: 'Local test worker', prompt: teammatePrompt })
      assert.deepEqual(spawned, { kind: 'activation', name: 'smoke-worker' })
      const modelTools = await Promise.race([
        adapter.teammateStarted.promise,
        delay(10000, undefined, { ref: false }).then(() => { throw new Error('Teammate did not start a model request') }),
      ])
      assert.ok(modelTools.includes('team_task_list') && modelTools.includes('send_message'))
      assert.ok(!modelTools.includes('subagent_codex') && !modelTools.includes('ralph'))
      const receipt = await call(a, 'send_message', { agent: 'smoke-worker', message: 'Confirm this named child remains reachable.' })
      assert.ok(receipt.messageId)
      checks.push('Native named child inherits task tools and receives a message')
      const ralph = await call(a, 'ralph', { objective: 'Complete the deterministic local smoke test', maxRounds: 1 })
      assert.equal(ralph.result.status, 'complete')
      assert.equal(ralph.agentsStarted, 1)
      checks.push('Official Ralph workflow completes one fresh-agent round')
      await command(a, 'codex off')
      assert.equal(ctx.subagents.getProvider('codex'), officialProvider)
      assert.ok(!(await names(a)).includes('subagent_codex'))
      assert.match(ctx.tools.checkGuards({ name: 'subagent_codex', agent: a })?.reason, /disabled/)
      assert.equal(teamView(a).enabled, true)
      checks.push('Turning Codex off hides its tool and retains the official provider')
      await ctx.agentTeams.setEnabled(a, false)
      assert.equal(teamView(a).enabled, false)
      const disabled = await names(a)
      assert.ok(!disabled.includes('team_task_list') && disabled.includes('subagent'))
      adapter.teammateMayFinish.resolve()
      await command(a, 'teams on')
      const tasks = await call(a, 'team_task_list', {})
      assert.ok(tasks.tasks.some(row => row.subject === 'Smoke test'))
      checks.push('Native menu API and slash command share state; re-enabling restores the task board')
      const id = a.id
      await command(a, 'codex on')
      await handles[0].dispose()
      handles.shift()
      const resumed = await ctx.agents.resume({ resumeSessionId: id, setup })
      handles.push(resumed)
      const restored = await names(resumed.agent)
      assert.ok(restored.includes('ralph') && restored.includes('team_task_list') && restored.includes('subagent_codex'))
      assert.equal(teamView(resumed.agent).enabled, true)
      checks.push('Disk-backed session resume restores all three switches')
      await writeFile(join(process.env.DSH_HOME, 'smoke-result.json'), JSON.stringify({ ok: true, checks, modelCalls: adapter.requests.length, toolSets: adapter.requests }, null, 2))
    } finally {
      adapter.teammateMayFinish.resolve()
      for (const handle of handles.reverse()) await handle.dispose()
    }
  }
}
