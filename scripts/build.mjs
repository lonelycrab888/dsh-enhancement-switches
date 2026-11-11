import { build } from 'esbuild'
import { rm } from 'node:fs/promises'

await rm('lib', { recursive: true, force: true })
await build({ entryPoints: ['src/index.ts'], outdir: 'lib', bundle: true,
  platform: 'node', format: 'esm', target: 'node22', packages: 'external' })
await build({ entryPoints: ['src/client.tsx'], outfile: 'lib/client.cjs', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  banner: { js: 'window.__ModuleLoader__.load({id:"dsh-enhancement-switches",factory:(require)=>{var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' },
})
