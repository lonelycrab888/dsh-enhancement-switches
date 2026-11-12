import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const repository = 'https://github.com/lonelycrab888/dsh-enhancement-switches'
const name = 'dsh-enhancement-switches'
const title = { en: 'Enhancement Switches', zh: '增强开关' }
const git = (...args) => execFileSync('git', args, {
  cwd: fileURLToPath(root), encoding: 'utf8',
}).trim()

const tags = git('tag', '--list', '--sort=-version:refname', 'v*')
  .split('\n')
  .filter(tag => /^v\d+\.\d+\.\d+$/.test(tag))
if (!tags.length) throw new Error('No release tags found')

const versions = tags.map(tag => {
  const commit = git('rev-parse', `${tag}^{commit}`)
  const manifest = JSON.parse(git('show', `${commit}:package.json`))
  const dsh = manifest.engines?.dsh
  if (manifest.name !== name || manifest.version !== tag.slice(1) || !manifest.dsh?.bundle?.patch || !dsh) {
    throw new Error(`${tag} must match the package name and version and declare a bundle and engines.dsh`)
  }
  return {
    version: manifest.version,
    publishTimestamp: Number(git('for-each-ref', '--format=%(creatordate:unix)', `refs/tags/${tag}`)),
    source: { type: 'git', url: repository, commit },
    engines: { dsh },
  }
})

const index = {
  format: 1,
  title,
  plugins: [{
    name, title,
    description: {
      en: 'Per-conversation switches for Ralph Loop, Agent Teams, and Codex Subagent.',
      zh: '在每个对话中单独切换 Ralph Loop、Agent Teams 和 Codex 子智能体。',
    },
    repository: { url: repository },
    versions,
  }],
}
writeFileSync(new URL('plugin-index.json', root), JSON.stringify(index, null, 2) + '\n')
