import { Env, GitHubEmail } from '../types';
import { decryptToken, encryptToken } from '../utils/crypto';
import { signToken, verifyToken } from '../utils/jwt';

function corsHeaders(allowedOrigin: string) {
	return {
		'Access-Control-Allow-Origin': allowedOrigin,
		'Access-Control-Allow-Headers': 'Content-Type',
	};
}

function jsonHeaders(allowedOrigin: string) {
	return {
		'Content-Type': 'application/json',
		...corsHeaders(allowedOrigin),
	};
}

export async function handleRevoke(request: Request, env: Env, allowedOrigin: string): Promise<Response> {
	try {
		// Read the JWT from either Authorization header or JSON body
		const authHeader = request.headers.get('Authorization') || '';
		let jwt: string | undefined;

		if (authHeader.startsWith('Bearer ')) {
			jwt = authHeader.slice('Bearer '.length);
		} else if (
			request.headers.get('Content-Type')?.includes('application/json')
		) {
			const body = await request.json<{ access_token?: string }>();
			jwt = body.access_token;
		}

		if (!jwt) {
			return new Response(
				JSON.stringify({
					error: 'Missing token',
					detail: 'Send the JWT as Authorization: Bearer <token> or in the JSON body as { access_token: string }',
				}),
				{ status: 400, headers: jsonHeaders(allowedOrigin) },
			);
		}

		// Verify the JWT — this checks the signature AND the exp claim automatically.
		// If the token is expired, jose will throw and we catch it below.
		let encryptedToken: string;
		try {
			const payload = await verifyToken(jwt, env.GITHUB_CLIENT_SECRET);
			encryptedToken = payload.sub;
		} catch {
			return new Response(
				JSON.stringify({ error: 'Invalid, tampered, or expired token' }),
				{ status: 400, headers: jsonHeaders(allowedOrigin) },
			);
		}

		// Decrypt the GitHub access token from the encrypted payload
		let access_token: string;
		try {
			const decrypted = await decryptToken(encryptedToken, env.GITHUB_CLIENT_SECRET);
			const payload = JSON.parse(decrypted);
			access_token = payload.token;
		} catch {
			return new Response(JSON.stringify({ error: 'Invalid or tampered token' }), {
				status: 400,
				headers: jsonHeaders(allowedOrigin),
			});
		}

		// Revoke the GitHub access token
		// Docs: https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-token
		const revokeResponse = await fetch(
			`https://api.github.com/applications/${env.GITHUB_CLIENT_ID}/grant`,
			{
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/vnd.github+json',
					'User-Agent': 'cloudflare-worker-vue-app',
					'X-GitHub-Api-Version': '2026-03-10',
					Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
				},
				body: JSON.stringify({ access_token }),
			}
		);

		if (!revokeResponse.ok) {
			const errorBody = await revokeResponse.text();
			return new Response(
				JSON.stringify({ error: 'Failed to revoke token', details: errorBody }),
				{
					status: revokeResponse.status,
					headers: jsonHeaders(allowedOrigin),
				}
			);
		}

		return new Response(JSON.stringify({ success: true, message: 'Token revoked successfully' }), {
			status: 200,
			headers: jsonHeaders(allowedOrigin),
		});
	} catch (error: any) {
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: jsonHeaders(allowedOrigin),
		});
	}
}

export async function handleAuth(request: Request, env: Env, allowedOrigin: string): Promise<Response> {
	try {
		const { code } = await request.json<{ code: string }>();

		if (!code) {
			return new Response(JSON.stringify({ error: 'Missing code' }), {
				status: 400,
				headers: jsonHeaders(allowedOrigin),
			});
		}

		// Exchange the temporary code for a GitHub Access Token
		const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'User-Agent': 'cloudflare-worker-vue-app',
			},
			body: JSON.stringify({
				client_id: env.GITHUB_CLIENT_ID,
				client_secret: env.GITHUB_CLIENT_SECRET,
				code: code,
			}),
		});

		const tokenData = await tokenResponse.json<{ access_token?: string; error?: string }>();

		if (tokenData.error || !tokenData.access_token) {
			return new Response(JSON.stringify({ error: tokenData.error || 'Failed token exchange' }), {
				status: 400,
				headers: jsonHeaders(allowedOrigin),
			});
		}

		// Use the Access Token to get User Profile data
		const userResponse = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${tokenData.access_token}`,
				Accept: 'application/json',
				'User-Agent': 'cloudflare-worker-vue-app',
			},
		});

		// Response data and schema ref: docs.github.com/en/rest/users/users?apiVersion=2026-03-10
		const userData = await userResponse.json<{
			login: string;
			name: string;
			email: string | null;
			avatar_url: string
		}>();

		// Fallback check: If the user's email is private,
		// fetch it from the emails endpoint
		let finalEmail = userData.email;

		if (!finalEmail) {
			const emailResponse = await fetch('https://api.github.com/user/emails', {
				headers: {
					Authorization: `Bearer ${tokenData.access_token}`,
					Accept: 'application/json',
					'User-Agent': 'cloudflare-worker-vue-app',
				},
			});

			const emails = await emailResponse.json<GitHubEmail[]>();

			if (Array.isArray(emails) && emails.length > 0) {
				const primaryItem = emails.find((e) => e.primary);

				if (primaryItem) {
					finalEmail = primaryItem.email;
				} else {
					const firstItem = emails[0];
					finalEmail = firstItem ? firstItem.email : 'No email available';
				}
			} else {
				finalEmail = 'No email available';
			}
		}

		// Encrypt the GitHub access token with AES-GCM so it's never exposed to the frontend
		// in plaintext. Embed issued_at inside so the backend is the sole authority on expiry.
		const expiryHours = parseInt(env.TOKEN_EXPIRY_HOURS || '72', 10);
		const issuedAt = Date.now();
		const encryptedToken = await encryptToken(
			JSON.stringify({ token: tokenData.access_token, issued_at: issuedAt }),
			env.GITHUB_CLIENT_SECRET
		);

		// Wrap the encrypted token in a signed JWT with exp and iat claims.
		// The client can base64-decode the JWT payload to read exp locally,
		// but cannot tamper with it because the signature is verified server-side.
		const jwt = await signToken(encryptedToken, env.GITHUB_CLIENT_SECRET, expiryHours);

		return new Response(
			JSON.stringify({
				token: jwt,
				username: userData.login,
				name: userData.name || userData.login,
				email: finalEmail,
				avatar_url: userData.avatar_url,
			}),
			{
				headers: jsonHeaders(allowedOrigin),
			}
		);
	} catch (error: any) {
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: jsonHeaders(allowedOrigin),
		});
	}
}
