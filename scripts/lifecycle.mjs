import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'node:net'

assert.equal(execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim(), '0.2.2-rc.1')
await mkdir('work', { recursive: true })
const home = await mkdtemp(resolve('work/lifecycle-'))
const env = { ...process.env, DSH_HOME: home }
// Reuse one address so the host's own Web-URL prompt context stays identical.
const portProbe = createServer()
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))
const port = String(portProbe.address().port)
await new Promise(resolve => portProbe.close(resolve))
const cli = args => execFileSync('dsh', args, { env, stdio: 'ignore' })
cli(['--profile', 'web', '--dump-config'])
const patch = join(home, 'probe.patch.yml')
await writeFile(patch, `- insert:\n    - id: agentswitch-lifecycle-probe\n      name: ${JSON.stringify(resolve('scripts/lifecycle-probe.mjs'))}\n`)
async function capture(phase) {
  const child = spawn('dsh', ['--profile', 'web', '--patch', patch, '--no-open', '--port', port], { env: { ...env, AGENTSWITCH_PHASE: phase }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', chunk => { log += chunk })
  child.stderr.on('data', chunk => { log += chunk })
  try {
    const deadline = Date.now() + 45000
    while (Date.now() < deadline) {
      try {
        const result = JSON.parse(await readFile(join(home, `${phase}.json`), 'utf8'))
        assert.equal(result.ok, true, result.error)
        console.log(`${phase}: captured ${result.initial.tools.length} tools (${result.preset} preset)`)
        return result
      } catch (error) { if (error.code !== 'ENOENT') throw error }
      if (child.exitCode !== null) throw new Error(`${phase}: host exited ${child.exitCode}`)
      await delay(250)
    }
    throw new Error(`${phase}: timed out`)
  } finally {
    const ended = new Promise(resolve => child.once('exit', resolve))
    child.kill('SIGTERM')
    if (child.exitCode === null) await ended
    await writeFile(join(home, `${phase}.log`), log)
  }
}
console.log(`Lifecycle evidence: ${home}`)
const baseline = await capture('baseline')
cli(['plugin', '--profile', 'web', 'add', process.cwd()])
const enabled = await capture('enabled')
const manifest = join(home, 'profiles/web/package.json')
const json = JSON.parse(await readFile(manifest, 'utf8'))
json.dsh.profile.bundles = json.dsh.profile.bundles.filter(name => name !== 'dsh-enhancement-switches')
await writeFile(manifest, JSON.stringify(json, null, 2))
const disabled = await capture('disabled')
cli(['plugin', '--profile', 'web', 'remove', 'dsh-enhancement-switches'])
const uninstalled = await capture('uninstalled')
// Prompts are captured before any model turn: no generated content or variable time normalization.
for (const [label, value] of [['enabled default off', enabled.initial], ['all switches off', enabled.off], ['disabled', disabled.initial], ['uninstalled', uninstalled.initial]]) {
  assert.deepEqual(value.tools, baseline.initial.tools, `${label}: tool schemas differ from native host`)
  assert.deepEqual(value.prompt, baseline.initial.prompt, `${label}: prompt differs from native host`)
}
assert.deepEqual(disabled.initial.commands, baseline.initial.commands)
assert.deepEqual(uninstalled.initial.commands, baseline.initial.commands)
const result = { ok: true, preset: baseline.preset, nativeTools: baseline.initial.tools.map(tool => tool.name), checks: ['Default-off and switched-off tool schemas and full system prompt equal native host', 'Disabled bundle removes commands, tools and prompt changes even with saved ON selections', 'Uninstalled package removes commands, tools and prompt changes even with saved ON selections'], modelCalls: 0 }
await writeFile(join(home, 'result.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
