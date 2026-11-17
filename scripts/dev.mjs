import { spawn } from 'node:child_process'

const vite = 'node_modules/vite/bin/vite.js'
const run = args => spawn(process.execPath,[vite,...args],{stdio:'inherit'})
const prepare = run(['build'])
prepare.on('exit',code=>{
  if (code) { process.exitCode = code; return }
  const builds = [
    run(['build','--watch','--emptyOutDir','false']),
    run(['build','--watch','--config','vite.content.ts']),
  ]
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>builds.forEach(build=>build.kill(signal)))
  for (const build of builds) build.on('exit',code=>{
    if (code) {
      process.exitCode=code
      builds.filter(other=>other!==build).forEach(other=>other.kill())
    }
  })
})
