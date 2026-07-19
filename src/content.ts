// Episode / movie playback: resolve every hoster + language into a switchable
// list of video sources.

import { HOSTER_ORDER, PLATFORM } from "./constants";
import { getConfig } from "./state";
import { titleFromSlug } from "./helpers";
import { getEpisodeVideoInfo, getSeries, type EpisodeStream } from "./series";
import { resolveStream, type ResolvedStream } from "./extractors";
import {
    languageCode,
    languageLabel,
    languageOrder,
    parseMediaLanguage,
} from "./language";
import { parseUrl } from "./urls";
import { authorFromSeries } from "./videos";

function hosterIndex(hoster: string): number {
    const lower = (hoster || "").toLowerCase();
    for (let i = 0; i < HOSTER_ORDER.length; i++) {
        if (HOSTER_ORDER[i].toLowerCase() === lower) return i;
    }
    return HOSTER_ORDER.length; // unknown hosters sort last
}

// Sort streams: German group before English before others; then by the
// preferred hoster order (VOE, Vidoza, Streamtape, Doodstream).
function sortStreams(streams: EpisodeStream[]): EpisodeStream[] {
    return streams.slice().sort((a, b) => {
        const la = languageOrder(parseMediaLanguage(a.languageRef));
        const lb = languageOrder(parseMediaLanguage(b.languageRef));
        if (la !== lb) return la - lb;
        return hosterIndex(a.hoster) - hosterIndex(b.hoster);
    });
}

function buildSource(stream: EpisodeStream, resolved: ResolvedStream): any {
    const lang = parseMediaLanguage(stream.languageRef);
    const name = `${stream.hoster} \u00b7 ${languageLabel(lang)}`;

    // Build PLAIN objects (not via the injected HLSSource/VideoUrlSource
    // classes). On some Grayjay builds those constructors return ClearScript
    // host objects onto which an added `plugin_type` doesn't round-trip, which
    // makes the engine's `GetPolymorphicType` read `undefined` and crash. Plain
    // JS objects always expose `plugin_type` as a readable string. Field names
    // mirror the injected classes exactly.
    if (resolved.type === "hls") {
        return {
            plugin_type: "HLSSource",
            name,
            duration: 0,
            url: resolved.url,
            priority: false,
            language: languageCode(lang),
        };
    }

    return {
        plugin_type: "VideoUrlSource",
        name,
        url: resolved.url,
        width: 0,
        height: 0,
        container: "video/mp4",
        codec: "",
        bitrate: 0,
        duration: 0,
    };
}

export function getContentDetails(url: string): PlatformVideoDetails {
    const parsed = parseUrl(url);
    if (!parsed || parsed.season === null || parsed.episode === null) {
        throw new ScriptException(`Invalid episode URL: ${url}`);
    }

    const { slug, season, episode } = parsed;
    const info = getEpisodeVideoInfo(slug, episode, season);
    const series = getSeries(slug);
    const author = authorFromSeries(slug, series);

    // Resolve each hoster/language embed to a concrete stream. Failures are
    // skipped so one dead hoster doesn't break the whole episode.
    const found = info.streams
        .map((s) => `${s.hoster}[${s.languageRef}]->${s.videoUrl}`)
        .join(", ");
    log(`s.to getContentDetails(${slug} s${season}e${episode}): ${info.streams.length} hoster link(s): ${found}`);

    const sources: any[] = [];
    const errors: string[] = [];
    for (const stream of sortStreams(info.streams)) {
        try {
            const resolved = resolveStream(stream.hoster, stream.videoUrl);
            log(`s.to: resolved ${stream.hoster} -> ${resolved.type} ${resolved.url}`);
            sources.push(buildSource(stream, resolved));
        } catch (e) {
            const msg = `${stream.hoster}: ${e}`;
            errors.push(msg);
            log(`s.to: failed to resolve ${msg}`);
        }
    }

    if (sources.length === 0) {
        throw new ScriptException(
            `No sources could be resolved for ${url}. ` +
                `Found ${info.streams.length} hoster link(s). ` +
                (errors.length
                    ? `Errors: ${errors.join(" | ")}`
                    : `No hoster links were found on the episode page.`),
        );
    }

    const name =
        info.title ||
        info.originalTitle ||
        (season === 0
            ? `Movie ${episode}`
            : `S${season}E${episode}`) ||
        titleFromSlug(slug);

    return new PlatformVideoDetails({
        id: new PlatformID(
            PLATFORM,
            `${slug}/staffel-${season}/episode-${episode}`,
            getConfig("id"),
        ),
        name,
        thumbnails: new Thumbnails([new Thumbnail(series.posterUrl, 0)]),
        author,
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url,
        isLive: false,
        description: info.description,
        // Plain descriptor object (see buildSource) to avoid injected-class
        // host-object issues with `plugin_type`.
        video: {
            plugin_type: "MuxVideoSourceDescriptor",
            isUnMuxed: false,
            videoSources: sources,
        },
        hls: null,
        dash: null,
        // `live` is a SINGLE optional IVideoSource, not an array. Passing `[]`
        // is non-undefined, so the engine tries to resolve its polymorphic
        // type and reads `plugin_type` off the empty array -> undefined ->
        // "Unable to cast Undefined to String" crash. Must be null.
        live: null,
    });
}
