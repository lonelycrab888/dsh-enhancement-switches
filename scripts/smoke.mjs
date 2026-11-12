import { execFileSync, spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const version = execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
if (version !== '0.2.2-rc.2') throw new Error(`This test targets DSH 0.2.2-rc.2, found ${version}`)
await mkdir('work', { recursive: true })
const home = await mkdtemp(resolve('work/smoke-'))
const env = { ...process.env, DSH_HOME: home }
execFileSync('dsh', ['--profile', 'web', '--dump-config'], { env, stdio: 'ignore' })
execFileSync('dsh', ['plugin', '--profile', 'web', 'add', '@deepseek-ai/dsh-subagent-codex@' + version, process.cwd()], { env, stdio: 'inherit' })
const patch = join(home, 'smoke.patch.yml')
await writeFile(patch, `- insert:\n    - id: agentswitch-smoke\n      name: ${JSON.stringify(resolve('scripts/smoke-plugin.mjs'))}\n`)
const child = spawn('dsh', ['--profile', 'web', '--patch', patch, '--no-open', '--port', '0'], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
child.stdout.on('data', chunk => { log += chunk })
child.stderr.on('data', chunk => { log += chunk })
const resultPath = join(home, 'smoke-result.json')
try {
  const deadline = Date.now() + 60000
  let result
  while (Date.now() < deadline) {
    try { result = JSON.parse(await readFile(resultPath, 'utf8')); break }
    catch (error) { if (error.code !== 'ENOENT') throw error }
    if (child.exitCode !== null) throw new Error(`DSH exited with ${child.exitCode}`)
    await delay(250)
  }
  if (!result) throw new Error('Smoke test exceeded 60 seconds')
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
} finally {
  child.kill('SIGTERM')
  await writeFile(join(home, 'host.log'), log)
  console.log(`Smoke test evidence saved in ${home}`)
}
