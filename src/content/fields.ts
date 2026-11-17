import { blocked, classify, normalize, type Field } from '../matching/engine'

export const selector = 'input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"],[role="combobox"],[role="textbox"],[role="radiogroup"],[role="checkbox"]'
export interface Control {element:HTMLElement; field:Field; radios:HTMLInputElement[]}
const clean = (input?:string|null) => (input ?? '').replace(/\s+/g,' ').trim().slice(0,500)
function text(element?:Element|null) { return clean(element?.textContent) }
function labelText(node:Element) {
  const clone = node.cloneNode(true) as Element
  clone.querySelectorAll('input,textarea,select,button,svg,[aria-hidden="true"]').forEach(child=>child.remove())
  return text(clone)
}
function referenced(element:HTMLElement,attribute:string) {
  const root = element.getRootNode() as Document|ShadowRoot
  return clean(element.getAttribute(attribute)?.split(/\s+/).map(id=>text(root.getElementById(id))).join(' '))
}
function label(element:HTMLElement) {
  return referenced(element,'aria-labelledby') || clean(element.getAttribute('aria-label')) ||
    ('labels' in element ? clean(Array.from((element as HTMLInputElement).labels ?? [],labelText).join(' ')) : '')
}
function formContext(element:HTMLElement) {
  const form = element.closest('form,[role="form"]')
  const section = element.closest('fieldset,section,dialog,[role="group"],[role="region"],[role="dialog"]')
  const heading = section?.querySelector(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > header > h2,:scope > header > h3')
  return clean([
    form?.getAttribute('aria-label'),form?.getAttribute('name'),
    section?.getAttribute('aria-label'),section instanceof HTMLElement ? referenced(section,'aria-labelledby') : '',
    text(heading),
  ].filter(Boolean).join(' '))
}
export function extract(element:HTMLElement,id:string):Control|undefined {
  if (element.closest('[data-autofill-ai]')) return
  const role = element.getAttribute('role') ?? ''
  const input = element instanceof HTMLInputElement
  const type = role==='combobox' ? 'combobox' : input ? element.type : element instanceof HTMLTextAreaElement ? 'textarea' :
    element instanceof HTMLSelectElement ? 'select' : element.isContentEditable ? 'editable' :
    role==='radiogroup' ? 'combobox' : role
  const fieldset = element.closest('fieldset')
  const legend = text(fieldset?.querySelector(':scope > legend'))
  const accessibleGroup = element.closest('[role="group"],[role="radiogroup"],[role="listitem"]') as HTMLElement|null
  let name = label(element)
  if (!name && accessibleGroup && accessibleGroup !== element) name = label(accessibleGroup)
  if (!name && element.previousElementSibling?.matches('label:not([for]),h2,h3,h4,[data-question]')) {
    name = labelText(element.previousElementSibling)
  }
  if (!name) {
    const nearbyLabel = /^(address|street address|city|town|zip|zip code|postal code|postcode|country|state|province|website|personal website|linkedin|github|twitter|x profile|portfolio|county \/ district)$/i
    for (const anchor of [element,element.parentElement]) {
      if (!anchor || (anchor!==element && anchor.querySelectorAll(selector).length!==1)) continue
      const previous = anchor.previousElementSibling
      if (!previous?.matches('label[for],input,select,textarea,button') && previous && !previous.querySelector(selector)) {
        const nearby = labelText(previous)
        if (nearbyLabel.test(nearby)) { name = nearby; break }
      }
    }
  }
  let radios:HTMLInputElement[] = []
  let options:string[] = []
  if (input && type === 'radio') {
    const root = element.form ?? (element.getRootNode() as Document|ShadowRoot)
    radios = element.name ? Array.from(root.querySelectorAll<HTMLInputElement>('input[type=radio]')).filter(radio=>radio.name===element.name && radio.form===element.form) : [element]
    if (radios[0] !== element) return
    name = legend || (accessibleGroup ? label(accessibleGroup) : '')
    options = radios.flatMap(radio=>[label(radio),radio.value])
  } else if (element instanceof HTMLSelectElement) {
    options = Array.from(element.options).filter(option=>!option.disabled && option.value).flatMap(option=>[option.label,option.value])
  } else if (type==='checkbox') options = ['Yes','No']
  else if (type==='combobox') options = Array.from(element.querySelectorAll('[role="option"],[role="radio"]'),option=>text(option))
  const field:Field = {
    id,label:name,name:clean(element.getAttribute('name')),domId:clean(element.id),placeholder:clean(element.getAttribute('placeholder')),
    autocomplete:clean(element.getAttribute('autocomplete')),type,context:clean([formContext(element),legend].filter(Boolean).join(' ')),
    help:referenced(element,'aria-describedby'),options:options.map(clean).filter(Boolean).slice(0,200),
    required:element.hasAttribute('required') || element.getAttribute('aria-required')==='true',
  }
  if (!type || blocked(field) || ['color','range','image','time','datetime-local','week','month'].includes(type)) return
  return {element,field,radios}
}
export function visible(element:HTMLElement) {
  if (!element.isConnected || !element.getClientRects().length || element.closest('[hidden],[inert],[aria-hidden="true"]')) return false
  const style = getComputedStyle(element)
  return style.visibility === 'visible' && style.opacity !== '0' &&
    (typeof element.checkVisibility !== 'function' || element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))
}
export function editable(element:HTMLElement) {
  return visible(element) && !element.matches(':disabled,[readonly],[aria-disabled="true"],[aria-readonly="true"]') &&
    !element.closest('[aria-disabled="true"]')
}
export function current({element,radios,field}:Control):string {
  if (radios.length) {
    const selected = radios.find(radio=>radio.checked)
    return selected ? label(selected) || selected.value : ''
  }
  if (element instanceof HTMLInputElement && element.type==='checkbox') return element.checked ? 'Yes' : ''
  if (element instanceof HTMLSelectElement && element.multiple) return Array.from(element.selectedOptions).map(option=>option.value).join(', ')
  if ('value' in element) return String(element.value)
  if (field.type==='checkbox') return element.getAttribute('aria-checked')==='true' ? 'Yes' : ''
  return element.isContentEditable ? element.textContent ?? '' : element.getAttribute('aria-valuetext') ?? ''
}
export function isEmpty(control:Control) {
  const value = current(control).trim()
  if (!value) return true
  return /^(https?:\/\/|www\.)$/i.test(value) &&
    (control.field.type==='url' || classify(control.field)?.key.endsWith('Url')===true)
}
function focusWithin(element:HTMLElement) {
  return element.matches(':focus,:focus-within')
}
function notify(element:HTMLElement) {
  element.dispatchEvent(new Event('input',{bubbles:true,composed:true}))
  element.dispatchEvent(new Event('change',{bubbles:true,composed:true}))
}
function check(element:HTMLInputElement) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked')?.set
  if (!setter) return false
  setter.call(element,true)
  notify(element)
  return element.checked
}
export function fill(control:Control,value:string,manual:WeakSet<HTMLElement>,explicit=false) {
  const {element,radios,field} = control
  if (!isEmpty(control) || !editable(element) || [element,...radios].some(node=>manual.has(node) || focusWithin(node))) return false
  if (field.type==='combobox' || (field.type==='textbox' && !element.isContentEditable)) return false
  if (radios.length) {
    const matches = radios.filter(radio=>[label(radio),radio.value].some(option=>normalize(option)===normalize(value)) && editable(radio))
    if (matches.length!==1) return false
    return check(matches[0])
  }
  if (element instanceof HTMLInputElement && element.type==='checkbox') {
    if (!explicit || normalize(value)!=='yes') return false
    return check(element)
  }
  if (element instanceof HTMLSelectElement && element.multiple) return false
  let expected = value
  if (element instanceof HTMLSelectElement) {
    const matches = Array.from(element.options).filter(option=>!option.disabled && !option.closest('optgroup[disabled]') && option.value &&
      [option.value,option.label].some(part=>normalize(part)===normalize(value)))
    if (matches.length!==1) return false
    expected = matches[0].value
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype :
      element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype,'value')?.set
    if (!setter) return false
    const previous = element.value
    setter.call(element,expected)
    if (element.value !== expected || !element.validity.valid) {
      setter.call(element,previous)
      return false
    }
  } else if (element.isContentEditable && explicit) element.textContent = expected
  else return false
  notify(element)
  return current(control)===expected
}
