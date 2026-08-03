// Static configuration and lookup tables for the s.to plugin.

export const PLATFORM = "s.to";

// Values for the `site` dropdown setting (index -> value).
export const SITE_OPTIONS = ["serie", "anime"] as const;

// Values for the `baseUrl` dropdown setting (index -> value).
export const BASE_URL_OPTIONS = [
    "https://s.to",
    "https://serienstream.to",
    "https://serienstream.cx",
    "https://aniworld.to",
    "http://186.2.175.5",
] as const;

// Browser-like user agent. The site returns different / blocked markup for
// unknown agents, so we mirror what the reference C# client sends.
export const USER_AGENT =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

// Characters stripped when turning a human title into a URL slug.
// Mirrors `Extensions.ToRelativePath` from the C# reference.
export const REPLACEMENTS = new Set([
    ":", ",", "(", ")", "~", ".", "&", "'", "+", "!", "ü", "ä", "ö",
]);

// Preferred ordering of hosters (first = default source in the player).
// HLS-capable VOE first, then the robust mp4 hosters.
export const HOSTER_ORDER = ["VOE", "Vidoza", "Streamtape", "Doodstream"];

// Doodstream stream URLs are resolved against this host (see DownloadClient.cs).
export const DOODSTREAM_HOST = "https://dood.li";

// s.to guards hoster resolution with a Cloudflare Turnstile "redirect gate".
// We solve it in Grayjay's captcha webview with a self-hosted Turnstile widget.
//
// Grayjay captures the cleared cookie at REQUEST time and completes when a
// request satisfies `completionUrl` AND all `cookiesToFind` are present. The
// site's own gate POSTs to `/r`, so using `/r` as the completion URL captures
// the pre-clearance session (before the POST response sets the cleared one).
// Instead, our injected page sets this marker cookie only AFTER it has POSTed
// `/r` and cleared the session; config.json requires this cookie (plus
// `laravel_session`) with `completionUrl: null`, so completion fires strictly
// after clearance and on ANY mirror domain. Keep this name in sync with
// `captcha.cookiesToFind` in config.json.
export const CAPTCHA_DONE_COOKIE = "gjdone";

// Fallback Turnstile sitekey (used if it can't be scraped from the page).
export const TURNSTILE_SITEKEY_FALLBACK = "0x4AAAAAAAFBfchmT6XFij7y";
