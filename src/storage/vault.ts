import { z } from 'zod'
import { migrate, type ProfileData } from './schema'

const ITERATIONS = 600_000
const encoder = new TextEncoder()
const aad = encoder.encode('AutoFill AI vault v1')
const toBase64 = (bytes:Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
export const fromBase64 = (text:string) => Uint8Array.from(atob(text),character=>character.charCodeAt(0))
export const vaultSchema = z.object({version:z.literal(1),salt:z.string().length(24),iv:z.string().length(16),ciphertext:z.string().max(12_000_000)})
export type Vault = z.infer<typeof vaultSchema>
export const newSalt = () => toBase64(crypto.getRandomValues(new Uint8Array(16)))
export async function derive(passphrase:string,salt:string) {
  const material = await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveBits'])
  return toBase64(new Uint8Array(await crypto.subtle.deriveBits({
    name:'PBKDF2',salt:fromBase64(salt),hash:'SHA-256',iterations:ITERATIONS
  },material,256)))
}
async function aes(raw:string) {
  return crypto.subtle.importKey('raw',fromBase64(raw),{name:'AES-GCM'},false,['encrypt','decrypt'])
}
export async function seal(data:ProfileData,raw:string,salt:string):Promise<Vault> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await aes(raw),encoder.encode(JSON.stringify(data)))
  return vaultSchema.parse({version:1,salt,iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(ciphertext))})
}
export async function open(vault:Vault,raw:string) {
  const data = await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(vault.iv),additionalData:aad},await aes(raw),fromBase64(vault.ciphertext))
  return migrate(JSON.parse(new TextDecoder().decode(data)))
}
