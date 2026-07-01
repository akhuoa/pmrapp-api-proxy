/**
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import { Env } from './types';
import { handleAuth } from './handlers/auth';
import { handleCorsProxy } from './handlers/corsProxy';
import { handleDownload } from './handlers/download';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const origin = request.headers.get('Origin'); // Can be null
		const apiKey = request.headers.get('X-API-Key');
		const isDevelopment = !env.API_KEY; // API_KEY is only defined in production
		const allowedOrigins = env.ALLOWED_ORIGINS.split(',');

		let isAllowed = false;

		if (isDevelopment) {
			// In development, allow all requests
			isAllowed = true;
		} else if (allowedOrigins.some((h) => origin?.endsWith(h))) {
			// In production, allow requests from whitelisted browser origins
			isAllowed = true;
		} else if (!origin && apiKey === env.API_KEY) {
			// In production, allow server-to-server requests with a valid API key
			isAllowed = true;
		}

		if (!isAllowed) {
			return new Response('Forbidden: Access Denied', { status: 403 });
		}

		const allowedOrigin = origin || '*';
		const corsHeaders = {
			'Access-Control-Allow-Origin': allowedOrigin,
			'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST, PUT, DELETE, PATCH',
			'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization',
		};

		// Handle browser preflight checks
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(request.url);
		const pathname = url.pathname;

		if (request.method === 'POST' && pathname === '/api/auth') {
			return handleAuth(request, env);
		}

		if (pathname.startsWith('/cors-proxy')) {
			return handleCorsProxy(request, env, url, allowedOrigin);
		}

		if (pathname.startsWith('/download/')) {
			return handleDownload(request, env, url, corsHeaders);
		}

		return new Response('Not Found: Invalid endpoint!', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
