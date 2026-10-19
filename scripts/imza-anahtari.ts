// Merkez için Ed25519 imza anahtar çifti üretir. Gizli anahtar yalnız merkezin ortamına (PLATFORM_SIGNING_KEY),
// açık anahtar müşteri sunucularına (CENTRAL_PUBLIC_KEY) yazılır. Gizli anahtarı parola kasasında saklayın.
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
console.log(`PLATFORM_SIGNING_KEY=${privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')}`);
console.log(`CENTRAL_PUBLIC_KEY=${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`);
