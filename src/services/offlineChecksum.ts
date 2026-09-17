import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';

export type OfflineDigestAlgorithm = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
declare module 'expo-file-system' { interface File { digest(algorithm: OfflineDigestAlgorithm): Promise<string>; } }
const ALGORITHMS: Record<OfflineDigestAlgorithm, Crypto.CryptoDigestAlgorithm> = { MD5: Crypto.CryptoDigestAlgorithm.MD5, 'SHA-1': Crypto.CryptoDigestAlgorithm.SHA1, 'SHA-256': Crypto.CryptoDigestAlgorithm.SHA256, 'SHA-384': Crypto.CryptoDigestAlgorithm.SHA384, 'SHA-512': Crypto.CryptoDigestAlgorithm.SHA512 };
function hex(buffer: ArrayBuffer): string { return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
if (typeof File.prototype.digest !== 'function') {
  File.prototype.digest = async function digest(algorithm: OfflineDigestAlgorithm): Promise<string> { return hex(await Crypto.digest(ALGORITHMS[algorithm], await this.bytes())); };
}
