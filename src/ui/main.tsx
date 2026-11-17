import { useEffect,useState,type FormEvent,type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { dictionary } from '../matching/engine'
import { originPattern,send,siteOf,type Page,type State } from '../messages'
import { type Answer,type Education,type ProfileData,type Project,type Settings } from '../storage/schema'
import './style.css'

const popup = location.pathname.endsWith('popup.html')
const allSites = ['http://*/*','https://*/*']
const tabs = ['Profile','Projects','Saved answers','Websites','Settings']
const labels:Record<string,string> = {
  fullName:'Full name',firstName:'First name',middleName:'Middle name',lastName:'Last name',countryCode:'Phone country code',
  postalCode:'Postal code',highestQualification:'Highest qualification',gpa:'GPA or CGPA',role:'Current role',
  resumeUrl:'Résumé URL',school:'School name',college:'College or university name',xUrl:'X / Twitter profile URL',websiteUrl:'Personal website URL',otherUrl:'Other website URL',githubUrl:'GitHub URL',linkedinUrl:'LinkedIn URL',portfolioUrl:'Portfolio URL',experience:'Years of experience',
}
const display = (key:string) => labels[key] ?? key[0].toUpperCase()+key.slice(1)
function Card({title,children}:{title:string;children:ReactNode}) {
  return <section className="card"><h2>{title}</h2>{children}</section>
}
function App() {
  const [state,setState] = useState<State>(), [tab,setTab] = useState(chromeInitialTab)
  const [site,setSite] = useState(''), [tabId,setTabId] = useState<number>()
  const [grants,setGrants] = useState<string[]>([]), [allowed,setAllowed] = useState<boolean>()
  const [page,setPage] = useState<Page>(), [message,setMessage] = useState(''), [busy,setBusy] = useState(false)
  const [newField,setNewField] = useState(false)
  const [pass,setPass] = useState(''), [website,setWebsite] = useState('')
  function chromeInitialTab() { return tabs.find(item=>item.toLowerCase().replace(' ','-')===location.hash.slice(1)) ?? 'Profile' }
  async function refresh() {
    const [next,permissions] = await Promise.all([send<State>({type:'STATE'}),chrome.permissions.getAll()])
    setState(next)
    setGrants(permissions.origins ?? [])
    return next
  }
  useEffect(()=>{
    void refresh().catch(error=>setMessage(error.message))
    const update = () => {void refresh().catch(()=>{})}
    chrome.storage.onChanged.addListener(update)
    chrome.permissions.onAdded.addListener(update)
    chrome.permissions.onRemoved.addListener(update)
    if (popup) void chrome.tabs.query({active:true,currentWindow:true}).then(([current])=>{
      setSite(siteOf(current?.url)); setTabId(current?.id)
    })
    return ()=>{
      chrome.storage.onChanged.removeListener(update)
      chrome.permissions.onAdded.removeListener(update)
      chrome.permissions.onRemoved.removeListener(update)
    }
  },[])
  useEffect(()=>{
    let disposed = false
    if (!site) return
    void chrome.permissions.contains({origins:[originPattern(site)]}).then(async granted=>{
      if (disposed) return
      setAllowed(granted)
      if (!granted || tabId===undefined) {setPage(undefined);return}
      const result = await send<Page>({type:'PAGE',tabId,fill:false}).catch(()=>undefined)
      if (!disposed) setPage(result)
    })
    return ()=>{disposed=true}
  },[site,tabId,grants.join('|'),state?.unlocked,state?.settings.enabled,state?.settings.blocked.join('|')])
  async function act(action:()=>Promise<unknown>,success='') {
    setBusy(true);setMessage('')
    try {const result=await action(); await refresh();setMessage(typeof result==='string'?result:success)}
    catch (error) {setMessage(error instanceof Error?error.message:'The action failed.')}
    finally {setBusy(false)}
  }
  async function grant(origins:string[]) {
    const missing = origins.filter(pattern=>!grants.includes(pattern) &&
      !grants.includes(pattern.startsWith('https:') ? allSites[1] : allSites[0]) &&
      !grants.includes('*://*/*') && !grants.includes('<all_urls>'))
    if (!missing.length) return
    if (!(await chrome.permissions.request({origins:missing}))) throw new Error('Website access was declined.')
    await send({type:'SYNC'})
  }
  function grantWebsite(event:FormEvent) {
    event.preventDefault()
    const url = siteOf(website.includes('://') ? website : `https://${website}`)
    if (!url) {setMessage('Enter an HTTP or HTTPS website.');return}
    void act(()=>grant([originPattern(url)]),'Website access granted.')
  }
  const settings = state?.settings
  const blocked = settings?.blocked.includes(site)
  const browse = (target:string) => chrome.tabs.create({url:chrome.runtime.getURL(`options.html#${target.toLowerCase().replace(' ','-')}`)})
  const toggle = <K extends keyof Settings>(key:K,value:Settings[K])=>{
    setState(previous=>previous && {...previous,settings:{...previous.settings,[key]:value}})
    void send({type:'SETTINGS',settings:{[key]:value}}).catch(error=>{
      setMessage(error.message)
      void refresh().catch(()=>{})
    })
  }
  const unlock = <form className="stack" onSubmit={event=>{
    event.preventDefault()
    void act(async()=>{await send({type:'UNLOCK',passphrase:pass});setPass('')},state?.exists?'Vault unlocked.':'Vault created.')
  }}>
    <label>Vault password<input type="password" autoComplete={state?.exists?'current-password':'new-password'} minLength={12} maxLength={1024} required value={pass} onChange={event=>setPass(event.target.value)}/></label>
    {!state?.exists && <small>Use at least 12 characters. Save it somewhere safe.</small>}
    <button className="primary" disabled={busy}>{state?.exists?'Unlock vault':'Create vault'}</button>
  </form>

  return <main className={popup?'popup':'dashboard'}>
    <header className="brand"><div className="glyph" aria-hidden="true">↗</div><div><h1>Autofill</h1></div></header>
    {!state && !message && <p role="status">Loading extension…</p>}
    {state && <>
      <div className="statusline"><span>{settings?.enabled?'Enabled':'Disabled'}</span><span>{state.unlocked?'Vault unlocked':'Vault locked'}</span>
        {state.unlocked && <button className="quiet" onClick={()=>void act(()=>send({type:'LOCK'}))}>Lock</button>}</div>
      {popup ? <>
        <Card title={site ? new URL(site).host : 'Current website'}>
          <p>{!site?'Website access unavailable':blocked?'Blocked':allowed===undefined?'Checking access…':allowed?'Allowed':'Permission required'}</p>
          {allowed && !blocked && settings?.enabled && <small>{settings.auto ?
            'Fills matching fields automatically.' : 'Choose Fill once whenever you want to fill a page.'}</small>}
          {page && <div className="metrics"><span><b>{page.detected}</b> Detected</span><span><b>{page.filled}</b> Filled</span><span><b>{page.empty}</b> Empty</span></div>}
          <p>{state.unlocked ? `${state.profileCount ?? 0} profile fields · ${state.answerCount ?? 0} saved answers` : state.exists ? 'Open Manage information to unlock Autofill.' : 'Open Manage information to set up Autofill.'}</p>
          <div className="actions">
            {site && allowed===false && <button className="primary" disabled={busy} onClick={()=>void act(()=>grant([originPattern(site)]),'Website access granted.')}>Allow this site</button>}
            {site && allowed && <button onClick={()=>void act(()=>send({type:'SITE',site,mode:blocked?'allow':'block'}))}>{blocked?'Enable on this site':'Disable on this site'}</button>}
            {allowed && !blocked && state.unlocked && settings?.enabled && tabId!==undefined && <button className="primary" onClick={()=>void act(async()=>{
              const result = await send<Page>({type:'PAGE',tabId,fill:true})
              setPage(result)
              return result.filled > (page?.filled ?? 0) ? 'Filled matching fields.' :
                result.review ? 'Open the page assistant to review suggested answers.' :
                result.empty ? 'No saved details matched the empty fields. Check your profile.' : 'The detected fields already have values.'
            })}>{settings.auto ? 'Fill this page' : 'Fill once'}</button>}
            {allowed && !blocked && state.unlocked && settings?.enabled && tabId!==undefined &&
              <button onClick={()=>void act(async()=>{
                await send<Page>({type:'PAGE',tabId,fill:false,openAssistant:true})
                window.close()
              })}>Open page assistant</button>}
          </div>
        </Card>
        <div className="actions"><button onClick={()=>void browse('Profile')}>Manage information</button><button onClick={()=>void browse('Saved answers')}>Saved answers</button><button onClick={()=>void browse('Settings')}>Settings</button></div>
      </> : <>
        <nav aria-label="Dashboard" className="tabs">{tabs.map(item=><button key={item} aria-current={tab===item?'page':undefined} onClick={()=>{setMessage('');setTab(item)}}>{item}</button>)}</nav>
        {!state.data && ['Profile','Projects','Saved answers'].includes(tab) && <Card title={state.exists?'Unlock your details':'Set up Autofill'}>
          <p>{state.exists?'Enter your vault password to view or change your saved details.':'Create a password to protect the details you save.'}</p>{unlock}
        </Card>}
        {tab==='Profile' && state.data && <>
          <div className="section-intro"><div><h2>Your profile</h2><p>Details you can reuse across forms.</p></div>
            <button onClick={()=>{setNewField(true);setTab('Saved answers')}}>＋ Add custom field</button></div>
          <Profile profile={state.data.profile} education={state.data.education} act={act}/>
        </>}
        {tab==='Projects' && state.data && <Projects saved={state.data.projects} act={act}/>}
        {tab==='Saved answers' && state.data && <Answers answers={state.data.answers} act={act} startNew={newField} resetNew={()=>setNewField(false)}/>}
        {tab==='Websites' && <Card title="Website access">
          <p>Allow the websites you use. Access stays on until you revoke it.</p>
          <form className="actions" onSubmit={grantWebsite}><label>Website<input value={website} onChange={event=>setWebsite(event.target.value)} placeholder="example.com" required/></label><button className="primary">Grant website access</button></form>
          <button onClick={()=>void act(()=>grant(allSites),'All supported websites granted.')}>Allow all supported websites</button>
          <h3>Granted hosts</h3>
          {grants.length===0 && <p>No hosts granted.</p>}
          {grants.map(pattern=><div className="record" key={pattern}><span>{pattern}</span><button onClick={()=>void act(async()=>{await chrome.permissions.remove({origins:[pattern]});await send({type:'SYNC'})})}>Revoke</button></div>)}
          <h3>Blocked websites</h3>
          {settings?.blocked.map(item=><div className="record" key={item}><span>{item}</span><button onClick={()=>void act(()=>send({type:'SITE',site:item,mode:'allow'}))}>Unblock</button></div>)}
          <form className="actions" onSubmit={event=>{
            event.preventDefault()
            const form = new FormData(event.currentTarget), item = siteOf(String(form.get('blocked')))
            if (item) void act(()=>send({type:'SITE',site:item,mode:'block'}))
            else setMessage('Enter a valid HTTP or HTTPS website.')
          }}><label>Block an origin<input name="blocked" type="url" placeholder="https://example.com" required/></label><button>Block website</button></form>
          {!!settings?.noLearn.length && <><h3>Learning exclusions</h3>{settings.noLearn.map(item=><div className="record" key={item}><span>{item}</span><button onClick={()=>toggle('noLearn',settings.noLearn.filter(site=>site!==item))}>Restore learning</button></div>)}</>}
        </Card>}
        {tab==='Settings' && settings && <>
          <Card title="Form settings">
            <p>Turn off automatic filling to approve each fill from the toolbar.</p>
            {([['enabled','Enable extension'],['auto','Fill forms automatically'],['learn','Ask to save answers I enter'],['suggest','Suggest answers']] as const).map(([key,label])=>
              <label className="record" key={key}>{label}<input type="checkbox" checked={settings[key]} onChange={event=>toggle(key,event.target.checked)}/></label>)}
          </Card>
          <section className="card"><details><summary>Backups and data</summary>
            {!state.data && <button onClick={()=>setTab('Profile')}>Unlock saved details</button>}
            <p>Backups contain your saved details. Restoring a backup replaces your current profile and answers.</p>
            <div className="actions">
              <button disabled={!state.data} onClick={()=>{
                const url = URL.createObjectURL(new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'}))
                const link=document.createElement('a');link.href=url;link.download='autofill-ai-v1.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
              }}>Download backup</button>
              <label>Restore backup<input type="file" accept=".json,application/json" disabled={!state.data} onChange={event=>{
                const file=event.target.files?.[0];event.target.value=''
                if (file && confirm('Replace the current profile and saved answers?')) void act(async()=>{
                  if (file.size>7_000_000) throw new Error('The import is too large.')
                  await send({type:'IMPORT',data:JSON.parse(await file.text()) as unknown})
                },'Data imported.')
              }}/></label>
              <button className="danger" disabled={!state.data} onClick={()=>{if (confirm('Permanently delete your local vault and settings?')) void act(()=>send({type:'CLEAR'}),'Local information deleted.')}}>Clear saved information</button>
            </div>
          </details></section>
        </>}
      </>}
    </>}
    {message && <p className="notice" role="status">{message}</p>}
  </main>
}

type Act = (action:()=>Promise<unknown>,success?:string)=>Promise<void>
function Profile({profile,education,act}:{profile:Record<string,string>;education:Education[];act:Act}) {
  const [draft,setDraft]=useState(profile)
  const [entries,setEntries]=useState(education)
  useEffect(()=>setDraft(profile),[JSON.stringify(profile)])
  useEffect(()=>setEntries(education),[JSON.stringify(education)])
  return <form className="stack" onSubmit={event=>{
    event.preventDefault()
    void act(()=>send({type:'PROFILE',profile:draft,education:entries}),'Profile saved.')
  }}>
    {['personal','education','professional','links'].map(group=><Card key={group} title={{personal:'Personal details',education:'Education',professional:'Work details',links:'Websites and social links'}[group]!}>
      <div className="grid">{Object.keys(dictionary).filter(key=>group==='links' ? key.startsWith('professional.') && key.endsWith('Url') : key.startsWith(group+'.') && !key.endsWith('Url') && key!=='professional.portfolioOrLinkedin').map(key=><label key={key}>{display(key.split('.')[1])}
        <input type={key.endsWith('Url')?'url':key==='personal.email'?'email':'text'} placeholder={key.endsWith('Url')?'https://…':undefined} value={draft[key] ?? ''} maxLength={4000} onChange={event=>setDraft({...draft,[key]:event.target.value})}/>
      </label>)}</div></Card>)}
    <Card title="Additional education">
      <p>Additional entries are offered for review when a field could refer to more than one qualification.</p>
      {entries.map((item,index)=><fieldset className="editor" key={item.id}>
        <legend>Education entry {index+1}</legend>
        <div className="grid">{(['college','degree','specialization','graduationYear','gpa'] as const).map(key=>
          <label key={key}>{display(key)}<input maxLength={500} value={item[key]} onChange={event=>{
            const value=event.target.value
            setEntries(entries.map(entry=>entry.id===item.id?{...entry,[key]:value}:entry))
          }}/></label>)}</div>
        <button type="button" onClick={()=>setEntries(entries.filter(entry=>entry.id!==item.id))}>Remove entry</button>
      </fieldset>)}
      <button type="button" disabled={entries.length>=30} onClick={()=>setEntries([...entries,{id:crypto.randomUUID(),college:'',degree:'',specialization:'',graduationYear:'',gpa:''}])}>Add education entry</button>
    </Card>
    <div className="save-bar"><button className="primary">Save profile</button></div>
  </form>
}
function Projects({saved,act}:{saved:ProfileData['projects'];act:Act}) {
  const [draft,setDraft] = useState(saved)
  useEffect(()=>setDraft(saved),[JSON.stringify(saved)])
  const update = (id:string,key:Exclude<keyof Project,'id'>,value:string) =>
    setDraft(previous=>({...previous,entries:previous.entries.map(project=>project.id===id ? {...project,[key]:value} : project)}))
  return <Card title="Projects">
    <p>Save projects you’re proud of. Pick a featured project to fill clearly labeled project fields automatically.</p>
    <form className="stack" onSubmit={event=>{
      event.preventDefault()
      void act(()=>send({type:'PROJECTS',projects:draft}),'Projects saved.')
    }}>
      {draft.entries.length>0 && <label>Featured project
        <select value={draft.featured ?? ''} onChange={event=>setDraft({...draft,featured:event.target.value || null})}>
          <option value="">Choose when filling a form</option>
          {draft.entries.map((project,index)=><option key={project.id} value={project.id}>{project.name.trim() || `Project ${index+1}`}</option>)}
        </select>
      </label>}
      {draft.entries.map((project,index)=><fieldset className="editor stack" key={project.id}>
        <legend>{project.name.trim() || `Project ${index+1}`}</legend>
        <div className="grid">
          <label>Project name<input required maxLength={500} value={project.name} onChange={event=>update(project.id,'name',event.target.value)}/></label>
          <label>Your role<input maxLength={500} value={project.role} onChange={event=>update(project.id,'role',event.target.value)}/></label>
          <label>Technologies<input maxLength={500} placeholder="React, Python, PostgreSQL" value={project.technologies} onChange={event=>update(project.id,'technologies',event.target.value)}/></label>
          <label>Repository URL<input type="url" maxLength={500} value={project.repositoryUrl} onChange={event=>update(project.id,'repositoryUrl',event.target.value)}/></label>
          <label>Live demo URL<input type="url" maxLength={500} value={project.demoUrl} onChange={event=>update(project.id,'demoUrl',event.target.value)}/></label>
        </div>
        <label>Description<textarea rows={3} maxLength={4000} value={project.description} onChange={event=>update(project.id,'description',event.target.value)}/></label>
        <label>Results or impact<textarea rows={2} maxLength={4000} value={project.impact} onChange={event=>update(project.id,'impact',event.target.value)}/></label>
        <div><button type="button" onClick={()=>setDraft({
          entries:draft.entries.filter(entry=>entry.id!==project.id),featured:draft.featured===project.id ? null : draft.featured,
        })}>Remove project</button></div>
      </fieldset>)}
      <div className="actions">
        <button type="button" disabled={draft.entries.length>=20} onClick={()=>setDraft({
          ...draft,entries:[...draft.entries,{id:crypto.randomUUID(),name:'',description:'',role:'',technologies:'',impact:'',repositoryUrl:'',demoUrl:''}],
        })}>Add project</button>
        <button className="primary">Save projects</button>
      </div>
    </form>
  </Card>
}
function blank():Answer {
  const now=new Date().toISOString()
  return {id:crypto.randomUUID(),question:'',value:'',aliases:[],excluded:[],scope:'',context:'',category:'Custom',source:'',createdAt:now,updatedAt:now,autofill:true}
}
function Answers({answers,act,startNew,resetNew}:{answers:Answer[];act:Act;startNew:boolean;resetNew:()=>void}) {
  const [search,setSearch]=useState(''),[draft,setDraft]=useState<Answer|undefined>(()=>startNew?blank():undefined)
  useEffect(()=>{if (startNew) resetNew()},[startNew])
  const list=(text:string)=>text.split('\n').map(item=>item.trim()).filter(Boolean)
  return <Card title="Saved answers and custom fields">
    <div className="actions"><label>Search saved answers<input type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label><button className="primary" onClick={()=>setDraft(blank())}>Add custom field</button></div>
    {draft && <form className="stack editor" onSubmit={event=>{
      event.preventDefault()
      const form=new FormData(event.currentTarget)
      const get=(key:string)=>String(form.get(key)??'').trim()
      const next:Answer={...draft,question:get('question'),value:get('value'),category:get('category'),scope:get('scope'),aliases:list(get('aliases')),excluded:list(get('excluded')),autofill:form.has('autofill'),updatedAt:new Date().toISOString()}
      void act(async()=>{await send({type:'ANSWER',answer:next});setDraft(undefined)},'Answer saved.')
    }} key={draft.id}>
      <label>Question<input name="question" defaultValue={draft.question} maxLength={500} required/></label>
      <label>Answer<textarea name="value" defaultValue={draft.value} maxLength={4000} required/></label>
      <div className="grid"><label>Category<input name="category" defaultValue={draft.category} maxLength={500}/></label>
      <label>Website scope (blank for global)<input name="scope" type="url" defaultValue={draft.scope} placeholder="https://example.com"/></label></div>
      <label>Equivalent questions, one per line<textarea name="aliases" defaultValue={draft.aliases.join('\n')}/></label>
      <label>Different questions to exclude, one per line<textarea name="excluded" defaultValue={draft.excluded.join('\n')}/></label>
      <label className="record">Allow automatic reuse<input name="autofill" type="checkbox" defaultChecked={draft.autofill}/></label>
      <div className="actions"><button className="primary">Save answer</button><button type="button" onClick={()=>setDraft(undefined)}>Cancel</button></div>
    </form>}
    {!answers.length && !draft && <div className="empty-state"><strong>No saved answers yet</strong><p>Add a custom field here, or choose Open page assistant from the toolbar on a form.</p></div>}
    {answers.filter(answer=>[answer.question,answer.value,answer.category,...answer.aliases].some(value=>value.toLowerCase().includes(search.toLowerCase()))).map(answer=>
      <article className="record answer" key={answer.id}><div><h3>{answer.question}</h3><p>{answer.value}</p><small>{answer.category} · {answer.scope || 'Global'} · {answer.source || 'Manual'} · {new Date(answer.createdAt).toLocaleDateString()}</small></div>
      <div className="actions"><button onClick={()=>setDraft(answer)}>Edit</button><button onClick={()=>void act(()=>send({type:'DELETE',id:answer.id}),'Answer deleted.')}>Delete</button></div></article>)}
  </Card>
}
createRoot(document.getElementById('root')!).render(<App/>)
