import {
    BASE_URL_OPTIONS,
    REPLACEMENTS,
    SITE_OPTIONS,
    USER_AGENT,
} from "./constants";
import { getSettings } from "./state";

// Resolve a dropdown setting that may arrive either as a selected index
// (Grayjay's normal behaviour) or as the literal option value.
function resolveOption(
    raw: unknown,
    options: readonly string[],
    fallback: string,
): string {
    if (raw === undefined || raw === null || raw === "") return fallback;

    // Literal value already present in the option list.
    if (typeof raw === "string" && options.indexOf(raw) !== -1) return raw;

    const index = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (!isNaN(index) && index >= 0 && index < options.length)
        return options[index];

    return fallback;
}

export function getSite(): string {
    return resolveOption(getSettings("site"), SITE_OPTIONS, SITE_OPTIONS[0]);
}

export function getBaseUrl(): string {
    return resolveOption(
        getSettings("baseUrl"),
        BASE_URL_OPTIONS,
        BASE_URL_OPTIONS[0],
    ).replace(/\/+$/, "");
}

// Build an absolute URL from a site-relative path.
export function absoluteUrl(path: string): string {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    // Protocol-relative ("//host/img.jpg").
    if (path.indexOf("//") === 0) {
        const scheme = getBaseUrl().indexOf("https") === 0 ? "https:" : "http:";
        return scheme + path;
    }
    return `${getBaseUrl()}/${path.replace(/^\/+/, "")}`;
}

export const DEFAULT_HEADERS: Record<string, string> = {
    "User-Agent": USER_AGENT,
};

// Markers that identify a Cloudflare "managed challenge" interstitial (the
// "click the box" / "Just a moment" page). These appear in the raw HTML body
// regardless of the mobile vs. desktop DOM parser, so we string-match instead
// of parsing. When present we hand control to Grayjay's captcha webview.
const CLOUDFLARE_MARKERS = [
    "Just a moment",
    "challenge-platform",
    "_cf_chl_opt",
    "__cf_chl",
    "cf-browser-verification",
    "challenges.cloudflare.com",
    "Enable JavaScript and cookies to continue",
];

function isCloudflareChallenge(body: string | undefined): boolean {
    if (!body) return false;
    for (const marker of CLOUDFLARE_MARKERS) {
        if (body.indexOf(marker) !== -1) return true;
    }
    return false;
}

// s.to protects hoster resolution with a Cloudflare Turnstile "redirect gate".
// Until the gate is cleared, `/r?t=<token>` returns a tiny "frameBridge" stub
// that carries NO hoster URL: it only `postMessage`s the token back to the
// parent page (which then shows the Turnstile). Loaded standalone it just
// bounces to the homepage, so it is a dead end for us -> treat it as a captcha.
function isRedirectGate(body: string | undefined): boolean {
    if (!body) return false;
    return (
        body.indexOf("frameBridge") !== -1 &&
        body.indexOf("postMessage") !== -1
    );
}

// True when the given thrown value is Grayjay's CaptchaRequiredException. Such
// exceptions must be re-thrown out of source methods (never swallowed) so the
// app opens its captcha webview. The runtime class sets `plugin_type`.
export function isCaptchaException(e: unknown): boolean {
    return (
        !!e &&
        typeof e === "object" &&
        (e as { plugin_type?: string }).plugin_type ===
            "CaptchaRequiredException"
    );
}

// Extract the target URL from a `<meta http-equiv="refresh" content="0;url=...">`
// tag, if present. s.to's `/r?t=<token>` endpoint (behind DDoS-Guard) answers
// with exactly such a stub instead of a JS redirect, and Grayjay's mobile HTTP
// client does not auto-follow it, so we must chase it ourselves.
function findMetaRefreshUrl(body: string | undefined): string | null {
    if (!body) return null;
    const match = body.match(
        /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["'][^"']*?url=['"]?([^'"\s>]+)/i,
    );
    if (!match) return null;
    // The captured URL may carry a trailing quote or HTML entities.
    return match[1].replace(/&amp;/g, "&").replace(/['"]+$/, "");
}

// Some hoster redirect stubs also use an HTTP `Location` header (302). Grayjay
// usually follows these automatically, but fall back to it if it doesn't.
function findLocationHeader(
    headers: Record<string, string> | undefined,
): string | null {
    if (!headers) return null;
    for (const key in headers) {
        if (key.toLowerCase() === "location") {
            const value = headers[key];
            return value ? String(value) : null;
        }
    }
    return null;
}

// GET a URL and throw on a non-2xx response, returning the raw body.
// Follows meta-refresh / Location redirects (the s.to `/r?t=` hoster redirects).
// If Cloudflare/DDoS-Guard throws a managed challenge, raise a
// CaptchaRequiredException so Grayjay opens the captcha webview; after the user
// solves it the resulting clearance cookie is auto-injected on retry.
export function fetchAndValidate(
    url: string,
    headers?: Record<string, string>,
): string {
    let currentUrl = url;

    // Bounded redirect chain: `/r?t=` stub -> hoster embed is a single hop, but
    // allow a few in case a hoster bounces again.
    for (let hop = 0; hop < 5; hop++) {
        const response = http.GET(
            currentUrl,
            { ...DEFAULT_HEADERS, ...(headers || {}) },
            false,
        );
        const cf = isCloudflareChallenge(response.body);
        const gate = isRedirectGate(response.body);
        const bodyLen = response.body ? response.body.length : 0;
        log(
            `s.to fetch ${currentUrl} -> code=${response.code} isOk=${response.isOk} ` +
            `len=${bodyLen} cloudflareChallenge=${cf} redirectGate=${gate}`,
        );

        if (!response.isOk) {
            if (cf) {
                log(`s.to: Cloudflare challenge on non-2xx (${response.code}); throwing CaptchaRequiredException for ${currentUrl}`);
                throw new CaptchaRequiredException(currentUrl, response.body);
            }
            log(`s.to: request failed body snippet: ${(response.body || "").slice(0, 300)}`);
            throw new ScriptException(
                `Request failed (${response.code}): ${currentUrl}`,
            );
        }
        // Cloudflare/DDoS-Guard sometimes serve a challenge with a 200 status.
        if (cf) {
            log(`s.to: Cloudflare challenge on 200; throwing CaptchaRequiredException for ${currentUrl}`);
            throw new CaptchaRequiredException(currentUrl, response.body);
        }
        // Turnstile redirect gate: no usable URL in the body, must be solved.
        // Throw WITHOUT a body so Grayjay loads the (episode) URL live instead
        // of rendering this dead-end stub; content.ts re-throws with the real
        // episode URL so the webview lands somewhere the gate can be solved.
        if (gate) {
            log(`s.to: Turnstile redirect gate detected for ${currentUrl}; throwing CaptchaRequiredException`);
            throw new CaptchaRequiredException(currentUrl);
        }

        // Follow redirect stubs (s.to `/r?t=` -> hoster embed URL).
        const nextUrl =
            findMetaRefreshUrl(response.body) ||
            findLocationHeader(response.headers);
        if (nextUrl && nextUrl !== currentUrl) {
            log(`s.to: following redirect ${currentUrl} -> ${nextUrl}`);
            currentUrl = nextUrl;
            continue;
        }

        return response.body;
    }

    throw new ScriptException(`Too many redirects starting at: ${url}`);
}

// Fetch a site-relative path and return the parsed <html> root node.
export function getHtmlRoot(path: string): DOMNode {
    const webContent = fetchAndValidate(absoluteUrl(path));
    return domParser.parseFromString(webContent).getElementsByTagName("html")[0];
}

// Fetch an absolute URL and return the parsed <html> root node.
export function getHtmlRootFromUrl(
    url: string,
    headers?: Record<string, string>,
): DOMNode {
    const webContent = fetchAndValidate(url, headers);
    return domParser.parseFromString(webContent).getElementsByTagName("html")[0];
}

// Turn a human-readable title into the site's URL slug.
// Mirrors `Extensions.ToRelativePath` from the C# reference.
export function getRelativePath(text: string): string {
    let result = "";
    let lastWasDash = false;

    for (const char of text.toLowerCase()) {
        if (REPLACEMENTS.has(char)) continue;

        if (char === " ") {
            if (!lastWasDash) {
                result += "-";
                lastWasDash = true;
            }
            continue;
        }
        if (char === "ß") {
            result += "ss";
            lastWasDash = false;
            continue;
        }
        result += char;
        lastWasDash = false;
    }

    return result;
}

// Human-readable title from a slug, e.g. "the-rookie" -> "The Rookie".
export function titleFromSlug(slug: string): string {
    return slug
        .split("-")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}
