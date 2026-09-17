import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

type Algorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
const ALGORITHMS: Record<Algorithm, Crypto.CryptoDigestAlgorithm> = {
  MD5: Crypto.CryptoDigestAlgorithm.MD5, 'SHA-1': Crypto.CryptoDigestAlgorithm.SHA1, 'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256,
  'SHA-384': Crypto.CryptoDigestAlgorithm.SHA384, 'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512,
};
function spec(value?: string | null): { algorithm: Algorithm; digest: string } | null {
  if (!value) return null; const digest = value.trim().toLowerCase().replace(/^sha(?:-|_)?256:/, '').replace(/^md5:/, '');
  if (/^[a-f0-9]{32}$/.test(digest)) return { algorithm: 'MD5', digest }; if (/^[a-f0-9]{40}$/.test(digest)) return { algorithm: 'SHA-1', digest };
  if (/^[a-f0-9]{64}$/.test(digest)) return { algorithm: 'SHA-256', digest }; if (/^[a-f0-9]{96}$/.test(digest)) return { algorithm: 'SHA-384', digest };
  if (/^[a-f0-9]{128}$/.test(digest)) return { algorithm: 'SHA-512', digest }; return null;
}
function hex(buffer: ArrayBuffer): string { return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
export async function checksumMatches(file: File, expected?: string | null): Promise<boolean> {
  const parsed = spec(expected); if (!parsed) return true;
  const digest = await Crypto.digest(ALGORITHMS[parsed.algorithm], await file.bytes());
  return hex(digest).toLowerCase() === parsed.digest;
}
