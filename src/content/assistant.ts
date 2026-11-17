const style = `
:host{all:initial;color-scheme:light;font:14px system-ui,sans-serif;color:#202124}
section{font:14px system-ui,sans-serif;box-sizing:border-box;width:min(330px,calc(100vw - 32px));max-height:65vh;overflow:auto;background:#fff;border:1px solid #dadce0;border-radius:16px;padding:14px;box-shadow:0 12px 40px #13292333}
strong{font-size:15px} header{display:flex;align-items:center;justify-content:space-between;gap:12px}
p{margin:8px 0;color:#43575a;overflow-wrap:anywhere} button{font:inherit;padding:5px 9px;margin:3px 3px 3px 0;border:1px solid #dadce0;border-radius:7px;background:#fff;color:#202124;cursor:pointer}
button:focus-visible{outline:3px solid #159271;outline-offset:2px} details{margin-top:8px} summary{cursor:pointer} article{border-top:1px solid #b5cbc4;margin-top:7px;padding-top:5px}
`
export function createAssistant(onClose:()=>void) {
  const host = document.createElement('div')
  host.dataset.autofillAi = ''
  host.style.cssText = 'all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important'
  const root = host.attachShadow({mode:'closed'})
  const css = document.createElement('style')
  css.textContent = style
  const panel = document.createElement('section')
  panel.setAttribute('aria-label','Autofill assistant')
  const header = document.createElement('header')
  const title = document.createElement('strong')
  title.textContent = 'Autofill'
  const body = document.createElement('div')
  const notice = document.createElement('span')
  notice.setAttribute('role','status')
  header.append(title,notice,button('Close',onClose))
  panel.append(header,body)
  root.append(css,panel)
  document.documentElement.append(host)
  return {host,body,notice}
}
export function button(label:string,action:()=>void) {
  const node = document.createElement('button')
  node.type = 'button'
  node.textContent = label
  node.addEventListener('click',event=>{if (event.isTrusted) action()})
  return node
}
export function paragraph(text:string) {
  const node = document.createElement('p')
  node.textContent = text
  return node
}
