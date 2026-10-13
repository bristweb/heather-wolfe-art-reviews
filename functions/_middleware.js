// Serves files only to sites listed in config.json "allowed_origins".
// Entries are hostnames; "*.example.com" also matches subdomains.
// Requests with no Origin/Referer (direct visits, crawlers) are allowed.
const ALWAYS = ["localhost", "127.0.0.1"];

let cached;
async function allowlist(context) {
  if (!cached) {
    try {
      const url = new URL("/config.json", context.request.url);
      const res = await context.env.ASSETS.fetch(url);
      cached = (await res.json()).allowed_origins || [];
    } catch { cached = []; }
  }
  return cached;
}

function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
}

function matches(host, list) {
  return list.some((entry) => {
    entry = String(entry).toLowerCase();
    if (entry.startsWith("*.")) return host.endsWith(entry.slice(1));
    return host === entry;
  });
}

export async function onRequest(context) {
  const { request } = context;
  const origin = request.headers.get("Origin");
  const caller = hostOf(origin || request.headers.get("Referer") || "");
  const self = new URL(request.url).hostname;

  if (caller && caller !== self && !matches(caller, [...ALWAYS, ...(await allowlist(context))])) {
    return new Response("Forbidden", { status: 403, headers: { "Vary": "Origin, Referer" } });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(origin) });
  }
  const res = await context.next();
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(cors(origin))) out.headers.set(k, v);
  out.headers.append("Vary", "Origin, Referer");
  return out;
}

function cors(origin) {
  if (!origin || origin === "null") return { "Access-Control-Allow-Origin": "*" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}
