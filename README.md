# pmrapp-api-proxy

A multi-purpose API proxy for the PMR app, currently providing a download proxy service and a generic API proxy.

## Usage

### Request shape

The worker uses path-based routing to handle incoming requests:

#### 1. COMBINE archive

Path: `/download/exposure`

Downloads a COMBINE archive for an exposure.

**Query parameters:**
- `alias` (required) - The exposure identifier

The worker tries two upstream URLs in sequence:
- `/e/{alias}/download_generated_omex` (short form)
- `/exposure/{alias}/download_generated_omex` (long form, fallback)

#### 2. Workspace archive

Path: `/download/workspace`

Downloads a workspace archive.

**Query parameters:**
- `alias` (required) - The workspace identifier
- `commitId` (required) - The commit identifier
- `format` - Archive format: `zip` or `tgz` (defaults to `zip`)

#### 3. CORS Proxy

Path: `/cors-proxy/*`

Proxies requests to a configured API endpoint, passing through all HTTP methods, headers, and request bodies.

**Configuration:**
- Set `CORS_PROXY_API_URL` in the environment.
- By default, URL override is disabled. To enable it, set `ALLOW_CORS_PROXY_URL_OVERRIDE = true` in [src/config.ts](src/config.ts)

**Usage:**

```
GET|POST|PUT|DELETE /cors-proxy/path/to/endpoint?param=value
```

The request is forwarded to `{CORS_PROXY_API_URL}/path/to/endpoint?param=value` with all headers and body preserved.

If `ALLOW_CORS_PROXY_URL_OVERRIDE` is enabled, you can override the target URL with a `target` query parameter.

If required parameters are missing, the worker returns `400 Bad Request`.

### Authentication

The worker uses a hybrid authentication model to ensure security and flexibility:

**1. Browser-based Requests**
- **Method:** Origin Validation
- **How it works:** Requests from a browser are only allowed if their `Origin` header matches an entry in the `ALLOWED_ORIGINS` list in `src/config.ts`. This is secure for client-side use as no secrets are exposed.
- **Use Case:** Your trusted front-end applications.

**2. Server-to-Server Requests**
- **Method:** API Key
- **How it works:** Requests that do not have an `Origin` header (e.g., from `curl` or a backend service) **must** include a valid secret key in the `X-API-Key` header.
- **Use Case:** Backend services, scripts, or `curl` commands.

**3. Local Development (`npm run dev`)**
- **Method:** None
- **How it works:** No authentication is required when running the worker locally. All requests are permitted to simplify development.

**Configuration:**
- **Allowed Origins:** Add your website domains to the `ALLOWED_ORIGINS` array in `src/config.ts`.
- **API Key:** Set your secret `API_KEY` in your production environment (e.g., using `wrangler secret put API_KEY`).

### Examples

#### Local Development (`npm run dev`)

In the local environment, requests are made to `http://localhost:8787` and do not require an API key.

**COMBINE archive download:**
```bash
curl -L "http://localhost:8787/download/exposure?alias=EXPOSURE_ALIAS"
```

**Workspace archive download (zip):**
```bash
curl -L "http://localhost:8787/download/workspace?alias=WORKSPACE_ALIAS&commitId=COMMIT_ID&format=zip"
```

**CORS proxy GET request:**
```bash
curl -L "http://localhost:8787/cors-proxy/api/users?id=123"
```

#### Production (Deployed Worker)

In the production environment, requests are made to your worker's URL (e.g., `https://pmrapp-api-proxy.[name].workers.dev`) and **must** include your secret API key in the `X-API-Key` header.

**COMBINE archive download:**
```bash
curl -L "https://pmrapp-api-proxy.[name].workers.dev/download/exposure?alias=EXPOSURE_ALIAS" \
  -H "X-API-Key: YOUR_SECRET_KEY"
```

**Workspace archive download (zip):**
```bash
curl -L "https://pmrapp-api-proxy.[name].workers.dev/download/workspace?alias=WORKSPACE_ALIAS&commitId=COMMIT_ID&format=zip" \
  -H "X-API-Key: YOUR_SECRET_KEY"
```

**CORS proxy GET request:**
```bash
curl -L "https://pmrapp-api-proxy.[name].workers.dev/cors-proxy/api/users?id=123" \
  -H "X-API-Key: YOUR_SECRET_KEY"
```

**CORS proxy POST request:**
```bash
curl -X POST "https://pmrapp-api-proxy.[name].workers.dev/cors-proxy/api/data" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_SECRET_KEY" \
  -d '{"key": "value"}'
```

**TypeScript `fetch` example:**
```typescript
async function fetchFromWorker() {
  const workerUrl = 'https://pmrapp-api-proxy.[name].workers.dev/cors-proxy/api/data';

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key: 'value' }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Success:', data);
    return data;
  } catch (error) {
    console.error('Error fetching from worker:', error);
  }
}
```

### Notes

- Preflight requests are handled with `OPTIONS` and return the appropriate CORS headers.
- The worker streams the upstream response body directly to the client.
- All HTTP methods (GET, HEAD, POST, PUT, DELETE, PATCH) are supported on the CORS proxy path.
