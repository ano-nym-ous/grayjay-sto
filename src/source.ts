// Plugin entrypoint. Wires the Grayjay `source` object to the implementation.
//
// Behaviour:
//   - Home is intentionally empty (discovery is search-only).
//   - Search returns series as channels/creators (searchChannels).
//   - A series is a channel; its seasons are playlists; episodes/movies play
//     with every hoster + language exposed as switchable sources.

import {
    getChannel,
    getChannelCapabilities,
    getChannelContents,
    getChannelPlaylists,
} from "./channel";
import { getContentDetails } from "./content";
import { getPlaylist } from "./playlist";
import { searchChannels } from "./search";
import { getConfig, getSettings, setConfig, setSettings } from "./state";
import { parseUrl } from "./urls";

// --- Lifecycle -------------------------------------------------------------

source.enable = (config: any, settings: any) => {
    setConfig(config);
    setSettings(settings);
};

source.setSettings = (settings: any) => {
    setSettings(settings);
};

source.reEnable = (config: any, settings: any) => {
    return source.enable(config ?? getConfig(), settings ?? getSettings());
};

source.disable = () => {};

// --- Home (disabled) -------------------------------------------------------

source.getHome = (): VideoPager => new VideoPager([], false, {});

// --- Search (series/creators only) -----------------------------------------

source.searchSuggestions = (): string[] => [];

source.getSearchCapabilities = (): ResultCapabilities =>
    new ResultCapabilities([], [], []);

source.search = (): VideoPager => new VideoPager([], false, {});

source.searchChannels = searchChannels;

// --- Channels (series) -----------------------------------------------------

source.isChannelUrl = (url: string): boolean => {
    const parsed = parseUrl(url);
    return !!parsed && parsed.season === null && parsed.episode === null;
};

source.getChannel = getChannel;
source.getChannelContents = getChannelContents;
source.getChannelCapabilities = getChannelCapabilities;
source.getChannelPlaylists = getChannelPlaylists;

// --- Playlists (seasons + movies) ------------------------------------------

source.isPlaylistUrl = (url: string): boolean => {
    const parsed = parseUrl(url);
    return !!parsed && parsed.season !== null && parsed.episode === null;
};

(source as any).getPlaylist = getPlaylist;

// --- Content (episodes / movies) -------------------------------------------

source.isContentDetailsUrl = (url: string): boolean => {
    const parsed = parseUrl(url);
    return !!parsed && parsed.episode !== null;
};

source.getContentDetails = getContentDetails;
