# pmrapp-download-proxy

A Cloudflare Worker that proxies file downloads from the PMR models service and provides CORS-protected API proxying.

## Usage

### Request shape

The worker accepts `GET` (and `HEAD`) requests using path-based routing:

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

### CORS behavior

Requests are only allowed when the `Origin` header matches one of the configured allowlisted origins. Otherwise the worker returns `403 Forbidden`.

Allowlisted origins are defined in [src/config.ts](src/config.ts).

### Examples

COMBINE archive download:

```bash
curl -L "http://localhost:8787/download/exposure?alias=EXPOSURE_ALIAS"
```

Workspace archive download (zip):

```bash
curl -L "http://localhost:8787/download/workspace?alias=WORKSPACE_ALIAS&commitId=COMMIT_ID&format=zip"
```

Workspace archive download (tgz):

```bash
curl -L "http://localhost:8787/download/workspace?alias=WORKSPACE_ALIAS&commitId=COMMIT_ID&format=tgz"
```

CORS proxy GET request:

```bash
curl -L "http://localhost:8787/cors-proxy/api/users?id=123"
```

CORS proxy POST request:

```bash
curl -X POST "http://localhost:8787/cors-proxy/api/data" \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

### Notes

- Preflight requests are handled with `OPTIONS` and return the appropriate CORS headers.
- The worker streams the upstream response body directly to the client.
- All HTTP methods (GET, HEAD, POST, PUT, DELETE, PATCH) are supported on the CORS proxy path.
