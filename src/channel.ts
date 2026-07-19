// Series-as-channel: channel metadata, a lazy per-season video feed, and one
// playlist per season (plus a "Movies" playlist when present).

import { PLATFORM } from "./constants";
import { getConfig } from "./state";
import { getEpisodes, getSeries, type SeriesInfo } from "./series";
import { parseUrl, seasonUrl, seriesUrl } from "./urls";
import {
    authorFromSeries,
    buildEpisodeVideo,
    seasonList,
} from "./videos";

function slugFromUrl(url: string): string {
    const parsed = parseUrl(url);
    if (!parsed) throw new ScriptException(`Invalid series URL: ${url}`);
    return parsed.slug;
}

export function getChannel(url: string): PlatformChannel {
    const slug = slugFromUrl(url);
    const series = getSeries(slug);

    log(
        `s.to getChannel(${slug}) poster="${series.posterUrl}" banner="${series.bannerUrl}"`,
    );

    return new PlatformChannel({
        id: new PlatformID(PLATFORM, slug, getConfig("id")),
        name: series.title || slug,
        thumbnail: series.posterUrl,
        banner: series.bannerUrl,
        subscribers: 0,
        description: series.description,
        url: seriesUrl(slug),
        links: {},
    });
}

// ---------------------------------------------------------------------------
// Channel video feed — one season loaded per page (lazy).
// ---------------------------------------------------------------------------

function videosForSeason(
    slug: string,
    series: SeriesInfo,
    author: PlatformAuthorLink,
    season: number,
): PlatformVideo[] {
    return getEpisodes(slug, season).map((ep) =>
        buildEpisodeVideo(slug, series, author, season, ep),
    );
}

class SeasonEpisodePager extends VideoPager {
    slug!: string;
    series!: SeriesInfo;
    author!: PlatformAuthorLink;
    seasons!: number[];
    index!: number;

    constructor(
        slug: string,
        series: SeriesInfo,
        author: PlatformAuthorLink,
        seasons: number[],
        index: number,
        videos: PlatformVideo[],
        hasMore: boolean,
    ) {
        super(videos, hasMore, {});
        this.slug = slug;
        this.series = series;
        this.author = author;
        this.seasons = seasons;
        this.index = index;
    }

    nextPage(): VideoPager {
        const next = this.index + 1;
        if (next >= this.seasons.length) return new VideoPager([], false, {});
        return buildSeasonPager(
            this.slug,
            this.series,
            this.author,
            this.seasons,
            next,
        );
    }
}

function buildSeasonPager(
    slug: string,
    series: SeriesInfo,
    author: PlatformAuthorLink,
    seasons: number[],
    index: number,
): VideoPager {
    const season = seasons[index];
    const videos = videosForSeason(slug, series, author, season);
    const hasMore = index < seasons.length - 1;
    return new SeasonEpisodePager(
        slug,
        series,
        author,
        seasons,
        index,
        videos,
        hasMore,
    );
}

export function getChannelContents(url: string): VideoPager {
    const slug = slugFromUrl(url);
    const series = getSeries(slug);
    const author = authorFromSeries(slug, series);

    const seasons = seasonList(series);
    if (seasons.length === 0) return new VideoPager([], false, {});

    return buildSeasonPager(slug, series, author, seasons, 0);
}

export function getChannelCapabilities(): ResultCapabilities {
    return new ResultCapabilities([], [], []);
}

// ---------------------------------------------------------------------------
// Channel playlists — one per season, plus movies.
// ---------------------------------------------------------------------------

export function getChannelPlaylists(url: string): PlaylistPager {
    const slug = slugFromUrl(url);
    const series = getSeries(slug);
    const author = authorFromSeries(slug, series);

    const playlists: PlatformPlaylist[] = [];

    for (let s = 1; s <= series.seasonsCount; s++) {
        playlists.push(
            new PlatformPlaylist({
                id: new PlatformID(
                    PLATFORM,
                    `${slug}/staffel-${s}`,
                    getConfig("id"),
                ),
                name: `Season ${s}`,
                thumbnail: series.posterUrl,
                author,
                url: seasonUrl(slug, s),
                // Unknown without fetching each season page; -1 = unknown.
                videoCount: -1,
            }),
        );
    }

    if (series.hasMovies) {
        playlists.push(
            new PlatformPlaylist({
                id: new PlatformID(
                    PLATFORM,
                    `${slug}/staffel-0`,
                    getConfig("id"),
                ),
                name: "Movies",
                thumbnail: series.posterUrl,
                author,
                url: seasonUrl(slug, 0),
                videoCount: -1,
            }),
        );
    }

    return new PlaylistPager(playlists, false, {});
}
