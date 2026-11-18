import { test,expect,chromium,type Page,type BrowserContext } from '@playwright/test'
import { cp,mkdtemp,readFile,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'

const fixture = 'http://127.0.0.1:4173/tests/fixtures/form.html'
const other = 'http://localhost:4173/tests/fixtures/form.html?equivalent'
const passphrase = 'local fixture passphrase'
const testHosts = ['http://127.0.0.1/*','http://localhost/*']

async function launch(directory:string,profile:string) {
  return chromium.launchPersistentContext(profile,{
    channel:'chromium',headless:true,
    args:[`--disable-extensions-except=${directory}`,`--load-extension=${directory}`],
  })
}
async function extensionId(context:BrowserContext) {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  return new URL(worker.url()).host
}
type Node = {nodeId:number;nodeValue:string;nodeName:string;children?:Node[];shadowRoots?:Node[]}
async function openAssistant(options:Page,page:Page) {
  await options.evaluate(async url=>{
    const [tab] = await chrome.tabs.query({url})
    if (tab?.id===undefined) throw new Error('Fixture tab could not be found.')
    const result = await chrome.runtime.sendMessage({type:'PAGE',tabId:tab.id,fill:false,openAssistant:true})
    if (!result.ok) throw new Error(result.error)
  },page.url())
  await expect(page.locator('[data-autofill-ai]')).toHaveCount(1)
}
async function assistantClick(page:Page,text:string) {
  const client = await page.context().newCDPSession(page)
  try {
    await expect.poll(async()=>{
      const {root} = await client.send('DOM.getDocument',{depth:-1,pierce:true})
      function find(node:Node):Node|undefined {
        if (['BUTTON','SUMMARY'].includes(node.nodeName) && node.children?.some(child=>child.nodeValue===text)) return node
        for (const child of [...(node.children ?? []),...(node.shadowRoots ?? [])]) {
          const found = find(child)
          if (found) return found
        }
      }
      const match = find(root)
      if (!match) return false
      await client.send('DOM.scrollIntoViewIfNeeded',{nodeId:match.nodeId}).catch(()=>{})
      const {model} = await client.send('DOM.getBoxModel',{nodeId:match.nodeId}).catch(()=>({model:undefined}))
      if (!model) return false
      const [x1,y1,,,x2,y2] = model.content
      await page.mouse.click((x1+x2)/2,(y1+y2)/2)
      return true
    }).toBe(true)
  } finally { await client.detach() }
}

test('built extension fills, learns, reuses, updates, locks, and stops on disable',async()=>{
  const temp = await mkdtemp(join(tmpdir(),'autofill-e2e-'))
  const extension = join(temp,'extension')
  const profile = join(temp,'profile')
  let context:BrowserContext|undefined
  try {
    await cp(resolve('dist'),extension,{recursive:true})
    const manifestFile = join(extension,'manifest.json')
    const manifest = JSON.parse(await readFile(manifestFile,'utf8'))
    context = await launch(extension,profile)
    const id = await extensionId(context)
    const unauthorized = await context.newPage()
    await unauthorized.goto(fixture)
    await expect(unauthorized.getByLabel('Applicant Name')).toHaveValue('')
    await expect(unauthorized.locator('[data-autofill-ai]')).toHaveCount(0)
    await context.close()
    // Seed fixture-only grants through the temporary manifest. Keep the production build intact.
    await writeFile(manifestFile,JSON.stringify({...manifest,host_permissions:testHosts}))
    context = await launch(extension,profile)
    const options = await context.newPage()
    await options.goto(`chrome-extension://${id}/options.html`)
    await expect(options.getByRole('heading',{name:'Autofill',exact:true})).toBeVisible()
    await expect(options.getByRole('button',{name:'Demo',exact:true})).toHaveCount(0)
    await options.getByLabel('Vault password').fill(passphrase)
    await options.getByRole('button',{name:'Create vault'}).click()
    await expect(options.getByText('Autofill ready',{exact:true})).toBeVisible()
    for (const [key,value] of Object.entries({
      'Full name':'Ada Example','First name':'Ada','Last name':'Example','Email':'ada@example.test',
      Country:'India','Postal code':'411001','GitHub URL':'https://github.com/example','Résumé URL':'https://docs.example.test/resume','LinkedIn URL':'https://www.linkedin.com/in/example','Portfolio URL':'https://ada.example.test','X / Twitter profile URL':'https://x.com/example',
    })) await options.getByLabel(key,{exact:true}).fill(value)
    await options.getByRole('button',{name:'Save profile'}).click()
    await expect(options.getByText('Profile saved.')).toBeVisible()
    const privateView = await context.newPage()
    await privateView.goto(`chrome-extension://${id}/options.html`)
    await expect(privateView.getByLabel('Vault password')).toBeVisible()
    await expect(privateView.getByLabel('Full name',{exact:true})).toHaveCount(0)
    await privateView.goto(`chrome-extension://${id}/popup.html`)
    await expect(privateView.getByText('Autofill ready',{exact:true})).toBeVisible()
    await expect(privateView.getByLabel('Vault password')).toHaveCount(0)
    await privateView.close()
    await options.getByRole('button',{name:'Projects',exact:true}).click()
    await options.getByRole('button',{name:'Add project',exact:true}).click()
    await options.getByLabel('Project name',{exact:true}).fill('Notebook Sync')
    await options.getByLabel('Description',{exact:true}).fill('Built offline sync for field notes.')
    await options.getByLabel('Live demo URL',{exact:true}).fill('https://notebook.example.test')
    await options.getByRole('button',{name:'Add project',exact:true}).click()
    await options.getByLabel('Project name',{exact:true}).last().fill('Meal Planner')
    await options.getByLabel('Featured project').selectOption({label:'Notebook Sync'})
    await options.getByRole('button',{name:'Save projects'}).click()
    await expect(options.getByText('Projects saved.',{exact:true})).toBeVisible()

    await options.getByRole('button',{name:'Saved answers',exact:true}).click()
    await options.getByRole('button',{name:'Add custom field'}).click()
    await options.getByLabel('Question',{exact:true}).fill('Favorite beverage')
    await options.getByLabel('Answer',{exact:true}).fill('Coffee')
    await options.getByRole('button',{name:'Save answer',exact:true}).click()
    await expect(options.getByText('Answer saved.')).toBeVisible()
    await options.getByRole('button',{name:'Settings',exact:true}).click()

    const page = await context.newPage()
    await page.goto(fixture)
    await expect(page.getByLabel('Applicant Name')).toHaveValue('Ada Example')
    await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Notebook Sync')
    await expect(page.getByLabel('Portfolio or LinkedIn')).toHaveValue('https://ada.example.test')
    await expect(page.getByLabel('Resume',{exact:true})).toHaveValue('https://docs.example.test/resume')
    await expect(page.getByLabel('Anything we should know?')).toHaveValue('')
    await expect(page.getByLabel('Project description',{exact:true})).toHaveValue('Built offline sync for field notes.')
    await expect(page.getByLabel('Live project URL',{exact:true})).toHaveValue('https://notebook.example.test')
    await expect(page.getByLabel('Email Address')).toHaveValue('existing@example.test')
    await expect(page.getByLabel('Manager Email')).toHaveValue('')
    await expect(page.locator('#reference-email')).toHaveValue('')
    await expect(page.getByLabel('Password')).toHaveValue('')
    await expect(page.getByLabel('OTP')).toHaveValue('')
    await expect(page.locator('#hidden')).toHaveValue('')
    await expect(page.locator('#qualification')).toHaveValue('')
    await expect(page.getByLabel('Personal portfolio URL')).toHaveValue('https://ada.example.test')
    await expect(page.getByLabel('Country')).toHaveValue('IN')
    await expect(page.locator('#location-zip')).toHaveValue('411001')
    await expect(page.locator('#website-link')).toHaveValue('https://ada.example.test')
    await expect(page.locator('#ashby-github')).toHaveValue('https://github.com/example')
    await expect(page.locator('#ashby-linkedin')).toHaveValue('https://www.linkedin.com/in/example')
    await expect(page.locator('#twitter-link')).toHaveValue('https://x.com/example')
    await expect(page.locator('[data-autofill-ai]')).toHaveCount(0)
    await expect(page.getByLabel('Coffee')).toBeChecked()
    await expect(page.getByLabel('I agree to terms')).not.toBeChecked()
    await expect(page.locator('#react-state')).toHaveText('ada@example.test')
    await expect(page.frameLocator('iframe').getByLabel('Given name')).toHaveValue('Ada')
    await expect(page.getByLabel('Family name')).toHaveValue('Example')
    await page.getByRole('button',{name:'Open signup'}).click()
    const signup = page.locator('#signup-dialog')
    await expect(signup.getByLabel('Email *')).toHaveValue('ada@example.test')
    await expect(signup.getByLabel('LinkedIn URL (optional)')).toHaveValue('https://www.linkedin.com/in/example')
    await expect(signup.getByLabel('Name (optional)')).toHaveValue('')
    await signup.getByRole('button',{name:'Leave name'}).click()
    await expect(signup.getByLabel('Name (optional)')).toHaveValue('Ada Example')
    await expect(signup.getByLabel('I agree to the privacy policy')).not.toBeChecked()
    await page.keyboard.press('Escape')
    await page.getByRole('button',{name:'Next step'}).click()
    await expect(page.locator('#next input')).toHaveValue('Ada')
    await page.getByLabel('Applicant Name').fill('')
    await page.getByRole('button',{name:'Leave field'}).click()
    await expect(page.getByLabel('Applicant Name')).toHaveValue('')
    await page.getByRole('button',{name:'Replace name field'}).click()
    await expect(page.getByLabel('Applicant email')).toHaveValue('ada@example.test')
    await expect(page.getByLabel('Applicant Name')).toHaveValue('')

    await page.getByLabel('Password').fill('fixture password')
    await page.getByLabel('OTP').fill('123456')
    await page.getByRole('button',{name:'Leave field'}).click()
    await page.getByLabel('Favorite text editor').fill('Neovim')
    await page.getByRole('button',{name:'Leave field'}).click()
    await openAssistant(options,page)
    await assistantClick(page,'Why fields were skipped')
    await assistantClick(page,'Why fields were skipped')
    await assistantClick(page,'Capture entered details')
    await assistantClick(page,'Save answer')
    await options.getByRole('button',{name:'Saved answers',exact:true}).click()
    await expect(options.getByText('Neovim',{exact:true})).toBeVisible()
    await assistantClick(page,'Close')
    await expect(page.locator('[data-autofill-ai]')).toHaveCount(0)
    await options.getByRole('button',{name:'Settings',exact:true}).click()
    await options.getByLabel('Ask to save answers I enter').check()
    await page.reload()
    await expect(page.getByLabel('Favorite text editor')).toHaveValue('Neovim')
    await page.locator('#qualification').pressSequentially('Bachelor of Engineering')
    await page.getByRole('button',{name:'Leave field'}).click()
    await openAssistant(options,page)
    await assistantClick(page,'Review answers to save (1)')
    await assistantClick(page,'Save answer')
    await options.getByRole('button',{name:'Saved answers',exact:true}).click()
    await expect(options.getByText('Bachelor of Engineering',{exact:true})).toBeVisible()
    await page.goto(other)
    await expect(page.locator('#qualification')).toHaveValue('Bachelor of Engineering')
    await page.locator('#qualification').fill('Master of Engineering')
    await page.getByRole('button',{name:'Leave field'}).click()
    await openAssistant(options,page)
    await assistantClick(page,'Review answers to save (1)')
    await assistantClick(page,'Update answer')
    await expect(options.getByText('Master of Engineering',{exact:true})).toBeVisible()
    await page.goto(fixture)
    await expect(page.locator('#qualification')).toHaveValue('Master of Engineering')
    await expect(page.locator('body')).not.toHaveAttribute('data-submitted','true')

    await options.getByRole('button',{name:'Hide saved details',exact:true}).click()
    await expect(options.getByLabel('Vault password')).toBeVisible()
    await expect(options.getByText('Autofill ready',{exact:true})).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Applicant Name')).toHaveValue('Ada Example')
    await page.getByLabel('Favorite text editor').fill('Helix')
    await page.getByRole('button',{name:'Leave field'}).click()
    await openAssistant(options,page)
    await assistantClick(page,'Capture entered details')
    await assistantClick(page,'Update answer')
    await expect(options.getByLabel('Vault password')).toBeVisible()
    await options.getByLabel('Vault password').fill(passphrase)
    await options.getByRole('button',{name:'Unlock vault'}).click()
    await expect(options.getByText('Helix',{exact:true})).toBeVisible()
    await options.getByRole('button',{name:'Settings',exact:true}).click()
    await options.getByLabel('Fill forms automatically').uncheck()
    await page.reload()
    await openAssistant(options,page)
    await expect(page.getByLabel('Applicant Name')).toHaveValue('')
    await assistantClick(page,'Fill remaining')
    await expect(page.getByLabel('Applicant Name')).toHaveValue('Ada Example')
    await options.getByLabel('Fill forms automatically').check()
    await options.getByLabel('Enable extension').uncheck()
    await expect(page.locator('[data-autofill-ai]')).toHaveCount(0)
    await page.reload()
    await expect(page.getByLabel('Applicant Name')).toHaveValue('')
    await options.getByLabel('Enable extension').check()
    await expect(page.getByLabel('Applicant Name')).toHaveValue('Ada Example')

    // Restart with optional permissions only. Chromium keeps grants from the previous version.
    await context.close()
    await writeFile(manifestFile,JSON.stringify({...manifest,version:'1.0.2'}))
    context = await launch(extension,profile)
    const reopened = await context.newPage()
    await reopened.goto(`chrome-extension://${id}/options.html`)
    const grant = reopened.getByText('http://127.0.0.1/*',{exact:true}).locator('..')
    const afterRestart = await context.newPage()
    await reopened.getByLabel('Vault password').fill(passphrase)
    await reopened.getByRole('button',{name:'Unlock vault'}).click()
    await reopened.getByRole('button',{name:'Websites',exact:true}).click()
    await expect(grant).toBeVisible()
    await afterRestart.goto(fixture)
    await expect(afterRestart.getByLabel('Applicant Name')).toHaveValue('Ada Example')
    await grant.getByRole('button',{name:'Revoke'}).click()
    await expect(grant).toHaveCount(0)
    await expect(afterRestart.locator('[data-autofill-ai]')).toHaveCount(0)
    await afterRestart.reload()
    await expect(afterRestart.getByLabel('Applicant Name')).toHaveValue('')
  } finally {
    await context?.close()
    await rm(temp,{recursive:true,force:true})
  }
})
