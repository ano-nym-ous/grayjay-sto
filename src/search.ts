// Search: only series (as channels/creators) are returned.
//
// Primary endpoint (new serienstream.to layout):
//   GET {base}/api/search/suggest?term=<q>  ->  { "shows": [ { name, url } ] }
// Fallback (classic layout):
//   POST {base}/ajax/search  (keyword=<q>)  ->  [ { title/name, link } ]

import { PLATFORM, USER_AGENT } from "./constants";
import { getConfig } from "./state";
import { getBaseUrl, titleFromSlug } from "./helpers";
import { seriesSlugFromLink, seriesUrl } from "./urls";

interface SeriesResult {
    slug: string;
    name: string;
}

// Strip highlight tags / collapse whitespace from a result title.
function cleanName(name: string): string {
    return (name || "")
        .replace(/<\/?em>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function suggestSearch(query: string): SeriesResult[] {
    const url = `${getBaseUrl()}/api/search/suggest?term=${encodeURIComponent(
        query,
    )}`;
    const response = http.GET(
        url,
        {
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json",
        },
        false,
    );
    if (!response.isOk) return [];

    let data: any;
    try {
        data = JSON.parse(response.body);
    } catch (e) {
        return [];
    }

    const shows: any[] = (data && data.shows) || [];
    const out: SeriesResult[] = [];
    for (const show of shows) {
        const link: string = show.url || show.link || "";
        const slug = seriesSlugFromLink(link);
        if (!slug) continue;
        out.push({ slug, name: cleanName(show.name || show.title || "") });
    }
    return out;
}

function ajaxSearch(query: string): SeriesResult[] {
    const url = `${getBaseUrl()}/ajax/search`;
    const response = http.POST(
        url,
        `keyword=${encodeURIComponent(query)}`,
        {
            "User-Agent": USER_AGENT,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        false,
    );
    if (!response.isOk) return [];

    let data: any;
    try {
        data = JSON.parse(response.body);
    } catch (e) {
        return [];
    }

    if (!Array.isArray(data)) return [];
    const out: SeriesResult[] = [];
    const seen: { [slug: string]: boolean } = {};
    for (const entry of data) {
        const link: string = entry.link || entry.url || "";
        const slug = seriesSlugFromLink(link);
        if (!slug || seen[slug]) continue;
        seen[slug] = true;
        out.push({
            slug,
            name: cleanName(entry.title || entry.name || ""),
        });
    }
    return out;
}

export function searchChannels(query: string): ChannelPager {
    let results = suggestSearch(query);
    if (results.length === 0) {
        // Fall back to the classic endpoint if the suggest API returned nothing.
        results = ajaxSearch(query);
    }

    const authors = results.map(
        (r) =>
            new PlatformAuthorLink(
                new PlatformID(PLATFORM, r.slug, getConfig("id")),
                r.name || titleFromSlug(r.slug),
                seriesUrl(r.slug),
                // Fetching each poster here would cost one request per result;
                // left empty so search stays fast.
                "",
            ),
    );

    return new ChannelPager(authors as any, false, {});
}
