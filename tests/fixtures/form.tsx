import {useState} from 'react'
import {createRoot} from 'react-dom/client'

createRoot(document.querySelector('#react')!).render(<ControlledInput/>)
function ControlledInput() {
  const [name,setName]=useState('')
  return <div><label>Contact email<input type="email" value={name} onChange={event=>setName(event.target.value)}/></label>
    <output id="react-state">{name}</output></div>
}
document.querySelector('#form')!.addEventListener('submit',event=>{
  event.preventDefault()
  document.body.dataset.submitted='true'
})
document.querySelector('#step')!.addEventListener('click',()=>{
  if (document.querySelector('#next')) return
  const section=document.createElement('section')
  section.id='next'
  const label=document.createElement('label')
  label.append('Given name',document.createElement('input'))
  section.append(label)
  document.querySelector('main')!.append(section)
})
const shadow=document.querySelector('#shadow')!.attachShadow({mode:'open'})
const label=document.createElement('label')
label.append('Family name',document.createElement('input'))
shadow.append(label)
if (location.search.includes('equivalent')) {
  const qualification=document.querySelector('#qualification')!
  qualification.previousSibling!.textContent='Highest educational qualification '
}

document.querySelector('#rerender')!.addEventListener('click',()=>{
  const previous = document.querySelector<HTMLInputElement>('#applicant')!
  const replacement = previous.cloneNode() as HTMLInputElement
  replacement.value = ''
  previous.replaceWith(replacement)
  const label = document.createElement('label')
  label.append('Applicant email',document.createElement('input'))
  document.querySelector('main')!.append(label)
})
