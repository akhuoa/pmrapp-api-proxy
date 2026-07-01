import { Env } from '../types';

export async function handleDownload(
	request: Request,
	env: Env,
	url: URL,
	corsHeaders: Record<string, string>
): Promise<Response> {
	const pathname = url.pathname;

	let exposureAlias = '';
	let workspaceAlias = '';
	let workspaceURL = '';
	let commitId = '';
	let format = 'zip';

	if (pathname === '/download/exposure') {
		exposureAlias = url.searchParams.get('alias') || '';
	} else if (pathname === '/download/workspace') {
		workspaceAlias = url.searchParams.get('alias') || '';
		workspaceURL = url.searchParams.get('workspaceURL') || '';
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
		if (workspaceURL) {
			workspaceURL = workspaceURL.replace(/\/+$/, ''); // Remove trailing slashes
			downloadUrl = `${workspaceURL}/@@archive/${commitId}/${format}`;
		} else {
			downloadUrl = `${env.MODELS_URL}/workspace/${workspaceAlias}/@@archive/${commitId}/${format}`;
		}
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
}
