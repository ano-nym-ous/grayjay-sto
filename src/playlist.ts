// Playlist details for a single season (or the movies "season 0").

import { PLATFORM } from "./constants";
import { getConfig } from "./state";
import { getEpisodes, getSeries } from "./series";
import { parseUrl } from "./urls";
import { authorFromSeries, buildEpisodeVideo } from "./videos";

export function getPlaylist(url: string): PlatformPlaylistDetails {
    const parsed = parseUrl(url);
    if (!parsed || parsed.season === null) {
        throw new ScriptException(`Invalid playlist URL: ${url}`);
    }

    const { slug, season } = parsed;
    const series = getSeries(slug);
    const author = authorFromSeries(slug, series);

    const videos = getEpisodes(slug, season).map((ep) =>
        buildEpisodeVideo(slug, series, author, season, ep),
    );

    const name = season === 0 ? "Movies" : `Season ${season}`;

    return new PlatformPlaylistDetails({
        id: new PlatformID(
            PLATFORM,
            `${slug}/staffel-${season}`,
            getConfig("id"),
        ),
        name,
        thumbnail: series.posterUrl,
        author,
        url,
        videoCount: videos.length,
        contents: new VideoPager(videos, false, {}),
    });
}
