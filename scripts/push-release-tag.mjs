import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tag = process.argv[2]
if (process.argv.length !== 3 || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  throw new Error('Usage: node scripts/push-release-tag.mjs vX.Y.Z')
}

const root = fileURLToPath(new URL('../', import.meta.url))
const git = (cwd, ...args) => execFileSync('git', args, {
  cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
}).trim()
const tagRef = `refs/tags/${tag}`
git(root, 'rev-parse', '--verify', `${tagRef}^{commit}`)

const checkout = mkdtempSync(join(tmpdir(), 'dsh-plugin-index-'))
try {
  git(root, 'clone', '--quiet', '--branch', 'main', git(root, 'remote', 'get-url', 'origin'), checkout)
  git(checkout, 'remote', 'set-url', '--push', 'origin', git(root, 'remote', 'get-url', '--push', 'origin'))
  git(checkout, 'fetch', '--no-tags', root, `${tagRef}:${tagRef}`)

  execFileSync(process.execPath, ['scripts/update-plugin-index.mjs'], { cwd: checkout, stdio: 'inherit' })
  if (git(checkout, 'status', '--porcelain', '--', 'plugin-index.json')) {
    git(checkout, 'config', 'user.name', git(root, 'config', '--get', 'user.name'))
    git(checkout, 'config', 'user.email', git(root, 'config', '--get', 'user.email'))
    git(checkout, 'add', '--', 'plugin-index.json')
    git(checkout, 'commit', '-m', `Update plugin index for ${tag}`)
  }
  git(checkout, 'push', '--atomic', 'origin', 'HEAD:refs/heads/main', tagRef)
  console.log(`Published ${tag} with the current plugin index.`)
} finally {
  rmSync(checkout, { recursive: true, force: true })
}
