export interface Env {
	MODELS_URL: string;
	CORS_PROXY_API_URL: string;
	API_KEY?: string; // API_KEY is optional, just for server-to-server requests in production
	ALLOW_CORS_PROXY_URL_OVERRIDE: boolean;
	ALLOWED_ORIGINS: string; // List of allowed origins for browser requests in production
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	TOKEN_EXPIRY_HOURS?: string; // Token expiry in hours (e.g., "72" for 3 days, "168" for 7 days). Falls back to 72 if not set.
}

export interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
	visibility: string | null;
}
