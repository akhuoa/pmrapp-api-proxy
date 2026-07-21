import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * Derives an HMAC key from the app secret using SHA-256.
 * Reuses the same digest approach as the AES-GCM key derivation in crypto.ts.
 */
async function getJwtKey(secret: string): Promise<CryptoKey> {
	const keyData = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(secret)
	);
	return crypto.subtle.importKey(
		'raw',
		keyData,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign', 'verify']
	);
}

export interface TokenPayload extends JWTPayload {
	/** The AES-GCM encrypted GitHub access token */
	sub: string;
}

/**
 * Creates a signed JWT containing the encrypted GitHub token as the `sub` claim,
 * with `iat` and `exp` set automatically.
 *
 * @param encryptedToken - The AES-GCM encrypted GitHub access token
 * @param secret - The signing secret (GITHUB_CLIENT_SECRET)
 * @param expiryHours - Number of hours until the JWT expires
 * @returns A signed JWT string
 */
export async function signToken(
	encryptedToken: string,
	secret: string,
	expiryHours: number
): Promise<string> {
	const key = await getJwtKey(secret);

	return new SignJWT({ sub: encryptedToken })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(`${expiryHours}h`)
		.sign(key);
}

/**
 * Verifies a JWT and extracts the embedded encrypted token from the `sub` claim.
 * Also checks the `exp` claim automatically — jose rejects expired tokens.
 *
 * @param jwt - The signed JWT string
 * @param secret - The signing secret (GITHUB_CLIENT_SECRET)
 * @returns The verified payload containing the encrypted token in `sub`
 * @throws If the JWT is invalid, expired, or tampered with
 */
export async function verifyToken(
	jwt: string,
	secret: string
): Promise<TokenPayload> {
	const key = await getJwtKey(secret);
	const { payload } = await jwtVerify(jwt, key, {
		algorithms: ['HS256'],
	});
	return payload as TokenPayload;
}
