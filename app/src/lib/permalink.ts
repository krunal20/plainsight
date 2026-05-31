/**
 * permalink.ts — encode/decode a QuerySpec in a URL hash segment.
 *
 * Uses base64url (URL-safe, no padding) so the hash value is a clean string.
 * Usage: window.location.hash = `#spec=${encodeSpec(spec)}`
 *        const spec = decodeSpec(new URLSearchParams(hash.slice(1)).get('spec')!)
 */
import type { QuerySpec } from '../../contracts';

/** Encode a QuerySpec to a base64url string (URL-safe, no padding). */
export function encodeSpec(spec: QuerySpec): string {
  const json = JSON.stringify(spec);
  // btoa works on ASCII; use TextEncoder to handle any unicode
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Decode a base64url string back to a QuerySpec. */
export function decodeSpec(s: string): QuerySpec {
  // Restore standard base64 padding
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  const base64 = pad ? padded + '='.repeat(4 - pad) : padded;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as QuerySpec;
}
