import { send, type LearnResponse, type MatchResponse, type Page, type Suggestion } from '../messages'
import { blocked, evidence, privateMessage, type Ranked } from '../matching/engine'
import { button, createAssistant, paragraph } from './assistant'
import { current, editable, extract, fill, isEmpty, selector, type Control } from './fields'

const marker = globalThis as typeof globalThis & { autoFillStarted?:boolean }
if (!marker.autoFillStarted) {
  marker.autoFillStarted = true
  document.querySelectorAll('div[data-autofill-ai]').forEach(host=>host.remove())
  start()
}

function start() {
  const controls = new Map<HTMLElement,Control>()
  const ids = new WeakMap<HTMLElement,string>()
  const touched = new WeakSet<HTMLElement>()
  const touchedNames = new WeakMap<Document|ShadowRoot|HTMLFormElement,Set<string>>()
  const filled = new Set<HTMLElement>()
  const submitted = new WeakMap<HTMLElement,string>()
  const observed = new Map<Document|ShadowRoot,MutationObserver>()
  const changes = new Set<ParentNode>()
  const recommendations = new Map<HTMLElement,Ranked[]>()
  const queue = new Map<HTMLElement,Suggestion>()
  let serial = 0, running = false, pending = false, active = false, learn = false, expandReview = false
  let captureAllowed = false, captureOpen = false, captureMessage = ''
  let editing = false, generation = 0, queuedFill = false
  let timer:ReturnType<typeof setTimeout>|undefined
  let assistantOpen = false
  let assistant:ReturnType<typeof createAssistant>|undefined
  const status = ():Page => ({
    detected:controls.size,filled:filled.size,review:recommendations.size,empty:[...controls.values()].filter(control=>isEmpty(control)).length,
  })
  function identify(element:HTMLElement) {
    let id = ids.get(element)
    if (!id) { id = String(++serial); ids.set(element,id) }
    return id
  }
  function stableIdentity(element:HTMLElement) {
    const root = element.getRootNode()
    if (!(root instanceof Document || root instanceof ShadowRoot)) return
    if (element.id && root.querySelectorAll(`#${CSS.escape(element.id)}`).length===1) {
      return {root,key:`id:${element.id}`}
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const {form,name} = element
      if (form && name && form.elements.namedItem(name)===element) return {root:form,key:`name:${name}`}
    }
  }
  function wasEdited(element:HTMLElement) {
    if (touched.has(element)) return true
    const identity = stableIdentity(element)
    return identity ? Boolean(touchedNames.get(identity.root)?.has(identity.key)) : false
  }
  function discover(root:ParentNode) {
    if (root instanceof HTMLElement && root.matches(selector)) collect(root)
    for (const element of root.querySelectorAll<HTMLElement>(selector)) collect(element)
    const elements = root instanceof HTMLElement ? [root,...root.querySelectorAll('*')] : root.querySelectorAll('*')
    for (const element of elements) {
      if (!element.shadowRoot || observed.has(element.shadowRoot)) continue
      observe(element.shadowRoot)
      discover(element.shadowRoot)
    }
  }
  function collect(element:HTMLElement) {
    const control = extract(element,identify(element))
    if (control && editable(element)) controls.set(element,control)
    else controls.delete(element)
  }
  function schedule(root?:ParentNode) {
    if (root) changes.add(root)
    if (timer) return
    timer = setTimeout(()=>{
      timer = undefined
      const explicit = queuedFill
      queuedFill = false
      void scan(explicit).catch(()=>deactivate())
    },110)
  }
  function observe(root:Document|ShadowRoot) {
    const observer = new MutationObserver(records=>{
      for (const record of records) {
        const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement
        if (!target || target.closest('[data-autofill-ai]')) continue
        if (record.type==='childList') {
          for (const node of record.addedNodes) if (node instanceof HTMLElement && !node.closest('[data-autofill-ai]')) schedule(node)
          if (record.removedNodes.length) schedule()
        }
        const container = target.closest('label,fieldset,select,[role="group"]')
        if (record.type!=='childList' || container) schedule(container ?? target)
      }
    })
    observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,
      attributeFilter:['open','hidden','style','class','disabled','readonly','aria-disabled','aria-hidden','aria-label','aria-labelledby','aria-describedby','role','name','type','placeholder','autocomplete','id','for','required']})
    observed.set(root,observer)
    if (root instanceof ShadowRoot) root.addEventListener('change',onChange,true)
  }
  function deactivate() {
    active = learn = captureAllowed = false
    captureOpen = false
    captureMessage = ''
    recommendations.clear()
    queue.clear()
    controls.clear()
    changes.clear()
    for (const [root,observer] of observed) {
      observer.disconnect()
      if (root instanceof ShadowRoot) root.removeEventListener('change',onChange,true)
    }
    observed.clear()
    closeAssistant()
  }
  async function scan(force=false) {
    if (running) {
      pending = true
      queuedFill ||= force
      return status()
    }
    running = true
    const version = generation
    try {
      if (!active) {
        const access = await send<MatchResponse>({type:'MATCH',fields:[]})
        if (version!==generation) return status()
        if (!access.active) { deactivate(); return status() }
        active = true
        observe(document)
        changes.add(document)
      }
      for (const root of changes) if (root.isConnected) discover(root)
      changes.clear()
      for (const [root,observer] of observed) if (root instanceof ShadowRoot && !root.host.isConnected) {
        observer.disconnect()
        root.removeEventListener('change',onChange,true)
        observed.delete(root)
      }
      for (const element of controls.keys()) if (!editable(element)) controls.delete(element)
      for (const element of filled) if (!element.isConnected) filled.delete(element)
      for (const element of queue.keys()) if (!element.isConnected) queue.delete(element)
      const empty = [...controls.values()].filter(control=>isEmpty(control) && !wasEdited(control.element))
      recommendations.clear()
      for (let index=0;index<Math.max(empty.length,1);index+=80) {
        const batch = empty.slice(index,index+80)
        const result = await send<MatchResponse>({type:'MATCH',fields:batch.map(control=>control.field),explicit:force})
        if (version !== generation) return status()
        if (!result.active) { deactivate(); return status() }
        active = true
        learn = result.learn
        captureAllowed = result.capture
        for (const [element,item] of queue) {
          if (!captureAllowed || (!learn && !item.manual)) queue.delete(element)
        }
        if (!captureAllowed) captureMessage = ''
        for (const control of batch) {
          const matches = result.matches[control.field.id] ?? []
          if (!matches.length) continue
          if (matches[0].action==='autofill' && apply(control,matches[0].value)) {
            filled.add(control.element)
          } else if (isEmpty(control)) recommendations.set(control.element,matches)
        }
      }
      render()
      return status()
    } finally {
      running = false
      if (pending) { pending=false; schedule() }
    }
  }
  function apply(control:Control,value:string,explicit=false) {
    const fresh = extract(control.element,control.field.id)
    if (!fresh || [fresh.element,...fresh.radios].some(wasEdited) ||
        JSON.stringify(fresh.field)!==JSON.stringify(control.field)) return false
    editing = true
    try { return fill(fresh,value,touched,explicit) }
    finally { editing = false }
  }
  function eventElement(event:Event) {
    return event.composedPath().find(node=>node instanceof HTMLElement && node.matches(selector)) as HTMLElement|undefined
  }
  function touch(event:Event) {
    if (!event.isTrusted || !active || editing) return
    const element = eventElement(event)
    if (!element) return
    touched.add(element)
    const identity = stableIdentity(element)
    if (identity) {
      const names = touchedNames.get(identity.root) ?? new Set<string>()
      names.add(identity.key)
      touchedNames.set(identity.root,names)
    }
    filled.delete(element)
    if (element instanceof HTMLInputElement && element.type==='radio') {
      const control = [...controls.values()].find(item=>item.radios.includes(element))
      if (control) {
        filled.delete(control.element)
        touched.add(control.element)
      }
    }
  }
  function onChange(event:Event) {
    if (!event.isTrusted || !active || editing) return
    const element = eventElement(event)
    if (!element) return
    touch(event)
    recommendations.delete(element)
    if (!learn) return
    const control = controls.get(element) ?? [...controls.values()].find(item=>item.radios.includes(element as HTMLInputElement)) ??
      extract(element,identify(element))
    if (!control || !editable(element) || blocked(control.field) || privateMessage.test(evidence(control.field)) ||
        ['editable','textarea','checkbox','combobox','date'].includes(control.field.type)) return
    const target = control.element
    const value = current(control).trim()
    if (submitted.get(target)===value) return
    if (queue.delete(target)) render()
    if (!value || value.length>500 || queue.size>=30) return
    const version = generation
    submitted.set(target,value)
    void send<LearnResponse>({type:'LEARN',field:control.field,value,mode:'check'}).then(result=>{
      if (learn && version===generation && target.isConnected && current(control).trim()===value && result.eligible) {
        queue.set(target,{field:control.field,value,existing:result.existing})
        render()
      }
    }).catch(()=>{})
  }
  async function captureEdits() {
    const version = generation
    let found = 0
    for (const [element,control] of controls) {
      if (found>=30 || version!==generation || !captureAllowed) break
      if (!touched.has(element) || !editable(element) || !control.field.label ||
          blocked(control.field) || privateMessage.test(evidence(control.field)) ||
          ['editable','textarea','checkbox','combobox','date'].includes(control.field.type)) continue
      const value = current(control).trim()
      if (!value || value.length>500) continue
      const result = await send<LearnResponse>({type:'LEARN',field:control.field,value,mode:'check',manual:true})
      if (version!==generation || !captureAllowed) return
      if (result.eligible && current(control).trim()===value) {
        queue.set(element,{field:control.field,value,existing:result.existing,manual:true})
        found++
      }
    }
    captureOpen = true
    captureMessage = found ? '' : 'No new eligible edits found. Fill a field on this page and try again.'
    render()
  }
  function task(action:()=>Promise<unknown>) {
    void action().catch(error=>{
      assistant?.body.append(paragraph(error instanceof Error ? error.message : 'The action is unavailable.'))
    })
  }
  async function save(element:HTMLElement,item:Suggestion,mode:'new'|'update') {
    const fresh = extract(element,item.field.id)
    if (!fresh || !editable(element) || current(fresh).trim()!==item.value ||
        JSON.stringify(fresh.field)!==JSON.stringify(item.field)) {
      queue.delete(element)
      render()
      throw new Error('This field changed. Complete it again to review the answer.')
    }
    await send({type:'LEARN',field:item.field,value:item.value,mode,existing:item.existing,manual:item.manual})
    queue.delete(element)
    render()
  }
  function closeAssistant() {
    assistantOpen = false
    assistant?.host.remove()
    assistant = undefined
  }
  function render() {
    if (!active || !assistantOpen) return
    if (!assistant?.host.isConnected) assistant = createAssistant(closeAssistant)
    const body = assistant.body
    assistant.notice.textContent = queue.size ? `${queue.size} to save` : ''
    const page = status()
    body.replaceChildren(paragraph(`${page.detected} detected · ${page.filled} filled · ${page.empty} empty`),
      button('Fill remaining',()=>task(()=>scan(true))),
      button('Disable on this site',()=>task(async()=>{await send({type:'SITE',mode:'block'});deactivate()})))
    if (captureAllowed) body.append(button('Capture entered details',()=>task(captureEdits)))
    if (captureMessage) body.append(paragraph(captureMessage))
    if (recommendations.size) {
      const details = document.createElement('details')
      details.open = expandReview
      details.addEventListener('toggle',()=>{expandReview=details.open})
      const summary = document.createElement('summary')
      summary.textContent = `Review matches (${recommendations.size})`
      details.append(summary)
      for (const [element,matches] of [...recommendations].slice(0,40)) {
        const control = controls.get(element)
        if (!control) continue
        const item = document.createElement('article')
        item.append(paragraph(control.field.label || control.field.name || 'Form field'))
        for (const match of matches) item.append(button(`Use ${match.value.slice(0,90)}`,()=>task(async()=>{
          const fresh = await send<MatchResponse>({type:'MATCH',fields:[control.field]})
          const approved = fresh.matches[control.field.id]?.find(candidate=>candidate.id===match.id && candidate.value===match.value)
          if (approved && apply(control,approved.value,true)) {
            filled.add(element); recommendations.delete(element); render()
          } else item.append(paragraph('Enter this answer directly in the website field.'))
        })))
        details.append(item)
      }
      body.append(details)
    }
    if (queue.size) {
      const details = document.createElement('details')
      details.open = captureOpen
      details.addEventListener('toggle',()=>{captureOpen=details.open})
      const caption = document.createElement('summary')
      caption.textContent = `Review answers to save (${queue.size})`
      details.append(caption,button('Save all new answers',()=>task(async()=>{
        for (const [element,item] of queue) if (!item.existing) await save(element,item,'new')
      })),button('Dismiss all',()=>{queue.clear();render()}),
      button('Stop learning on this site',()=>task(async()=>{await send({type:'SITE',mode:'noLearn'});queue.clear();render()})))
      for (const [element,item] of queue) {
        const article = document.createElement('article')
        article.append(paragraph(item.field.label),paragraph(item.value))
        if (item.existing) article.append(button('Update answer',()=>task(()=>save(element,item,'update'))))
        article.append(button(item.existing?'Save for this site':'Save answer',()=>task(()=>save(element,item,'new'))),
          button('Dismiss',()=>{queue.delete(element);render()}))
        details.append(article)
      }
      body.append(details)
    }
  }
  document.addEventListener('focusout',event=>{
    const element = eventElement(event)
    if (active && element && recommendations.has(element) && !wasEdited(element)) schedule()
  },true)
  document.addEventListener('input',touch,true)
  document.addEventListener('change',onChange,true)
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if (sender.id!==chrome.runtime.id) return false
    if (message?.type==='CONTENT_REFRESH') {
      generation++
      recommendations.clear()
      learn = captureAllowed = false
      captureMessage = ''
      assistant?.body.replaceChildren()
      schedule()
      return false
    }
    if (message?.type!=='CONTENT_PAGE' || typeof message.fill!=='boolean') return false
    if (message.openAssistant===true) assistantOpen = true
    void scan(message.fill).then(result=>{render();reply(result)},()=>{deactivate();reply(status())})
    return true
  })
  schedule()
}
