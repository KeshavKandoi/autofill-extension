import { chromium } from '@playwright/test'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const output = resolve('release/assets')
const extension = resolve('dist')
await mkdir(output,{recursive:true})
const profile = await mkdtemp(join(tmpdir(),'autofill-store-'))
let context
try {
  context = await chromium.launchPersistentContext(profile,{
    channel:'chromium',headless:true,viewport:{width:1280,height:800},colorScheme:'light',
    args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const page = await context.newPage()
  await page.goto(new URL('/options.html',worker.url()).href)
  await page.getByLabel('Vault password').fill('example-only passphrase')
  await page.getByRole('button',{name:'Create vault'}).click()
  await page.getByText('Autofill ready',{exact:true}).waitFor()
  for (const [label,value] of Object.entries({
    'Full name':'Morgan Example','First name':'Morgan','Last name':'Example','Email':'morgan@example.test',
    'City':'Pune','Country':'India','Portfolio URL':'https://portfolio.example.test',
  })) await page.getByLabel(label,{exact:true}).fill(value)
  await page.getByRole('button',{name:'Save profile'}).click()
  await page.getByText('Profile saved.',{exact:true}).waitFor()
  await page.getByRole('heading',{name:'Your profile'}).scrollIntoViewIfNeeded()
  await page.screenshot({path:join(output,'01-profile.png'),scale:'css'})
  await page.getByRole('button',{name:'Saved answers',exact:true}).click()
  await page.getByRole('button',{name:'Add custom field'}).click()
  await page.getByLabel('Question',{exact:true}).fill('Preferred programming language')
  await page.getByLabel('Answer',{exact:true}).fill('TypeScript')
  await page.getByLabel('Equivalent questions, one per line').fill('Favorite programming language')
  await page.getByRole('button',{name:'Save answer',exact:true}).click()
  await page.getByText('Answer saved.',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Edit',exact:true}).click()
  await page.getByLabel('Question',{exact:true}).waitFor()
  await page.screenshot({path:join(output,'02-question-memory.png'),scale:'css'})
  await page.setViewportSize({width:440,height:280})
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;height:280px;display:grid;place-items:center;background:#18244c;color:#eef2ff;font:700 16px system-ui}
    main{width:360px;display:grid;grid-template-columns:145px 1fr;align-items:center;gap:17px}
    h1{font-size:34px;line-height:.99;letter-spacing:-1.8px;margin:0} p{font-weight:500;color:#d1dcff;margin:12px 0 0;font-size:14px}
    .form{background:#e0e7ff;padding:18px;border-radius:14px;box-shadow:10px 12px #111933;transform:rotate(-5deg);color:#233b82}
    .line{height:26px;background:#fff;border:1px solid #9caee7;border-radius:6px;margin:8px 0;display:flex;align-items:center;padding:0 7px;gap:7px}
    .line i{width:60%;height:4px;background:#718bcf;border-radius:8px}.line b{margin-left:auto;color:#3157ba}
    .symbol{color:#1f326e;background:#afc2ff;border-radius:11px;padding:5px 10px;display:inline-block;margin-bottom:13px;font-size:24px;line-height:1}
  </style><main><div><span class="symbol">↗</span><h1>Autofill</h1><p>Fill forms with your saved answers.</p></div>
  <div class="form" aria-hidden="true"><div class="line"><i></i><b>✓</b></div><div class="line"><i></i><b>✓</b></div><div class="line"><i></i><b>✓</b></div></div></main>`)
  await page.screenshot({path:join(output,'small-promo.png'),scale:'css'})
} finally {
  await context?.close()
  await rm(profile,{recursive:true,force:true})
}
