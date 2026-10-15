/**
 * Vercel Edge Function — HTTP Audio Stream Proxy
 * Proxies HTTP radio streams through HTTPS so browsers don't block them.
 * Usage: /api/stream?url=http://radio-stream-url
 */
export const config = { runtime: "edge" };

// Allowed domains — only Bangladesh radio streams
const ALLOWED_PATTERNS = [
  "digitalsynapsebd.com",
  "zeno.fm",
  "surfernetwork.com",
  "myradiostream.com",
  "streamcast.xyz",
  "radioking.com",
  "mellowbangla.com",
  "radiofoorti.fm",
  "dhakafm904.com",
  "spicefmbd.com",
  "sunplex.live",
  "jago.fm",
  "139.59.86.99",
  "118.179.219.244",
  "66.45.232.131",
  "as1.",
  "stream.",
  "radio.",
  "audio.",
  "live.",
  "listen.",
  "play.",
];

function isAllowed(url) {
  try {
    const parsed = new URL(url);
    return ALLOWED_PATTERNS.some(
      (p) => parsed.hostname.includes(p) || parsed.href.includes(p)
    );
  } catch {
    return false;
  }
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response("Missing ?url= parameter", { status: 400 });
  }

  if (!isAllowed(targetUrl)) {
    return new Response("URL not allowed", { status: 403 });
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent": "BanglaRadioApp/1.0",
        "Icy-MetaData": "1",
      },
    });

    const contentType =
      upstream.headers.get("Content-Type") ||
      upstream.headers.get("content-type") ||
      "audio/mpeg";

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Cache-Control": "no-cache, no-store",
        "X-Proxy": "BanglaRadio-EdgeProxy",
      },
    });
  } catch (err) {
    return new Response(`Stream error: ${err.message}`, { status: 502 });
  }
}
