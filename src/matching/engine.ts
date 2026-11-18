export const dictionary = {
  'personal.fullName': 'full name|applicant name|your complete name|complete name|name',
  'personal.firstName': 'first name|given name|forename',
  'personal.middleName': 'middle name|additional name',
  'personal.lastName': 'last name|family name|surname',
  'personal.email': 'email|e mail|email address|contact email|applicant email',
  'personal.phone': 'phone|phone number|telephone|mobile number|contact number',
  'personal.countryCode': 'country code|dialing code|phone country code',
  'personal.address': 'address|street address|address line 1|street',
  'personal.district': 'county|district|county district',
  'personal.city': 'city|town|locality',
  'personal.state': 'state|province|region',
  'personal.country': 'country|country of residence',
  'personal.postalCode': 'postal code|zip|zip code|postcode',
  'education.highestQualification': 'highest qualification|highest educational qualification|highest education level',
  'education.collegeAndDegree': 'college and degree|college and degree name|university and degree|college degree and major',
  'education.degree': 'degree|degree name',
  'education.specialization': 'branch|specialization|major|field of study',
  'education.school': 'school|school name|high school|high school name|secondary school',
  'education.college': 'college|university|college name|university name|college or university',
  'education.graduationYear': 'graduation year|expected year of graduation|year of graduation',
  'education.gpa': 'gpa|cgpa|grade point average',
  'professional.role': 'current role|current job title|job title',
  'professional.summary': 'professional summary|career summary',
  'professional.skills': 'skills|technical skills',
  'professional.experience': 'years of experience|total experience',
  'professional.company': 'current employer|current company|company name',
  'professional.githubUrl': 'github|github profile|github profile url',
  'professional.linkedinUrl': 'linkedin|linkedin profile|linkedin url|linkedin profile url',
  'professional.portfolioUrl': 'portfolio|portfolio website|portfolio url|personal portfolio url',
  'professional.xUrl': 'x profile|x profile url|x url|twitter|twitter url|twitter profile|twitter profile url',
  'professional.resumeUrl': 'resume url|resume link|cv url|cv link|link to your resume|link to your cv',
  'professional.portfolioOrLinkedin': 'portfolio or linkedin|portfolio or linkedin url|portfolio or linkedin link|linkedin or portfolio',
  'professional.websiteUrl': 'website|personal website|personal website url|website url|personal url',
  'professional.otherUrl': 'other website|other website url|additional website url|other link',
  'project.name': 'project name|project title|featured project name|best project name',
  'project.description': 'project description|describe your project|describe your best project|tell us about a project you built',
  'project.role': 'project role|your role in the project|your contribution to the project',
  'project.technologies': 'project tech stack|project technologies|technologies used in the project|project tools',
  'project.impact': 'project impact|project results|project outcome|project achievements',
  'project.repositoryUrl': 'project repository|project repository url|project github url|source code link|source code url',
  'project.demoUrl': 'project demo|project demo url|live project url|live demo link|project link|project url',
  'project.showcaseUrl': 'link to one thing you built|link to something you built',
  'context.relocation': 'willing to relocate|open to relocation|relocation',
} as const

export const normalize = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu,'')
  .replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\blinked in\b/g,'linkedin').replace(/\bgit hub\b/g,'github')
export const questionKey = (value: string) => normalize(value.replace(/\s*\(\s*(optional|required)\s*\)\s*\**\s*$/i,''))
  .replace(/^(please (enter|provide|select) |what is |are you |would you be |your )/,'').replace(/^your /,'')
const reverse = new Map(Object.entries(dictionary).flatMap(([key, words]) => words.split('|').map(word => [word,key] as const)))
const autocomplete: Record<string,string> = {
  name:'personal.fullName','given-name':'personal.firstName','additional-name':'personal.middleName','family-name':'personal.lastName',
  email:'personal.email',tel:'personal.phone','tel-country-code':'personal.countryCode','street-address':'personal.address',
  'address-line1':'personal.address','address-level2':'personal.city','address-level1':'personal.state',
  country:'personal.country','country-name':'personal.country','postal-code':'personal.postalCode','organization-title':'professional.role'
}
export interface Field {
  id:string
  label:string
  name:string
  domId:string
  placeholder:string
  autocomplete:string
  type:string
  context:string
  help:string
  options:string[]
  required:boolean
}
const sensitive = /\b(passwords?|passcode|otp|one time|verification code|security code|security question|recovery phrase|recovery code|authentication|tokens?|api key|private key|secret|credit card|debit card|card number|cvv|cvc|pin|bank|iban|routing number|social security|ssn|aadhaar|aadhar|passport|government id|tax id|driver s license|driving license|voter id|medical|health|diagnosis|insurance|patient|medication|national id|captcha|biometric|dob|date of birth)\b/
export const contextual = /\b(salary|compensation|visa|sponsorship|authorization|authorisation|notice period|start date|earliest start|relocat\w*|availability|available|legal|consent|eligib\w*|terms|agree|declare|certify|citizenship)\b/
const otherPerson = /\b(managers?|supervisors?|references?|referees?|emergency contacts?|guardians?|parents?|spouse|recipients?|beneficiaries|beneficiary|recommenders?|witnesses|witness|billing|shipping)\b/
export const privateMessage = /\b(message|comments?|feedback|notes?|describe|tell us|subject|complaint|how can we help|what can we help|conversation|inquiry|request details)\b/
export function evidence(field: Field) {
  return normalize([field.label,field.name,field.domId,field.placeholder,field.autocomplete,field.help,field.context].join(' '))
}
export function blocked(field: Field) {
  return sensitive.test(evidence(field)) || /(?:^|\s)(?:cc-|bday|one-time-code)/.test(field.autocomplete) ||
    ['password','hidden','file','submit','reset','button','search'].includes(field.type)
}
export function classify(field: Field) {
  if (blocked(field) || otherPerson.test(evidence(field))) return undefined
  const label = questionKey(field.label)
  const explicit = autocomplete[field.autocomplete.trim().split(/\s+/).at(-1) ?? '']
  const named = reverse.get(label)
  if ((field.type==='url' || ['text','url'].includes(field.type) && /^(link to your (resume|cv)|https?:)/i.test(field.placeholder)) && /^(resume|cv)$/.test(label)) {
    return {key:'professional.resumeUrl',score:0.97,reason:'Résumé link field'}
  }
  if (field.type==='textarea' && /^(anything we should know|anything else|additional information)$/.test(label) &&
      /\b(?:project|system|application|product) you (?:have )?built\b/.test(normalize(field.placeholder+' '+field.help))) {
    return {key:'project.description',score:0.88,reason:'Prompt asks about something you built'}
  }
  const prompt = normalize(field.label || field.placeholder)
  if (field.type==='combobox' && /^(start typing your address|search (for )?(your )?address)$/.test(prompt)) {
    return {key:'personal.address',score:0.86,reason:'Address search prompt'}
  }
  if (field.type==='combobox' && /^(search (for )?(a )?country|select (a |your )?country)$/.test(prompt)) {
    return {key:'personal.country',score:0.86,reason:'Country search prompt'}
  }
  if (label && !named && !['text','input','required','optional'].includes(label)) return undefined
  if (named && explicit && named !== explicit) return undefined
  if (named) return {key:named,score:0.98,reason:'Standard question wording'}
  if (explicit) return {key:explicit,score:0.97,reason:'Standard autocomplete attribute'}
  const linkName = reverse.get(questionKey(field.name)) ?? reverse.get(questionKey(field.domId))
  if (linkName?.endsWith('Url') && (field.type==='url' || (field.type==='text' && /^https?:\/\//i.test(field.placeholder)))) {
    return {key:linkName,score:0.95,reason:'Named web link field'}
  }
  const hint = reverse.get(questionKey(field.placeholder)) ?? reverse.get(questionKey(field.name))
  if (hint) return {key:hint,score:0.78,reason:'Field placeholder or name'}

}
export interface Candidate {
  id:string
  question:string
  value:string
  key?:string
  aliases:string[]
  excluded:string[]
  scope:string
  context:string
  autofill:boolean
}
export interface Ranked {
  fieldId:string
  id:string
  semanticKey?:string
  project?:string
  value:string
  confidence:number
  reason:string
  action:'autofill'|'suggest'
}
export interface SemanticProvider { similarity(question:string, saved:string):number }
export const tokenSimilarity: SemanticProvider = {
  similarity(question,saved) {
    const a = new Set(question.split(' ')), b = new Set(saved.split(' '))
    if (a.size < 3 || b.size < 3) return 0
    return [...a].filter(word=>b.has(word)).length / new Set([...a,...b]).size
  }
}
const questionMetadata = new WeakMap<Candidate,{phrases:string[];excluded:Set<string>}>()
function prepared(item:Candidate) {
  let metadata = questionMetadata.get(item)
  if (!metadata) {
    metadata = {
      phrases:[item.question,...item.aliases].map(questionKey).filter(Boolean),
      excluded:new Set(item.excluded.map(questionKey)),
    }
    questionMetadata.set(item,metadata)
  }
  return metadata
}
export function explainNoMatch(field:Field, candidates:Candidate[], origin:string) {
  const text = evidence(field)
  if (blocked(field) || /\b(consent|terms|agree|certify|captcha)\b/.test(text)) return 'Autofill skips sensitive fields and consent questions.'
  if (otherPerson.test(text)) return 'This field appears to ask for someone else’s details.'
  const classification = classify(field)
  if (!classification) return 'Autofill could not identify a saved answer for this field.'
  const saved = candidates.some(item=>item.key===classification.key && item.value && (!item.scope || item.scope===origin))
  if (!saved) return 'There is no saved value for this detail.'
  if (field.options.length) return 'No available option matched the saved value.'
  return 'The saved value could not be matched with enough confidence.'
}
export function rank(field:Field, candidates:Candidate[], origin:string, high=0.94, medium=0.72, provider=tokenSimilarity):Ranked[] {
  const text = evidence(field)
  if (blocked(field) || /\b(consent|terms|agree|certify|captcha)\b/.test(text)) return []
  const thirdParty = otherPerson.test(text)
  const classification = classify(field), question = questionKey(field.label)
  const needsReview = contextual.test(text) || thirdParty || ['combobox','checkbox','date','editable'].includes(field.type)
  const matches = new Map<string, Ranked>()
  for (const item of candidates) {
    if (!item.value || (item.scope && item.scope !== origin) ||
        (item.key && (thirdParty || (classification && classification.key!==item.key)))) continue
    const {phrases,excluded} = prepared(item)
    if (excluded.has(question)) continue
    const semantic = item.key && classification?.key === item.key ? classification : undefined
    const exact = question && phrases.includes(question)
    const similarity = item.key || !question ? 0 : Math.max(0,...phrases.map(phrase=>provider.similarity(question,phrase)))
    const score = semantic?.score ?? (exact ? 0.96 : similarity >= 0.6 ? 0.66 + similarity * 0.19 : 0)
    const confidence = item.key?.startsWith('project.') && !item.autofill ? Math.min(score,0.88) : score
    if (confidence < medium) continue
    if (['select','radio','combobox','checkbox'].includes(field.type) && field.options.length &&
        !field.options.some(option=>normalize(option)===normalize(item.value))) continue
    const action = confidence >= high && item.autofill && !needsReview ? 'autofill' : 'suggest'
    const match:Ranked = {
      fieldId:field.id,id:item.id,semanticKey:item.key,value:item.value,confidence,action,
      project:item.key?.startsWith('project.') ? item.context : undefined,
      reason:semantic?.reason ?? (exact?'Saved question or alias':'Similar wording'),
    }
    const previous = matches.get(item.value)
    if (!previous || previous.confidence < confidence) matches.set(item.value,match)
  }
  const sorted = [...matches.values()].sort((a,b)=>b.confidence-a.confidence)
  if (sorted.length > 1 && sorted[0].confidence - sorted[1].confidence <= 0.05) {
    for (const match of sorted) match.action = 'suggest'
  }
  return sorted.slice(0,3)
}
