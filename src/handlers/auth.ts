import { Env, GitHubEmail } from '../types';
import { decryptToken, encryptToken } from '../utils/crypto';

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
		// Read the encrypted token from either Authorization header or JSON body
		const authHeader = request.headers.get('Authorization') || '';
		let encryptedToken: string | undefined;

		if (authHeader.startsWith('Bearer ')) {
			encryptedToken = authHeader.slice('Bearer '.length);
		} else if (
			request.headers.get('Content-Type')?.includes('application/json')
		) {
			const body = await request.json<{ access_token?: string }>();
			encryptedToken = body.access_token;
		}

		if (!encryptedToken) {
			return new Response(
				JSON.stringify({
					error: 'Missing token',
					detail: 'Send the encrypted token as Authorization: Bearer <token> or in the JSON body as { access_token: string }',
				}),
				{ status: 400, headers: jsonHeaders(allowedOrigin) },
			);
		}

		// Decrypt the token that was encrypted before sending to the frontend
		let access_token: string;
		try {
			access_token = await decryptToken(encryptedToken, env.GITHUB_CLIENT_SECRET);
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

		// Encrypt the GitHub access token so it's never exposed to the frontend in plaintext
		const encryptedToken = await encryptToken(
			tokenData.access_token,
			env.GITHUB_CLIENT_SECRET
		);

		return new Response(
			JSON.stringify({
				token: encryptedToken,
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
