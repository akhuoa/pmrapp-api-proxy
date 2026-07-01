import { Env, GitHubEmail } from '../types';

export async function handleAuth(request: Request, env: Env): Promise<Response> {
	try {
		const { code } = await request.json<{ code: string }>();

		if (!code) {
			return new Response(JSON.stringify({ error: 'Missing code' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// 1. Exchange the temporary code for a GitHub Access Token
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
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// 2. Use the Access Token to get User Profile data
		const userResponse = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${tokenData.access_token}`,
				Accept: 'application/json',
				'User-Agent': 'cloudflare-worker-vue-app',
			},
		});

		const userData = await userResponse.json<{ login: string; name: string; email: string | null }>();

		// 3. Fallback check: If the user's email is private, fetch it from the emails endpoint
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

		// 4. Return the clean data back to your Vue app
		return new Response(
			JSON.stringify({
				token: 'test_token', // You might want to generate a JWT or some other token here
				username: userData.login,
				name: userData.name || userData.login,
				email: finalEmail,
			}),
			{
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			}
		);
	} catch (error: any) {
		return new Response(JSON.stringify({ error: error.message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}
