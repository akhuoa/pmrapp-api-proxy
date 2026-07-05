import { Env } from '../types';

export async function handleCorsProxy(
	request: Request,
	env: Env,
	url: URL,
	allowedOrigin: string
): Promise<Response> {
	const remainingPath = url.pathname.slice('/cors-proxy'.length);
	const forwardedSearchParams = new URLSearchParams(url.searchParams);
	forwardedSearchParams.delete('target');
	const searchParams = forwardedSearchParams.toString();
	const fullPath = remainingPath + (searchParams ? '?' + searchParams : '');

	// Determine the target URL — the 'target' query param takes priority over the env fallback
	let targetUrl = url.searchParams.get('target');

	// If no 'target' query param, fall back to the configured default
	if (!targetUrl) {
		targetUrl = env.CORS_PROXY_API_URL;
	}

	console.log('targetUrl', targetUrl);

	if (!targetUrl) {
		return new Response(
			'Bad Request: No target URL provided and CORS_PROXY_API_URL not configured. Pass ?target=<url> or set CORS_PROXY_API_URL.',
			{ status: 400 }
		);
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

		console.log('proxyUrl', proxyUrl);
		console.log('proxyHeaders', Object.fromEntries(proxyHeaders.entries()));

		const proxyResponse = await fetch(proxyUrl, {
			method: request.method,
			headers: proxyHeaders,
			body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
			// Follow redirects server-side so the browser gets the final response with CORS headers.
			// This avoids infinite redirect loops and CORS issues from the redirect chain.
			redirect: 'follow',
		});

		const responseHeaders = new Headers(proxyResponse.headers);
		responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin);

		return new Response(proxyResponse.body, {
			status: proxyResponse.status,
			statusText: proxyResponse.statusText,
			headers: responseHeaders,
		});
	} catch (error) {
		console.error('CORS proxy fetch failed:', error);
		return new Response(`Failed to proxy the request: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
	}
}
