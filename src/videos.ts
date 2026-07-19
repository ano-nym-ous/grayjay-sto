// Shared builders for authors (series-as-channel) and episode PlatformVideos,
// reused by the channel, playlist and content modules.

import { PLATFORM } from "./constants";
import { getConfig } from "./state";
import { titleFromSlug } from "./helpers";
import { episodeUrl, seriesUrl } from "./urls";
import type { EpisodeInfo, SeriesInfo } from "./series";

// A series is modelled as an author/channel.
export function buildAuthorLink(
    slug: string,
    name: string,
    thumbnail?: string,
): PlatformAuthorLink {
    return new PlatformAuthorLink(
        new PlatformID(PLATFORM, slug, getConfig("id")),
        name || titleFromSlug(slug),
        seriesUrl(slug),
        thumbnail || "",
    );
}

export function authorFromSeries(
    slug: string,
    series: SeriesInfo,
): PlatformAuthorLink {
    return buildAuthorLink(slug, series.title, series.posterUrl);
}

// Display name for an episode / movie entry.
export function episodeDisplayName(
    season: number,
    episode: EpisodeInfo,
): string {
    const title =
        episode.title || episode.originalTitle || `Episode ${episode.number}`;
    if (season === 0) {
        return episode.title || episode.originalTitle
            ? title
            : `Movie ${episode.number}`;
    }
    return `S${season}E${episode.number} \u00b7 ${title}`;
}

// Build a PlatformVideo for an episode/movie in a season.
export function buildEpisodeVideo(
    slug: string,
    series: SeriesInfo,
    author: PlatformAuthorLink,
    season: number,
    episode: EpisodeInfo,
): PlatformVideo {
    return new PlatformVideo({
        id: new PlatformID(
            PLATFORM,
            `${slug}/staffel-${season}/episode-${episode.number}`,
            getConfig("id"),
        ),
        name: episodeDisplayName(season, episode),
        thumbnails: new Thumbnails([new Thumbnail(series.posterUrl, 0)]),
        author,
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: episodeUrl(slug, season, episode.number),
        isLive: false,
    });
}

// Ordered list of "seasons" to surface: real seasons 1..N, then movies (0) last.
export function seasonList(series: SeriesInfo): number[] {
    const list: number[] = [];
    for (let s = 1; s <= series.seasonsCount; s++) list.push(s);
    if (series.hasMovies) list.push(0);
    return list;
}
