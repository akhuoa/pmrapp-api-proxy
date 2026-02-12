# pmrapp-download-proxy

A Cloudflare Worker that proxies file downloads from the PMR models service.

## Usage

### Request shape

The worker validates the request origin, constructs and fetches the download URL, then proxies the file to the client.

1. COMBINE archive download
   - `exposureAlias` (required)
   - The worker tries two URLs in sequence:
     - `/e/{exposureAlias}/download_generated_omex` (short form)
     - `/exposure/{exposureAlias}/download_generated_omex` (long form, fallback)

2. Workspace archive download
   - `workspaceAlias` (required)
   - `commitId` (required)
   - `format` (`zip` or `tgz`, defaults to `zip`)

If neither parameter set is provided, the worker returns `400 Bad Request`.

### CORS behavior

Requests are only allowed when the `Origin` header matches one of the configured allowlisted origins. Otherwise the worker returns `403 Forbidden`.

Allowlisted origins are defined in [src/config.ts](src/config.ts).

### Examples

COMBINE archive download:

```bash
curl -L "http://localhost:8787/?exposureAlias=EXPOSURE_ALIAS"
```

Workspace archive download (zip):

```bash
curl -L "http://localhost:8787/?workspaceAlias=WORKSPACE_ALIAS&commitId=COMMIT_ID&format=zip"
```

Workspace archive download (tgz):

```bash
curl -L "http://localhost:8787/?workspaceAlias=WORKSPACE_ALIAS&commitId=COMMIT_ID&format=tgz"
```

### Notes

- Preflight requests are handled with `OPTIONS` and return the appropriate CORS headers.
- The worker streams the upstream response body directly to the client.
