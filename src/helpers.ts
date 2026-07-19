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

// GET a URL and throw on a non-2xx response, returning the raw body.
export function fetchAndValidate(
    url: string,
    headers?: Record<string, string>,
): string {
    const response = http.GET(
        url,
        { ...DEFAULT_HEADERS, ...(headers || {}) },
        false,
    );
    if (!response.isOk) {
        throw new ScriptException(
            `Request failed (${response.code}): ${url}`,
        );
    }
    return response.body;
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
