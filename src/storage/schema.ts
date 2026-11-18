import { z } from 'zod'
import type { Candidate } from '../matching/engine'
import { blocked, dictionary } from '../matching/engine'

export const short = z.string().max(500)
export const value = z.string().max(4000)
export const origin = z.string().max(300).refine(input=>{
  try {
    const parsed = new URL(input)
    return ['http:','https:'].includes(parsed.protocol) && parsed.origin === input
  } catch { return false }
},'Enter an HTTP(S) origin')
const baseAnswer = z.object({
  id:z.string().uuid(), key:short.optional(),question:short.min(1),value:value.min(1),
  aliases:z.array(short).max(40),excluded:z.array(short).max(100),
  scope:z.union([z.literal(''),origin]),context:short,autofill:z.boolean(),
  category:short,source:z.union([z.literal(''),origin]),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),
})
export const answerSchema = baseAnswer.refine(answer=>![answer.question,...answer.aliases].some(label=>blocked({
  id:'',label,name:'',domId:'',placeholder:'',autocomplete:'',type:'text',context:answer.context,help:'',options:[],required:false,
})),'Sensitive questions cannot be saved.')
export const educationSchema = z.object({
  id:z.string().uuid(),degree:short,specialization:short,college:short,graduationYear:short,gpa:short,
})
export type Education = z.infer<typeof educationSchema>
const projectLink = z.union([z.literal(''),short.url().refine(link=>/^https?:\/\//i.test(link),'Enter an HTTP or HTTPS link')])
export const projectSchema = z.object({
  id:z.string().uuid(),name:short.trim().min(1),description:value,role:short,technologies:short,impact:value,
  repositoryUrl:projectLink,demoUrl:projectLink,
})
export type Project = z.infer<typeof projectSchema>
export const projectsSchema = z.object({
  entries:z.array(projectSchema).max(20),
  featured:z.string().uuid().nullable(),
}).refine(({entries,featured})=>
  new Set(entries.map(project=>project.id)).size===entries.length &&
  (!featured || entries.some(project=>project.id===featured)),'Select a saved project to feature.')
export const payloadSchema = z.object({
  version:z.literal(1),profile:z.record(value).refine(profile=>Object.keys(profile).every(key=>Object.hasOwn(dictionary,key))),
  projects:projectsSchema.default({entries:[],featured:null}),
  education:z.array(educationSchema).max(30).default([]),
  answers:z.array(answerSchema).max(2500).refine(answers=>new Set(answers.map(answer=>answer.id)).size===answers.length),
})
export const settingsSchema = z.object({
  enabled:z.boolean(),auto:z.boolean(),learn:z.boolean(),suggest:z.boolean(),
  blocked:z.array(origin).max(500),noLearn:z.array(origin).max(500),
})
export type ProfileData = z.infer<typeof payloadSchema>
export type Answer = z.infer<typeof answerSchema>
export type Settings = z.infer<typeof settingsSchema>
export const defaults:Settings = {enabled:true,auto:true,learn:false,suggest:true,blocked:[],noLearn:[]}
export const emptyData:ProfileData = {version:1,profile:{},projects:{entries:[],featured:null},education:[],answers:[]}
export function migrate(input:unknown) {
  if (typeof input === 'object' && input && !('version' in input)) return payloadSchema.parse({...input,version:1})
  return payloadSchema.parse(input)
}
export function candidates(data:ProfileData):Candidate[] {
  const profile = {...data.profile}
  const first = profile['personal.firstName']?.trim()
  const last = profile['personal.lastName']?.trim()
  if (!profile['personal.fullName']?.trim() && first && last) {
    profile['personal.fullName'] = [first,profile['personal.middleName']?.trim(),last].filter(Boolean).join(' ')
  }
  if (!profile['professional.websiteUrl'] && profile['professional.portfolioUrl']) {
    profile['professional.websiteUrl'] = profile['professional.portfolioUrl']
  }
  const college = profile['education.college']?.trim()
  const degree = profile['education.degree']?.trim()
  if (college && degree) profile['education.collegeAndDegree'] = [college,degree].join(', ')
  const portfolioOrLinkedin = profile['professional.portfolioUrl']?.trim() || profile['professional.websiteUrl']?.trim() ||
    profile['professional.linkedinUrl']?.trim()
  if (portfolioOrLinkedin) profile['professional.portfolioOrLinkedin'] = portfolioOrLinkedin
  return [...Object.entries(profile).filter(([,value])=>value).map(([key,value])=>({
    id:key,key,value,question:'',aliases:[],excluded:[],context:'',scope:'',autofill:true
  })),...data.education.flatMap(({id,college,degree,specialization,graduationYear,gpa})=>
    Object.entries({college,degree,specialization,graduationYear,gpa}).filter(([,value])=>value).map(([key,value])=>({
      id:`${id}:${key}`,key:`education.${key}`,value,question:'',aliases:[],excluded:[],scope:'',
      context:[college,degree].filter(Boolean).join(' · '),autofill:false,
    }))),...data.projects.entries.flatMap(({id,...project})=>
    Object.entries({...project,showcaseUrl:project.demoUrl || project.repositoryUrl}).filter(([,value])=>value.trim()).map(([key,value])=>({
      id:`${id}:${key}`,key:`project.${key}`,value,question:'',aliases:[],excluded:[],scope:'',
      context:project.name,autofill:data.projects.featured===id,
    }))),...data.answers]
}
