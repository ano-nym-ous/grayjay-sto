// Hoster stream-URL extractors, ported from the C# `DownloadClient.cs` reference.
//
// Each extractor takes the site's `/redirect/...` URL (which lands on a hoster
// embed page) and returns the final playable stream URL. VOE serves HLS; the
// other three serve MP4. Everything here is synchronous: `http.GET` blocks and
// there is no async/await in the Grayjay V8 sandbox.

import { fetchAndValidate, getHtmlRootFromUrl } from "./helpers";
import { DOODSTREAM_HOST } from "./constants";

export interface ResolvedStream {
    url: string;
    type: "hls" | "mp4";
    // Extra headers required at PLAYBACK time (e.g. Doodstream's Referer check).
    headers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Base64 + UTF-8 decoding (no atob/Buffer/TextDecoder in the sandbox)
// ---------------------------------------------------------------------------

const BASE64_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Reverse lookup: char code -> 6-bit value (-1 for non-alphabet characters).
const BASE64_LOOKUP: number[] = (() => {
    const table: number[] = [];
    for (let i = 0; i < 256; i++) table[i] = -1;
    for (let i = 0; i < BASE64_ALPHABET.length; i++) {
        table[BASE64_ALPHABET.charCodeAt(i)] = i;
    }
    return table;
})();

// Decode standard base64 into a raw byte array. Padding ('=') and stray
// whitespace / non-alphabet characters are ignored.
function base64DecodeToBytes(input: string): number[] {
    const bytes: number[] = [];
    let buffer = 0;
    let bitsCollected = 0;

    for (let i = 0; i < input.length; i++) {
        const value = BASE64_LOOKUP[input.charCodeAt(i)];
        if (value === -1) continue; // skip '=', newlines, etc.

        buffer = (buffer << 6) | value;
        bitsCollected += 6;

        if (bitsCollected >= 8) {
            bitsCollected -= 8;
            bytes.push((buffer >> bitsCollected) & 0xff);
        }
    }

    return bytes;
}

// Interpret a byte array as UTF-8 and produce a JS string. Handles 1–4 byte
// sequences; malformed bytes are emitted as-is to stay robust.
function utf8BytesToString(bytes: number[]): string {
    let result = "";
    let i = 0;

    while (i < bytes.length) {
        const byte1 = bytes[i++];

        if (byte1 < 0x80) {
            result += String.fromCharCode(byte1);
        } else if (byte1 >= 0xc0 && byte1 < 0xe0) {
            const byte2 = bytes[i++] & 0x3f;
            result += String.fromCharCode(((byte1 & 0x1f) << 6) | byte2);
        } else if (byte1 >= 0xe0 && byte1 < 0xf0) {
            const byte2 = bytes[i++] & 0x3f;
            const byte3 = bytes[i++] & 0x3f;
            result += String.fromCharCode(
                ((byte1 & 0x0f) << 12) | (byte2 << 6) | byte3,
            );
        } else if (byte1 >= 0xf0) {
            const byte2 = bytes[i++] & 0x3f;
            const byte3 = bytes[i++] & 0x3f;
            const byte4 = bytes[i++] & 0x3f;
            let codePoint =
                ((byte1 & 0x07) << 18) |
                (byte2 << 12) |
                (byte3 << 6) |
                byte4;
            // Encode as a UTF-16 surrogate pair.
            codePoint -= 0x10000;
            result += String.fromCharCode(
                0xd800 + (codePoint >> 10),
                0xdc00 + (codePoint & 0x3ff),
            );
        } else {
            // Lone continuation byte — emit verbatim.
            result += String.fromCharCode(byte1);
        }
    }

    return result;
}

// Convenience: base64 -> UTF-8 string.
function base64DecodeToString(input: string): string {
    return utf8BytesToString(base64DecodeToBytes(input));
}

// ---------------------------------------------------------------------------
// VOE string transforms (plain JS-string / char-code operations)
// ---------------------------------------------------------------------------

// ROT13 for [A-Za-z]; every other character is left untouched.
function shiftLetters(text: string): string {
    let result = "";
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code >= 65 && code <= 90) {
            result += String.fromCharCode(((code - 65 + 13) % 26) + 65);
        } else if (code >= 97 && code <= 122) {
            result += String.fromCharCode(((code - 97 + 13) % 26) + 97);
        } else {
            result += String.fromCharCode(code);
        }
    }
    return result;
}

// Replace each known junk marker with "_" (the caller then strips all "_").
const VOE_JUNK_PARTS = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
function replaceJunk(text: string): string {
    let result = text;
    for (const part of VOE_JUNK_PARTS) {
        result = result.split(part).join("_");
    }
    return result;
}

// Subtract `shift` from every char code.
function shiftBack(text: string, shift: number): string {
    let result = "";
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) - shift);
    }
    return result;
}

function reverse(text: string): string {
    return text.split("").reverse().join("");
}

// ---------------------------------------------------------------------------
// VOE
// ---------------------------------------------------------------------------

// The VOE embed hides the stream URL behind a multi-stage obfuscation chain.
// Primary path (application/json blob):
//   1. trim, then drop the first 2 and last 2 characters
//   2. ROT13 the letters
//   3. strip junk markers ("@$", "^^", ...) and remove all "_"
//   4. base64-decode -> UTF-8
//   5. subtract 3 from every char code
//   6. reverse the string, then base64-decode -> UTF-8
//   7. JSON parse and read `.source`
export function getVoeStreamUrl(redirectUrl: string): ResolvedStream {
    let videoUrl = redirectUrl;
    let webContent = fetchAndValidate(videoUrl);

    // Some VOE pages bounce via `window.location.href = '...'` before the real
    // embed. Follow that hop if present.
    const redirectMatch = webContent.match(
        /window\.location\.href\s*=\s*'([^']*)'/,
    );
    let root: DOMNode;
    if (redirectMatch) {
        videoUrl = redirectMatch[1];
        root = getHtmlRootFromUrl(videoUrl);
        webContent = root.innerHTML;
    } else {
        root = domParser
            .parseFromString(webContent)
            .getElementsByTagName("html")[0];
    }

    // Primary: <script type="application/json"> obfuscated blob.
    const scriptNode = root
        ? root.querySelector('script[type="application/json"]')
        : null;
    if (scriptNode) {
        try {
            let encoded = (scriptNode.textContent || "").trim();
            if (encoded.length > 4) {
                encoded = encoded.slice(2, encoded.length - 2);
            }
            let decoded = shiftLetters(encoded);
            decoded = replaceJunk(decoded).split("_").join("");
            decoded = base64DecodeToString(decoded);
            decoded = shiftBack(decoded, 3);
            decoded = base64DecodeToString(reverse(decoded));

            const json = JSON.parse(decoded);
            if (json && typeof json.source === "string" && json.source) {
                return { url: json.source, type: "hls" };
            }
        } catch (e) {
            log(`VOE primary decode failed: ${e}`);
            // Fall through to the fallbacks below.
        }
    }

    // Fallback 1: `var a168c='<base64>'` -> reversed UTF-8 -> JSON.source
    const a168c = webContent.match(/var a168c='([^']+)'/);
    if (a168c) {
        try {
            const reversed = reverse(base64DecodeToString(a168c[1]));
            const json = JSON.parse(reversed);
            if (json && typeof json.source === "string" && json.source) {
                return { url: json.source, type: "hls" };
            }
        } catch (e) {
            log(`VOE fallback a168c failed: ${e}`);
        }
    }

    // Fallback 2: `'hls': '<base64>'`
    const hls = webContent.match(/'hls':\s*'([^']+)'/);
    if (hls) {
        const url = base64DecodeToString(hls[1]);
        if (url) return { url, type: "hls" };
    }

    throw new ScriptException(`VOE stream extraction failed: ${videoUrl}`);
}

// ---------------------------------------------------------------------------
// Vidoza
// ---------------------------------------------------------------------------

export function getVidozaStreamUrl(redirectUrl: string): ResolvedStream {
    const root = getHtmlRootFromUrl(redirectUrl);
    const source = root ? root.querySelector("#player source") : null;
    if (!source) {
        throw new ScriptException(
            `Vidoza stream extraction failed (no <source>): ${redirectUrl}`,
        );
    }
    const url = source.getAttribute("src");
    if (!url) {
        throw new ScriptException(
            `Vidoza stream extraction failed (empty src): ${redirectUrl}`,
        );
    }
    return { url, type: "mp4" };
}

// ---------------------------------------------------------------------------
// Streamtape
// ---------------------------------------------------------------------------

export function getStreamtapeStreamUrl(redirectUrl: string): ResolvedStream {
    let videoUrl = redirectUrl;

    // Normalise to an embed URL. If we didn't land on `/e/`, read the canonical
    // og:url from the page.
    if (videoUrl.indexOf("/e/") === -1) {
        const r = getHtmlRootFromUrl(videoUrl);
        const meta = r ? r.querySelector('meta[name="og:url"]') : null;
        const content = meta ? meta.getAttribute("content") : null;
        if (!content) {
            throw new ScriptException(
                `Streamtape stream extraction failed (no og:url): ${videoUrl}`,
            );
        }
        videoUrl = content;
    }

    // The `/v/` variant exposes the `norobotlink` script + hidden host div.
    const pageUrl = videoUrl.split("/e/").join("/v/");
    const html = fetchAndValidate(pageUrl);
    const root = domParser
        .parseFromString(html)
        .getElementsByTagName("html")[0];

    // document.getElementById('norobotlink').innerHTML = (...);  contains the token.
    const norobot = html.match(
        /document\.getElementById\('norobotlink'\)\.innerHTML = (.+);/,
    );
    if (!norobot) {
        throw new ScriptException(
            `Streamtape stream extraction failed (no norobotlink): ${pageUrl}`,
        );
    }
    const token = norobot[1].match(/token=([^&']+)/);
    if (!token) {
        throw new ScriptException(
            `Streamtape stream extraction failed (no token): ${pageUrl}`,
        );
    }

    const hostNode = root ? root.querySelector("#ideoooolink") : null;
    const hostUrl = hostNode ? (hostNode.textContent || "").trim() : "";
    if (!hostUrl) {
        throw new ScriptException(
            `Streamtape stream extraction failed (no host link): ${pageUrl}`,
        );
    }

    return {
        url: `https://${hostUrl}&token=${token[1]}&dl=1s`,
        type: "mp4",
    };
}

// ---------------------------------------------------------------------------
// Doodstream
// ---------------------------------------------------------------------------

const DOOD_RANDOM_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function doodRandomString(length: number): string {
    let result = "";
    for (let i = 0; i < length; i++) {
        const index = Math.floor(Math.random() * DOOD_RANDOM_CHARS.length);
        result += DOOD_RANDOM_CHARS.charAt(index);
    }
    return result;
}

export function getDoodstreamStreamUrl(redirectUrl: string): ResolvedStream {
    const root = getHtmlRootFromUrl(redirectUrl);
    if (!root) {
        throw new ScriptException(
            `Doodstream stream extraction failed (no page): ${redirectUrl}`,
        );
    }

    // Find the inline <script> that references the `/pass_md5/` endpoint.
    let js = "";
    const scripts = root.querySelectorAll("script");
    for (let i = 0; i < scripts.length; i++) {
        const text = scripts[i].textContent || "";
        if (text.indexOf("/pass_md5/") !== -1) {
            js = text;
            break;
        }
    }
    if (!js) {
        throw new ScriptException(
            `Doodstream stream extraction failed (no pass_md5 script): ${redirectUrl}`,
        );
    }

    const match = js.match(/\/pass_md5\/([^/]+\/[^']+)/);
    if (!match) {
        throw new ScriptException(
            `Doodstream stream extraction failed (no pass_md5 path): ${redirectUrl}`,
        );
    }
    const passMd5 = match[1];

    // The pass_md5 endpoint returns the CDN base URL; it requires the embed URL
    // as Referer.
    const streamBase = fetchAndValidate(
        `${DOODSTREAM_HOST}/pass_md5/${passMd5}`,
        { Referer: redirectUrl },
    ).trim();

    const expiry = Date.now();
    const url = `${streamBase}${doodRandomString(10)}?token=${passMd5}&expiry=${expiry}`;

    // The MP4 CDN also enforces the Referer at playback time.
    return {
        url,
        type: "mp4",
        headers: { Referer: redirectUrl },
    };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

// Resolve a stream URL for the given hoster (case-insensitive `data-provider-name`).
export function resolveStream(
    hoster: string,
    redirectUrl: string,
): ResolvedStream {
    switch ((hoster || "").trim().toLowerCase()) {
        case "voe":
            return getVoeStreamUrl(redirectUrl);
        case "vidoza":
            return getVidozaStreamUrl(redirectUrl);
        case "streamtape":
            return getStreamtapeStreamUrl(redirectUrl);
        case "doodstream":
            return getDoodstreamStreamUrl(redirectUrl);
        default:
            throw new ScriptException(`Unsupported hoster: ${hoster}`);
    }
}
