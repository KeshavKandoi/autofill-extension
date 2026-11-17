import { blocked, classify, contextual, evidence, privateMessage, questionKey, rank } from '../matching/engine'
import { command, originPattern, siteOf, type Command } from '../messages'
import { candidates, defaults, emptyData, migrate, settingsSchema, type Answer, type ProfileData } from '../storage/schema'
import { derive, newSalt, open, seal, vaultSchema } from '../storage/vault'

const trustedStorage = Promise.all([
  chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),
  chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}),
])
const pools = new WeakMap<ProfileData,ReturnType<typeof candidates>>()
let cached: {raw:string; data:ProfileData}|undefined
async function settings() {
  const saved = (await chrome.storage.local.get('settings')).settings
  return settingsSchema.catch(defaults).parse(saved)
}
async function vault() {
  const stored = (await chrome.storage.local.get('vault')).vault
  return stored === undefined ? undefined : vaultSchema.parse(stored)
}
async function unlocked() {
  const {raw} = await chrome.storage.session.get('raw')
  if (typeof raw !== 'string') return undefined
  if (cached?.raw === raw) return cached
  const stored = await vault()
  if (stored) return cached = {raw,data:await open(stored,raw)}
}
async function write(data:ProfileData) {
  const session = await unlocked(), stored = await vault()
  if (!session || !stored) throw new Error('Unlock the vault first.')
  const validated = migrate(data)
  await chrome.storage.local.set({vault:await seal(validated,session.raw,stored.salt)})
  cached = {raw:session.raw,data:validated}
}
const registration = 'autofill-authorized'
async function sync() {
  const {origins=[]} = await chrome.permissions.getAll()
  const current = await chrome.scripting.getRegisteredContentScripts({ids:[registration]})
  if (!origins.length) {
    if (current.length) await chrome.scripting.unregisterContentScripts({ids:[registration]})
    return
  }
  const definition:chrome.scripting.RegisteredContentScript = {
    id:registration,matches:origins,js:['content.js'],runAt:'document_idle',allFrames:true,persistAcrossSessions:true,
  }
  if (current.length) await chrome.scripting.updateContentScripts([definition])
  else await chrome.scripting.registerContentScripts([definition])
}
let tail:Promise<unknown> = Promise.resolve()
function ordered<T>(operation:()=>Promise<T>) {
  const next = tail.then(operation)
  tail = next.catch(()=>{})
  return next
}
async function refreshPages() {
  const tabs = await chrome.tabs.query({})
  await Promise.allSettled(tabs.flatMap(tab=>tab.id === undefined ? [] : [
    chrome.tabs.sendMessage(tab.id,{type:'CONTENT_REFRESH'}),
  ]))
}
function reconcile() { void ordered(sync).catch(console.error).finally(refreshPages) }
chrome.storage.onChanged.addListener(changes=>{
  if (changes.settings || changes.vault || changes.raw) void refreshPages()
})
chrome.permissions.onAdded.addListener(reconcile)
chrome.permissions.onRemoved.addListener(reconcile)
chrome.runtime.onStartup.addListener(reconcile)
chrome.runtime.onInstalled.addListener(details=>{
  reconcile()
  if (details.reason === 'install') void chrome.runtime.openOptionsPage()
})
async function authorized(site:string) {
  return Boolean(site) && await chrome.permissions.contains({origins:[originPattern(site)]})
}
async function route(message:Command,sender:chrome.runtime.MessageSender) {
  await trustedStorage
  const source = sender.url?.split(/[?#]/)[0]
  const dashboard = source===chrome.runtime.getURL('options.html')
  const ownPage = dashboard || source===chrome.runtime.getURL('popup.html')
  const site = siteOf(sender.url)
  const topSite = siteOf(sender.tab?.url)
  const fromContent = sender.tab?.id !== undefined && await authorized(site) && await authorized(topSite || (sender.frameId===0 ? site : ''))
  if (!ownPage && (!fromContent || !['MATCH','LEARN','SITE'].includes(message.type))) throw new Error('Website access is unavailable.')
  const prefs = await settings()
  const active = Boolean(fromContent && prefs.enabled && !prefs.blocked.includes(site) && !prefs.blocked.includes(topSite))
  const session = await unlocked()
  const detailsOpen = Boolean(session && dashboard && sender.documentId &&
    (await chrome.storage.session.get('detailsDocument')).detailsDocument === sender.documentId)
  if (['PROFILE','IMPORT','ANSWER','DELETE','CLEAR'].includes(message.type) && !detailsOpen) {
    throw new Error('Enter your vault password to manage saved details.')
  }
  switch (message.type) {
    case 'STATE': return {
      settings:prefs,exists:Boolean(await vault()),unlocked:Boolean(session),
      data:detailsOpen ? session?.data : undefined,
      profileCount:session ? Object.values(session.data.profile).filter(value=>value.trim()).length : undefined,
      answerCount:session?.data.answers.length,
    }
    case 'SYNC': return sync()
    case 'LOCK':
      await chrome.storage.session.remove(['raw','detailsDocument'])
      cached = undefined
      return
    case 'CLEAR':
      await chrome.storage.session.remove(['raw','detailsDocument'])
      await chrome.storage.local.remove(['vault','settings'])
      cached = undefined
      return
    case 'UNLOCK': {
      if (!dashboard || !sender.documentId) throw new Error('Open Manage information to unlock your vault.')
      const stored = await vault(), salt = stored?.salt ?? newSalt()
      const raw = await derive(message.passphrase,salt)
      let data:ProfileData
      try { data = stored ? await open(stored,raw) : emptyData }
      catch { throw new Error('That password did not unlock the vault.') }
      if (!stored) await chrome.storage.local.set({vault:await seal(data,raw,salt)})
      await chrome.storage.session.set({raw,detailsDocument:sender.documentId})
      cached = {raw,data}
      return
    }
    case 'SETTINGS': await chrome.storage.local.set({settings:settingsSchema.parse({...prefs,...message.settings})}); return
    case 'SITE': {
      const target = ownPage ? message.site : site
      if (!target || (!ownPage && !active)) throw new Error('Website access is unavailable.')
      const key = message.mode === 'noLearn' ? 'noLearn' : 'blocked'
      const next = new Set(prefs[key])
      if (message.mode === 'allow') next.delete(target)
      else next.add(target)
      await chrome.storage.local.set({settings:settingsSchema.parse({...prefs,[key]:[...next]})})
      return
    }
    case 'PAGE': {
      const tab = await chrome.tabs.get(message.tabId)
      if (!(await authorized(siteOf(tab.url)))) throw new Error('Grant website access first.')
      const action = {type:'CONTENT_PAGE',fill:message.fill,openAssistant:message.openAssistant}
      try { return await chrome.tabs.sendMessage(message.tabId,action,{frameId:0}) }
      catch {
        const inject = {files:['content.js']}
        await chrome.scripting.executeScript({...inject,target:{tabId:message.tabId,allFrames:true}}).catch(()=>
          chrome.scripting.executeScript({...inject,target:{tabId:message.tabId,frameIds:[0]}}))
        return chrome.tabs.sendMessage(message.tabId,action,{frameId:0})
      }
    }
    case 'MATCH': {
      const responses = Object.create(null) as Record<string,ReturnType<typeof rank>>
      if (active && session) {
        let pool = pools.get(session.data)
        if (!pool) {
          pool = candidates(session.data)
          pools.set(session.data,pool)
        }
        for (const field of message.fields) {
          responses[field.id] = rank(field,pool,site).flatMap(match=>{
            if (match.action === 'autofill' && (prefs.auto || message.explicit)) return [match]
            return prefs.suggest ? [{...match,action:'suggest' as const}] : []
          })
        }
      }
      return {active,capture:active && Boolean(session) && !prefs.noLearn.includes(site),learn:active && Boolean(session) && prefs.learn && !prefs.noLearn.includes(site),matches:responses}
    }
    default: break
  }
  if (!session) throw new Error('Unlock the vault first.')
  const {data} = session
  switch (message.type) {
    case 'PROFILE': return write({...data,profile:message.profile,education:message.education})
    case 'IMPORT': return write(migrate(message.data))
    case 'DELETE': return write({...data,answers:data.answers.filter(answer=>answer.id!==message.id)})
    case 'ANSWER': {
      const {answer} = message
      const duplicate = data.answers.some(item=>item.id!==answer.id && item.scope===answer.scope &&
        item.value===answer.value && questionKey(item.question)===questionKey(answer.question))
      if (duplicate) throw new Error('This answer already exists for that question and scope.')
      return write({...data,answers:[...data.answers.filter(item=>item.id!==answer.id),answer]})
    }
    case 'LEARN': {
      const {field,value} = message
      const text = evidence(field)
      if (!active || (!prefs.learn && !message.manual) || prefs.noLearn.includes(site) || !field.label || blocked(field) ||
          privateMessage.test(text) || /\b(consent|terms|agree|certify)\b/.test(text) ||
          ['editable','textarea','checkbox','combobox','date'].includes(field.type) || value.length > 500) return {eligible:false}
      const key = classify(field)?.key
      const contextualAnswer = contextual.test(text)
      const question = questionKey(field.label)
      const related = data.answers.filter(answer=>(!answer.scope || answer.scope===site) &&
        ((key && answer.key === key) || [answer.question,...answer.aliases].some(label=>questionKey(label)===question)))
      if ((!contextualAnswer && key && data.profile[key] === value) || related.some(answer=>answer.value===value)) return {eligible:false}
      const profileFact = !contextualAnswer && key && data.profile[key] ? key : undefined
      if (message.mode === 'check') return {eligible:true,existing:related[0]?.id ?? profileFact}
      const previous = message.mode === 'update' ? related.find(answer=>answer.id===message.existing) : undefined
      if (message.mode === 'update' && !previous && !(profileFact && message.existing===profileFact)) throw new Error('The saved answer changed. Review it again.')
      const now = new Date().toISOString()
      const answer:Answer = {
        id:previous?.id ?? crypto.randomUUID(),key,question:previous?.question ?? field.label,value,
        aliases:previous ? [...new Set([...previous.aliases,field.label])].filter(label=>label!==previous.question).slice(0,40) : [],
        excluded:previous?.excluded ?? [],source:previous?.source ?? site,
        scope:contextualAnswer || (message.mode==='new' && (related.length || profileFact)) ? site : previous?.scope ?? '',
        category:previous?.category ?? key?.split('.')[0] ?? 'Learned',context:field.context,
        autofill:!contextualAnswer && (previous?.autofill ?? true),createdAt:previous?.createdAt ?? now,updatedAt:now,
      }
      if (message.mode==='update' && key && Object.hasOwn(data.profile,key) && !contextualAnswer) {
        return write({...data,profile:{...data.profile,[key]:value},answers:[...data.answers.filter(item=>item.id!==answer.id),answer]})
      }
      return write({...data,answers:[...data.answers.filter(item=>item.id!==answer.id),answer]})
    }
  }
}
chrome.runtime.onMessage.addListener((input:unknown,sender,reply)=>{
  const parsed = command.safeParse(input)
  if (!parsed.success || sender.id !== chrome.runtime.id) return false
  if (parsed.data.type === 'PAGE') {
    void route(parsed.data,sender).then(data=>reply({ok:true,data}),()=>reply({ok:false,error:'This page is unavailable or access was revoked.'}))
    return true
  }
  void ordered(()=>route(parsed.data,sender)).then(data=>reply({ok:true,data}),error=>{
    reply({ok:false,error:error instanceof Error ? error.message : 'Operation failed.'})
  })
  return true
})
