/**
 * 백업 코드: 진행 기록을 글자 한 줄로 바꿔 다른 기기로 옮긴다.
 *
 * 형식: `MK1.<본문>.<검사값>`
 * - 본문: 프로필 JSON 을 UTF-8 로 바꾸고 deflate 로 줄인 뒤 base64url 로 적는다.
 *   압축을 못 하는 브라우저는 압축 없이 적고 앞에 `j` 를 붙인다 (압축은 `z`).
 * - 검사값: 본문의 FNV-1a 해시 8자리. 복사하다 글자가 빠지거나 바뀌면 잡아낸다.
 *
 * 검사값은 실수를 잡는 용도일 뿐 위조를 막지는 않는다. 개인용 게임이라 그 정도면 된다.
 */
import { sanitizeProfile, type Profile } from './storage.ts';

const PREFIX = 'MK1';

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canCompress = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encodeBackup(p: Profile): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  const body = canCompress()
    ? 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
    : 'j' + toBase64Url(json);
  return `${PREFIX}.${body}.${fnv1a(body)}`;
}

export type DecodeResult = { profile: Profile } | { error: 'format' | 'checksum' | 'unsupported' };

export async function decodeBackup(code: string, now: number): Promise<DecodeResult> {
  // 메신저로 옮기며 끼어든 공백·줄바꿈은 무시한다
  const parts = code.replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX || !parts[1]) return { error: 'format' };
  const [, body, sum] = parts;
  if (fnv1a(body) !== sum) return { error: 'checksum' };
  try {
    let bytes = fromBase64Url(body.slice(1));
    if (body[0] === 'z') {
      if (!canCompress()) return { error: 'unsupported' };
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    } else if (body[0] !== 'j') {
      return { error: 'format' };
    }
    const profile = sanitizeProfile(JSON.parse(new TextDecoder().decode(bytes)), now);
    return profile ? { profile } : { error: 'format' };
  } catch {
    return { error: 'format' };
  }
}
