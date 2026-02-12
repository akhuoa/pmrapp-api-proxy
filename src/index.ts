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

import { ALLOWED_ORIGINS } from './config';

interface Env {
	MODELS_URL: string;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const origin = request.headers.get('Origin') || '';
		const url = new URL(request.url);
		const exposureAlias = url.searchParams.get('exposureAlias') || '';
		const workspaceAlias = url.searchParams.get('workspaceAlias') || '';
		const commitId = url.searchParams.get('commitId') || '';
		const format = url.searchParams.get('format') || 'zip'; // 'tgz' or 'zip'

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

		let allowedOrigin = null;

		if (ALLOWED_ORIGINS.includes(origin)) {
			allowedOrigin = origin;
		}

		if (!allowedOrigin) {
      return new Response('Forbidden: Access Denied!', { status: 403 });
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

		// Handle browser preflight checks
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
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
