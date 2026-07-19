// URL construction + parsing for series / seasons / episodes.
//
// Path layout (new serienstream.to layout, no "stream" segment):
//   series:  {base}/{site}/{slug}
//   season:  {base}/{site}/{slug}/staffel-{n}       (n >= 1)
//   movies:  {base}/{site}/{slug}/staffel-0
//   episode: {base}/{site}/{slug}/staffel-{n}/episode-{m}

import { getBaseUrl, getSite } from "./helpers";

export function seriesUrl(slug: string): string {
    return `${getBaseUrl()}/${getSite()}/${slug}`;
}

export function seasonUrl(slug: string, season: number): string {
    return `${getBaseUrl()}/${getSite()}/${slug}/staffel-${season}`;
}

export function episodeUrl(
    slug: string,
    season: number,
    episode: number,
): string {
    return `${getBaseUrl()}/${getSite()}/${slug}/staffel-${season}/episode-${episode}`;
}

export interface ParsedUrl {
    slug: string;
    season: number | null;
    episode: number | null;
}

// Parse any series/season/episode URL (or path) into its parts.
// Returns null if the URL doesn't match the site's content layout.
export function parseUrl(url: string): ParsedUrl | null {
    const match = url.match(
        /\/(?:serie|anime)\/(?:stream\/)?([^/?#]+)(?:\/staffel-(\d+))?(?:\/episode-(\d+))?/i,
    );
    if (!match) return null;

    // Guard against matching the bare "/serie" listing with no slug.
    const slug = match[1];
    if (!slug || slug === "stream") return null;

    return {
        slug,
        season: match[2] !== undefined ? parseInt(match[2], 10) : null,
        episode: match[3] !== undefined ? parseInt(match[3], 10) : null,
    };
}

// Turn a search-result link into a series slug, or null if it isn't a bare
// series link (i.e. it points at a season, episode, actor, genre, ...).
export function seriesSlugFromLink(link: string): string | null {
    const match = link.match(
        /^\/?(?:serie|anime)\/(?:stream\/)?([^/?#]+)\/?$/i,
    );
    if (!match) return null;
    if (match[1] === "stream") return null;
    return match[1];
}
