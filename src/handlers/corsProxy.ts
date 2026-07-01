import { Env } from '../types';

export async function handleCorsProxy(
	request: Request,
	env: Env,
	url: URL,
	allowedOrigin: string
): Promise<Response> {
	const remainingPath = url.pathname.slice('/cors-proxy'.length);
	const searchParams = url.searchParams.toString();
	const fullPath = remainingPath + (searchParams ? '?' + searchParams : '');

	let targetUrl = env.CORS_PROXY_API_URL;

	// Check if URL override is allowed and provided
	if (env.ALLOW_CORS_PROXY_URL_OVERRIDE) {
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
