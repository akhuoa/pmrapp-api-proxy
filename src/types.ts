export interface Env {
	MODELS_URL: string;
	CORS_PROXY_API_URL: string;
	API_KEY?: string; // API_KEY is optional, just for server-to-server requests in production
	ALLOW_CORS_PROXY_URL_OVERRIDE: boolean;
	ALLOWED_ORIGINS: string; // List of allowed origins for browser requests in production
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
}

export interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
	visibility: string | null;
}
