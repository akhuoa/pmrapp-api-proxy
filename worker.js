/**
 * Cloudflare Worker to check if a COMBINE archive download URL exists and is accessible.
 *
 * URL parameters:
 * - exposureAlias: The alias of the exposure to construct the download URL.
 * - serverUrl: The base URL of the PMR server (e.g., https://models.physiomeproject.org).
 *
 * Security:
 * - Only allows requests from specific origins and localhost with pmrapp path.
 */

export default {
  async fetch(request, env, ctx) {
    // Security configuration
    const ALLOWED_KEYWORD = "pmrapp-frontend";
    const ALLOWED_ORIGINS = [
      "https://akhuoa.github.io",
      "https://physiome.github.io"
    ];

    const origin = request.headers.get("Origin") || "";
    const referer = request.headers.get("Referer") || "";
    let allowedOrigin = null;

    // Accept requests from explicitly allowed origins
    if (ALLOWED_ORIGINS.includes(origin)) {
      allowedOrigin = origin;
    }
    // For local development, allow if the referer includes the allowed keyword
    else if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      if (referer.includes(ALLOWED_KEYWORD)) {
        allowedOrigin = origin;
      }
    }

    // If the origin is not allowed, block the request immediately
    if (!allowedOrigin) {
      return new Response("Forbidden: Access Denied", { status: 403 });
    }

    // Handle CORS Preflight
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle browser preflight checks
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Get the target URL from the query string
    const url = new URL(request.url);
    const exposureAlias = url.searchParams.get("exposureAlias");
    // const targetUrl = url.searchParams.get("url"); // unused
    const serverUrl = url.searchParams.get("serverUrl");
    const shortURL = `${serverUrl}/e/${exposureAlias}/download_generated_omex`
    const longURL = `${serverUrl}/exposure/${exposureAlias}/download_generated_omex`

    if (!serverUrl) {
      return new Response("Missing serverUrl parameter", { status: 400, headers: corsHeaders });
    }

    if (!exposureAlias) {
      return new Response("Missing exposureAlias parameter", { status: 400, headers: corsHeaders });
    }

    // Define "Stealth" Headers
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Referer": new URL(serverUrl).origin + "/", // Sets the referer to the target's own domain
    };

    try {
      // Try short URL first
      let response = await fetch(shortURL, {
        method: "GET",
        headers: headers,
        redirect: "follow" // Follow redirects (e.g., http -> https)
      });

      // Try long URL if short URL fails
      if (!response.ok && longURL) {
        response = await fetch(longURL, {
          method: "GET",
          headers: headers,
          redirect: "follow" // Follow redirects (e.g., http -> https)
        });
      }

      if (!response.ok) return new Response("File not found", { status: 404 });

      // Build Response
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", origin);

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders
      });
    } catch (error) {
      return new Response("Worker Error", { status: 500 });
    }

    ////// Unused /////
    /*
    try {
      // Try a lightweight HEAD request first
      let response = await fetch(targetUrl, {
        method: "HEAD",
        headers: headers,
        redirect: "follow" // Follow redirects (e.g., http -> https)
      });

      // If HEAD fails with 404, 403, or 405, the server might be blocking HEAD requests.
      // Try a GET request for just the first byte (Range request)
      if (!response.ok) {
        // Add Range header to download only 1 byte
        const rangeHeaders = { ...headers, "Range": "bytes=0-0" };

        response = await fetch(targetUrl, {
            method: "GET",
            headers: rangeHeaders,
            redirect: "follow"
        });
      }

      // Check if successful (200-299)
      const exists = response.ok || response.status === 206; // 206 = Partial Content (success for Range requests)

      return new Response(
        JSON.stringify({
          exists: exists,
          status: response.status,
          contentType: response.headers.get("content-type"),
          actualUrl: response.url // Useful to see if it redirected
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      return new Response(JSON.stringify({ exists: false, error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }
    */
    ///// End of Unused /////
  }
};
