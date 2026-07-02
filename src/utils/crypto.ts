const ALGORITHM = { name: 'AES-GCM' };
const IV_LENGTH = 12;

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function getKey(secret: string): Promise<CryptoKey> {
	const keyData = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(secret)
	);
	return crypto.subtle.importKey('raw', keyData, ALGORITHM, false, [
		'encrypt',
		'decrypt',
	]);
}

/**
 * Encrypts a token using AES-GCM with a key derived from the given secret.
 * Returns a base64-encoded string (IV + ciphertext).
 */
export async function encryptToken(
	plaintext: string,
	secret: string
): Promise<string> {
	const key = await getKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const encoded = new TextEncoder().encode(plaintext);
	const encrypted = await crypto.subtle.encrypt(
		{ ...ALGORITHM, iv },
		key,
		encoded
	);

	// Prepend IV to ciphertext so we have it for decryption
	const combined = new Uint8Array(IV_LENGTH + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), IV_LENGTH);

	return bytesToBase64(combined);
}

/**
 * Decrypts a base64-encoded token (IV + ciphertext) using AES-GCM
 * with a key derived from the given secret.
 */
export async function decryptToken(
	ciphertext: string,
	secret: string
): Promise<string> {
	const combined = base64ToBytes(ciphertext);
	const iv = combined.slice(0, IV_LENGTH);
	const data = combined.slice(IV_LENGTH);

	const key = await getKey(secret);
	const decrypted = await crypto.subtle.decrypt(
		{ ...ALGORITHM, iv },
		key,
		data
	);

	return new TextDecoder().decode(decrypted);
}
