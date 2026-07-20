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
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

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
