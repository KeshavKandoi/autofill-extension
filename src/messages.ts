import { z } from 'zod'
import { answerSchema, educationSchema, projectsSchema, origin, settingsSchema, short, value } from './storage/schema'
import type { Field, Ranked } from './matching/engine'
import type { ProfileData, Settings } from './storage/schema'

export const fieldSchema = z.object({
  id:short,label:short,name:short,domId:short,placeholder:short,autocomplete:short,type:short,context:short,
  help:short,options:z.array(short).max(200),required:z.boolean()
})
const simple = <T extends string>(type:T) => z.object({type:z.literal(type)})
export const command = z.discriminatedUnion('type',[
  simple('STATE'),simple('CLEAR'),simple('SYNC'),
  z.object({type:z.literal('SETTINGS'),settings:settingsSchema.partial()}),
  z.object({type:z.literal('PROFILE'),profile:z.record(value),education:z.array(educationSchema).max(30)}),
  z.object({type:z.literal('PROJECTS'),projects:projectsSchema}),
  z.object({type:z.literal('IMPORT'),data:z.unknown()}),
  z.object({type:z.literal('ANSWER'),answer:answerSchema}),
  z.object({type:z.literal('DELETE'),id:z.string().uuid()}),
  z.object({type:z.literal('MATCH'),fields:z.array(fieldSchema).max(80),explicit:z.boolean().optional()}),
  z.object({type:z.literal('LEARN'),field:fieldSchema,value:value.min(1),mode:z.enum(['check','new','update']),existing:short.optional(),manual:z.boolean().optional()}),
  z.object({type:z.literal('SITE'),mode:z.enum(['block','allow','noLearn']),site:origin.optional()}),
  z.object({type:z.literal('PAGE'),tabId:z.number().int().nonnegative(),fill:z.boolean(),openAssistant:z.boolean().optional()}),
])
export type Command = z.infer<typeof command>
export interface State {settings:Settings; data?:ProfileData; profileCount:number; answerCount:number}
export interface Page {detected:number; filled:number; empty:number; review:number}
export interface MatchResponse {active:boolean; learn:boolean; capture:boolean; skipped:Record<string,string>; matches:Record<string,Ranked[]>}
export interface LearnResponse {eligible:boolean; existing?:string}
export interface Suggestion {field:Field; value:string; existing?:string; manual?:boolean}
export async function send<T=void>(message:Command):Promise<T> {
  const response = await chrome.runtime.sendMessage(message)
  if (!response?.ok) throw new Error(response?.error ?? 'The extension is unavailable.')
  return response.data as T
}
export function siteOf(url:string|undefined) {
  try {
    const parsed = new URL(url ?? '')
    if (['http:','https:'].includes(parsed.protocol)) return parsed.origin
  } catch { /* A protected or unavailable URL has no supported origin. */ }
  return ''
}
export const originPattern = (site:string) => {
  const url = new URL(site)
  return `${url.protocol}//${url.hostname}/*`
}
