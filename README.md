# s.to Grayjay source

A Grayjay plugin for **SerienStream** (`s.to` / `serienstream.to`) and **AniWorld**
(`aniworld.to`). Series are exposed as channels, seasons (and movies) as
playlists, and each episode plays from every available hoster and language.

## How it works

- **Discovery is search-only.** The home feed is intentionally empty. Search
  returns **series as creators/channels** (`searchChannels`) via the site's
  `/api/search/suggest` endpoint (falling back to the classic `/ajax/search`).
- **A series is a channel.** Opening a series shows:
  - a **Videos** tab that lazily lists every episode, loading **one season per
    page** as you scroll (movies last), and
  - a **Playlists** tab with one playlist per season plus a **Movies** playlist.
- **Episodes** resolve *all* hoster + language combinations into switchable
  sources, named `<Hoster> · <Language>` (audio language only; subtitles stay
  baked into the hoster stream). Sources are ordered German → English, then by
  hoster preference **VOE → Vidoza → Streamtape → Doodstream** (first = default).
  Hosters that fail to resolve are skipped rather than breaking playback.

Supported hoster extractors (ported from the C# `SerienStreamAPI` reference):
**VOE** (HLS), **Vidoza**, **Streamtape**, **Doodstream** (MP4).

## Settings

| Setting | Options | Notes |
| --- | --- | --- |
| `site` | `serie`, `anime` | Must match the base URL below. |
| `baseUrl` | `s.to`, `serienstream.to`, `aniworld.to`, `186.2.175.5` | Pick a SerienStream domain with `serie`, or `aniworld.to` with `anime`. |

> The two settings are independent in the UI but **not** logically independent:
> pair `aniworld.to` with `anime`, and the SerienStream domains with `serie`.

## Caveats

- **`allowUrls` is enumerated, not `everywhere`.** VOE and Doodstream rotate CDN
  domains frequently, so playback can silently fail for a hoster domain that
  isn't listed in `config.json`. When a hoster stops working, add its current
  domain(s) to `allowUrls`.
- **`icon.png` is referenced but not included** — drop an icon in the project
  root (or remove `iconUrl` from `config.json`). The plugin loads either way.
- **Author metadata** in `config.json` is a placeholder — update `author` /
  `authorUrl` / `sourceUrl` / `repositoryUrl` before publishing.

## Build

```sh
npm install
npm run typecheck   # tsc --noEmit over src/
npm run build       # bundles src/source.ts -> dist/script.js (esbuild)
```

## Layout

```
src/
  source.ts       entrypoint; wires the Grayjay `source` object
  state.ts        config + settings state
  constants.ts    platform id, option lists, hoster order
  helpers.ts      http + DOM fetching, slug/url helpers, setting resolution
  urls.ts         series/season/episode URL build + parse
  language.ts     flag-ref -> audio/subtitle language + labels
  series.ts       HTML parsers (series / episodes / episode video info)
  extractors.ts   VOE / Vidoza / Streamtape / Doodstream stream resolution
  videos.ts       shared author + PlatformVideo builders
  search.ts       searchChannels (series as creators)
  channel.ts      getChannel + lazy per-season feed + season/movie playlists
  playlist.ts     getPlaylist (season / movies details)
  content.ts      getContentDetails (resolve all sources)
  types/          plugin.d.ts type declarations
```
