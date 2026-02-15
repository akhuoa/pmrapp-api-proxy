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

import { ALLOWED_ORIGINS, ALLOW_CORS_PROXY_URL_OVERRIDE } from './config';

interface Env {
	MODELS_URL: string;
	CORS_PROXY_API_URL: string;
	API_KEY?: string; // API_KEY is optional, just for server-to-server requests in production
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const origin = request.headers.get('Origin'); // Can be null
		const apiKey = request.headers.get('X-API-Key');
		const isDevelopment = !env.API_KEY; // API_KEY is only defined in production

		let isAllowed = false;

		if (isDevelopment) {
			// In development, allow all requests
			isAllowed = true;
		} else if (origin && ALLOWED_ORIGINS.includes(origin)) {
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
			'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
		};

		// Handle browser preflight checks
		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		const url = new URL(request.url);
		const pathname = url.pathname;

		// CORS Proxy path
		if (pathname.startsWith('/cors-proxy')) {
			const remainingPath = pathname.slice('/cors-proxy'.length);
			const searchParams = url.searchParams.toString();
			const fullPath = remainingPath + (searchParams ? '?' + searchParams : '');

			let targetUrl = env.CORS_PROXY_API_URL;

			// Check if URL override is allowed and provided
			if (ALLOW_CORS_PROXY_URL_OVERRIDE) {
				const overrideUrl = url.searchParams.get('target');
				if (overrideUrl) {
					targetUrl = overrideUrl;
				}
			}

			if (!targetUrl) {
				return new Response('Bad Request: CORS_PROXY_API_URL not configured!', { status: 400 });
			}

			const proxyUrl = targetUrl.replace(/\/$/, '') + fullPath;

			try {
				// Create headers from the original request
				const proxyHeaders = new Headers(request.headers);

				// Change origin: set the Host header to match the target API
				const targetUrlObj = new URL(targetUrl);
				proxyHeaders.set('Host', targetUrlObj.host);

				// Remove or rewrite headers that might cause the upstream server to reject the request
				proxyHeaders.delete('Origin');
				proxyHeaders.delete('Referer');

				const proxyResponse = await fetch(proxyUrl, {
					method: request.method,
					headers: proxyHeaders,
					body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
					redirect: 'manual', // Manually handle redirects
				});

				const responseHeaders = new Headers(proxyResponse.headers);
				responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin);

				// Handle redirects by rewriting the Location header
				if ([301, 302, 307, 308].includes(proxyResponse.status)) {
					const location = proxyResponse.headers.get('Location');
					if (location) {
						const targetUrlObj = new URL(targetUrl);
						const locationUrl = new URL(location, targetUrlObj.origin); // Ensure location is absolute
						const newLocation = `/cors-proxy${locationUrl.pathname}${locationUrl.search}`;
						responseHeaders.set('Location', newLocation);
					}
				}

				return new Response(proxyResponse.body, {
					status: proxyResponse.status,
					statusText: proxyResponse.statusText,
					headers: responseHeaders,
				});
			} catch (error) {
				return new Response('Failed to proxy the request!', { status: 500 });
			}
		}

		// Download paths
		let exposureAlias = '';
		let workspaceAlias = '';
		let commitId = '';
		let format = 'zip';

		if (pathname === '/download/exposure') {
			exposureAlias = url.searchParams.get('alias') || '';
		} else if (pathname === '/download/workspace') {
			workspaceAlias = url.searchParams.get('alias') || '';
			commitId = url.searchParams.get('commitId') || '';
			format = url.searchParams.get('format') || 'zip';
		} else {
			return new Response('Not Found: Invalid endpoint!', { status: 404 });
		}

		let downloadUrl = ''; // for workspace
		let downloadUrlShort = ''; // for exposure (COMBINE archive)
		let downloadUrlLong = ''; // for exposure (COMBINE archive)

		if (exposureAlias) {
			downloadUrlShort = `${env.MODELS_URL}/e/${exposureAlias}/download_generated_omex`;
			downloadUrlLong = `${env.MODELS_URL}/exposure/${exposureAlias}/download_generated_omex`;
		} else if (workspaceAlias && commitId) {
			downloadUrl = `${env.MODELS_URL}/workspace/${workspaceAlias}/@@archive/${commitId}/${format}`;
		} else {
			return new Response('Bad Request: Missing parameters!', { status: 400 });
		}

		if (exposureAlias) {
			let response = await fetch(downloadUrlShort);
			if (!response.ok) {
				response = await fetch(downloadUrlLong);
			}
			if (!response.ok) {
				return new Response('Failed to fetch the file!', { status: 500 });
			}
			return new Response(response.body, { headers: corsHeaders });
		} else {
			const response = await fetch(downloadUrl);
			if (!response.ok) {
				return new Response('Failed to fetch the file!', { status: 500 });
			}
			return new Response(response.body, { headers: corsHeaders });
		}
  },
} satisfies ExportedHandler<Env>;
