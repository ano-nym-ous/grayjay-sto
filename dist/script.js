"use strict";
(() => {
  // src/constants.ts
  var PLATFORM = "s.to";
  var SITE_OPTIONS = ["serie", "anime"];
  var BASE_URL_OPTIONS = [
    "https://s.to",
    "https://serienstream.to",
    "https://serienstream.cx",
    "https://aniworld.to",
    "http://186.2.175.5"
  ];
  var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  var HOSTER_ORDER = ["VOE", "Vidoza", "Streamtape", "Doodstream"];
  var DOODSTREAM_HOST = "https://dood.li";

  // src/state.ts
  var _config = null;
  var _settings = {};
  function setConfig(config) {
    _config = config || {};
  }
  function getConfig(key) {
    if (!_config)
      throw new ScriptException(
        "Config accessed before source.enable() was called"
      );
    if (key) {
      return _config[key];
    }
    return _config;
  }
  function setSettings(settings) {
    _settings = settings || {};
  }
  function getSettings(key) {
    if (key) {
      return _settings[key];
    }
    return _settings;
  }

  // src/helpers.ts
  function resolveOption(raw, options, fallback) {
    if (raw === void 0 || raw === null || raw === "") return fallback;
    if (typeof raw === "string" && options.indexOf(raw) !== -1) return raw;
    const index = typeof raw === "number" ? raw : parseInt(String(raw), 10);
    if (!isNaN(index) && index >= 0 && index < options.length)
      return options[index];
    return fallback;
  }
  function getSite() {
    return resolveOption(getSettings("site"), SITE_OPTIONS, SITE_OPTIONS[0]);
  }
  function getBaseUrl() {
    return resolveOption(
      getSettings("baseUrl"),
      BASE_URL_OPTIONS,
      BASE_URL_OPTIONS[0]
    ).replace(/\/+$/, "");
  }
  function absoluteUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.indexOf("//") === 0) {
      const scheme = getBaseUrl().indexOf("https") === 0 ? "https:" : "http:";
      return scheme + path;
    }
    return `${getBaseUrl()}/${path.replace(/^\/+/, "")}`;
  }
  var DEFAULT_HEADERS = {
    "User-Agent": USER_AGENT
  };
  var CLOUDFLARE_MARKERS = [
    "Just a moment",
    "challenge-platform",
    "_cf_chl_opt",
    "__cf_chl",
    "cf-browser-verification",
    "challenges.cloudflare.com",
    "Enable JavaScript and cookies to continue"
  ];
  function isCloudflareChallenge(body) {
    if (!body) return false;
    for (const marker of CLOUDFLARE_MARKERS) {
      if (body.indexOf(marker) !== -1) return true;
    }
    return false;
  }
  function fetchAndValidate(url, headers) {
    const response = http.GET(
      url,
      { ...DEFAULT_HEADERS, ...headers || {} },
      false
    );
    if (!response.isOk) {
      if (isCloudflareChallenge(response.body)) {
        throw new CaptchaRequiredException(url, response.body);
      }
      throw new ScriptException(
        `Request failed (${response.code}): ${url}`
      );
    }
    if (isCloudflareChallenge(response.body)) {
      throw new CaptchaRequiredException(url, response.body);
    }
    return response.body;
  }
  function getHtmlRoot(path) {
    const webContent = fetchAndValidate(absoluteUrl(path));
    return domParser.parseFromString(webContent).getElementsByTagName("html")[0];
  }
  function getHtmlRootFromUrl(url, headers) {
    const webContent = fetchAndValidate(url, headers);
    return domParser.parseFromString(webContent).getElementsByTagName("html")[0];
  }
  function titleFromSlug(slug) {
    return slug.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  }

  // src/series.ts
  function infoLinks(root, keyword) {
    const items = root.querySelectorAll("li");
    for (const li of items) {
      const strong = li.querySelector("strong");
      if (strong && (strong.textContent || "").indexOf(keyword) !== -1) {
        return li.querySelectorAll("a").map((a) => {
          var _a;
          return ((_a = a.textContent) == null ? void 0 : _a.trim()) || "";
        }).filter(Boolean);
      }
    }
    return [];
  }
  function firstTextContaining(root, selector, keyword) {
    const nodes = root.querySelectorAll(selector);
    for (const node of nodes) {
      const text = node.textContent || "";
      if (text.indexOf(keyword) !== -1) return text;
    }
    return "";
  }
  function getSeries(slug) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
    const root = getHtmlRoot(`${getSite()}/${slug}`);
    if (root.querySelectorAll("div.messageAlert.danger").length > 0) {
      throw new ScriptException(`Series not found: ${slug}`);
    }
    const endYearText = ((_b = (_a = root.querySelector("p.text-muted span")) == null ? void 0 : _a.textContent) == null ? void 0 : _b.trim()) || "";
    const bannerRelative = ((_c = root.querySelector("div.col-12.col-md-9 picture img")) == null ? void 0 : _c.getAttribute("data-src")) || "";
    const bannerUrl = bannerRelative ? absoluteUrl(bannerRelative) : "";
    const posterNode = root.querySelector('img[data-src*="/media/images/channel/"]') || root.querySelector('img[src*="/media/images/channel/"]') || root.querySelector("div.col-lg-2 picture img") || root.querySelector("div.col-3 picture img");
    let posterRelative = (posterNode == null ? void 0 : posterNode.getAttribute("data-src")) || (posterNode == null ? void 0 : posterNode.getAttribute("src")) || "";
    if (!posterRelative) {
      posterRelative = ((_d = root.querySelector('meta[property="og:image"]')) == null ? void 0 : _d.getAttribute("content")) || "";
    }
    const posterUrl = posterRelative ? absoluteUrl(posterRelative) : bannerUrl;
    const ageRatingText = firstTextContaining(root, "p", "FSK");
    const ratingsText = firstTextContaining(root, "span", "Bewertungen");
    const seasonLinks = root.querySelectorAll("nav#season-nav ul li a");
    let hasMovies = false;
    let seasonsCount = 0;
    for (const link of seasonLinks) {
      const text = (link.textContent || "").trim();
      if (text === "Filme") hasMovies = true;
      else if (text) seasonsCount++;
    }
    return {
      title: ((_f = (_e = root.querySelector("div.row h1")) == null ? void 0 : _e.textContent) == null ? void 0 : _f.trim()) || "",
      description: ((_h = (_g = root.querySelector("div.series-description span.description-text")) == null ? void 0 : _g.textContent) == null ? void 0 : _h.trim()) || "",
      bannerUrl,
      posterUrl,
      yearStart: parseInt(
        ((_j = (_i = root.querySelector("p.text-muted a")) == null ? void 0 : _i.textContent) == null ? void 0 : _j.trim()) || "0"
      ),
      yearEnd: endYearText === "NA" ? null : parseInt(endYearText),
      directors: infoLinks(root, "Regisseur"),
      actors: infoLinks(root, "Besetzung"),
      creators: infoLinks(root, "Produzent"),
      countriesOfOrigin: infoLinks(root, "Land"),
      genres: infoLinks(root, "Genre"),
      ageRating: parseInt(((_k = ageRatingText.match(/FSK (\d+)/)) == null ? void 0 : _k[1]) || "0"),
      ratingsCount: parseInt(
        ((_m = (_l = ratingsText.match(/([\d.,]+) Bewertungen/)) == null ? void 0 : _l[1]) == null ? void 0 : _m.replace(
          /[.,]/g,
          ""
        )) || "0"
      ),
      imdbUrl: ((_n = root.querySelector("a[href*='imdb.com']")) == null ? void 0 : _n.getAttribute("href")) || "",
      trailerUrl: ((_o = root.querySelector("button[data-trailer-url]")) == null ? void 0 : _o.getAttribute("data-trailer-url")) || "",
      hasMovies,
      seasonsCount
    };
  }
  function getEpisodes(slug, season) {
    const root = getHtmlRoot(`${getSite()}/${slug}/staffel-${season}`);
    if (root.querySelectorAll("div.messageAlert.danger").length > 0) {
      throw new ScriptException(`Series not found: ${slug}`);
    }
    if (root.childNodes.length === 0) {
      if (season === 0) {
        return [];
      } else {
        throw new ScriptException(
          `Season not found: ${slug} - Season ${season}`
        );
      }
    }
    return root.querySelectorAll("section.episode-section tbody tr.episode-row").map((node) => {
      var _a, _b, _c, _d, _e, _f;
      return {
        number: parseInt(
          ((_b = (_a = node.querySelector("th.episode-number-cell")) == null ? void 0 : _a.textContent) == null ? void 0 : _b.trim()) || "0"
        ),
        title: ((_d = (_c = node.querySelector("td.episode-title-cell strong")) == null ? void 0 : _c.textContent) == null ? void 0 : _d.trim()) || "",
        originalTitle: ((_f = (_e = node.querySelector("td.episode-title-cell span")) == null ? void 0 : _e.textContent) == null ? void 0 : _f.trim()) || "",
        hosters: node.querySelectorAll("td.episode-watch-cell img").map((img) => img.getAttribute("alt") || "").filter(Boolean),
        languages: node.querySelectorAll("td.episode-language-cell svg use").map((use) => use.getAttribute("href") || "").filter(Boolean)
      };
    });
  }
  function getEpisodeVideoInfo(slug, number, season) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const root = getHtmlRoot(
      `${getSite()}/${slug}/staffel-${season}/episode-${number}`
    );
    const rawTitle = ((_b = (_a = root.querySelector("article h2.h4.mb-1")) == null ? void 0 : _a.textContent) == null ? void 0 : _b.trim()) || "";
    const fullTitle = rawTitle.replace(/^S\d+E\d+:\s*/i, "");
    const currentInfo = ((_d = (_c = root.querySelector("div.small.mx-2 span strong")) == null ? void 0 : _c.textContent) == null ? void 0 : _d.trim()) || "";
    const titleMatch = fullTitle.match(/(.*?)(?:\s*\(([^()]*)\))?\s*$/);
    return {
      number: parseInt(((_e = currentInfo.match(/E(\d+)/)) == null ? void 0 : _e[1]) || "0"),
      season: currentInfo.includes("S00") ? null : parseInt(((_f = currentInfo.match(/S(\d+)/)) == null ? void 0 : _f[1]) || "0"),
      title: (titleMatch == null ? void 0 : titleMatch[1]) || "",
      originalTitle: (titleMatch == null ? void 0 : titleMatch[2]) || "",
      description: ((_h = (_g = root.querySelector("div[id^='desc-'] div")) == null ? void 0 : _g.textContent) == null ? void 0 : _h.trim()) || "",
      streams: root.querySelectorAll("div#episode-links button.link-box").map((node) => {
        var _a2;
        return {
          videoUrl: absoluteUrl(node.getAttribute("data-play-url") || ""),
          hoster: node.getAttribute("data-provider-name") || "",
          languageRef: ((_a2 = node.querySelector("use")) == null ? void 0 : _a2.getAttribute("href")) || ""
        };
      })
    };
  }

  // src/urls.ts
  function seriesUrl(slug) {
    return `${getBaseUrl()}/${getSite()}/${slug}`;
  }
  function seasonUrl(slug, season) {
    return `${getBaseUrl()}/${getSite()}/${slug}/staffel-${season}`;
  }
  function episodeUrl(slug, season, episode) {
    return `${getBaseUrl()}/${getSite()}/${slug}/staffel-${season}/episode-${episode}`;
  }
  function parseUrl(url) {
    const match = url.match(
      /\/(?:serie|anime)\/(?:stream\/)?([^/?#]+)(?:\/staffel-(\d+))?(?:\/episode-(\d+))?/i
    );
    if (!match) return null;
    const slug = match[1];
    if (!slug || slug === "stream") return null;
    return {
      slug,
      season: match[2] !== void 0 ? parseInt(match[2], 10) : null,
      episode: match[3] !== void 0 ? parseInt(match[3], 10) : null
    };
  }
  function seriesSlugFromLink(link) {
    const match = link.match(
      /^\/?(?:serie|anime)\/(?:stream\/)?([^/?#]+)\/?$/i
    );
    if (!match) return null;
    if (match[1] === "stream") return null;
    return match[1];
  }

  // src/videos.ts
  function buildAuthorLink(slug, name, thumbnail) {
    return new PlatformAuthorLink(
      new PlatformID(PLATFORM, slug, getConfig("id")),
      name || titleFromSlug(slug),
      seriesUrl(slug),
      thumbnail || ""
    );
  }
  function authorFromSeries(slug, series) {
    return buildAuthorLink(slug, series.title, series.posterUrl);
  }
  function episodeDisplayName(season, episode) {
    const title = episode.title || episode.originalTitle || `Episode ${episode.number}`;
    if (season === 0) {
      return episode.title || episode.originalTitle ? title : `Movie ${episode.number}`;
    }
    return `S${season}E${episode.number} \xB7 ${title}`;
  }
  function buildEpisodeVideo(slug, series, author, season, episode) {
    return new PlatformVideo({
      id: new PlatformID(
        PLATFORM,
        `${slug}/staffel-${season}/episode-${episode.number}`,
        getConfig("id")
      ),
      name: episodeDisplayName(season, episode),
      thumbnails: new Thumbnails([new Thumbnail(series.posterUrl, 0)]),
      author,
      uploadDate: 0,
      duration: 0,
      viewCount: 0,
      url: episodeUrl(slug, season, episode.number),
      isLive: false
    });
  }
  function seasonList(series) {
    const list = [];
    for (let s = 1; s <= series.seasonsCount; s++) list.push(s);
    if (series.hasMovies) list.push(0);
    return list;
  }

  // src/channel.ts
  function slugFromUrl(url) {
    const parsed = parseUrl(url);
    if (!parsed) throw new ScriptException(`Invalid series URL: ${url}`);
    return parsed.slug;
  }
  function getChannel(url) {
    const slug = slugFromUrl(url);
    const series = getSeries(slug);
    log(
      `s.to getChannel(${slug}) poster="${series.posterUrl}" banner="${series.bannerUrl}"`
    );
    return new PlatformChannel({
      id: new PlatformID(PLATFORM, slug, getConfig("id")),
      name: series.title || slug,
      thumbnail: series.posterUrl,
      banner: series.bannerUrl,
      subscribers: 0,
      description: series.description,
      url: seriesUrl(slug),
      links: {}
    });
  }
  function videosForSeason(slug, series, author, season) {
    return getEpisodes(slug, season).map(
      (ep) => buildEpisodeVideo(slug, series, author, season, ep)
    );
  }
  var SeasonEpisodePager = class extends VideoPager {
    constructor(slug, series, author, seasons, index, videos, hasMore) {
      super(videos, hasMore, {});
      this.slug = slug;
      this.series = series;
      this.author = author;
      this.seasons = seasons;
      this.index = index;
    }
    nextPage() {
      const next = this.index + 1;
      if (next >= this.seasons.length) return new VideoPager([], false, {});
      return buildSeasonPager(
        this.slug,
        this.series,
        this.author,
        this.seasons,
        next
      );
    }
  };
  function buildSeasonPager(slug, series, author, seasons, index) {
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
      hasMore
    );
  }
  function getChannelContents(url) {
    const slug = slugFromUrl(url);
    const series = getSeries(slug);
    const author = authorFromSeries(slug, series);
    const seasons = seasonList(series);
    if (seasons.length === 0) return new VideoPager([], false, {});
    return buildSeasonPager(slug, series, author, seasons, 0);
  }
  function getChannelCapabilities() {
    return new ResultCapabilities([], [], []);
  }
  function getChannelPlaylists(url) {
    const slug = slugFromUrl(url);
    const series = getSeries(slug);
    const author = authorFromSeries(slug, series);
    const playlists = [];
    for (let s = 1; s <= series.seasonsCount; s++) {
      playlists.push(
        new PlatformPlaylist({
          id: new PlatformID(
            PLATFORM,
            `${slug}/staffel-${s}`,
            getConfig("id")
          ),
          name: `Season ${s}`,
          thumbnail: series.posterUrl,
          author,
          url: seasonUrl(slug, s),
          // Unknown without fetching each season page; -1 = unknown.
          videoCount: -1
        })
      );
    }
    if (series.hasMovies) {
      playlists.push(
        new PlatformPlaylist({
          id: new PlatformID(
            PLATFORM,
            `${slug}/staffel-0`,
            getConfig("id")
          ),
          name: "Movies",
          thumbnail: series.posterUrl,
          author,
          url: seasonUrl(slug, 0),
          videoCount: -1
        })
      );
    }
    return new PlaylistPager(playlists, false, {});
  }

  // src/extractors.ts
  var BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var BASE64_LOOKUP = (() => {
    const table = [];
    for (let i = 0; i < 256; i++) table[i] = -1;
    for (let i = 0; i < BASE64_ALPHABET.length; i++) {
      table[BASE64_ALPHABET.charCodeAt(i)] = i;
    }
    return table;
  })();
  function base64DecodeToBytes(input) {
    const bytes = [];
    let buffer = 0;
    let bitsCollected = 0;
    for (let i = 0; i < input.length; i++) {
      const value = BASE64_LOOKUP[input.charCodeAt(i)];
      if (value === -1) continue;
      buffer = buffer << 6 | value;
      bitsCollected += 6;
      if (bitsCollected >= 8) {
        bitsCollected -= 8;
        bytes.push(buffer >> bitsCollected & 255);
      }
    }
    return bytes;
  }
  function utf8BytesToString(bytes) {
    let result = "";
    let i = 0;
    while (i < bytes.length) {
      const byte1 = bytes[i++];
      if (byte1 < 128) {
        result += String.fromCharCode(byte1);
      } else if (byte1 >= 192 && byte1 < 224) {
        const byte2 = bytes[i++] & 63;
        result += String.fromCharCode((byte1 & 31) << 6 | byte2);
      } else if (byte1 >= 224 && byte1 < 240) {
        const byte2 = bytes[i++] & 63;
        const byte3 = bytes[i++] & 63;
        result += String.fromCharCode(
          (byte1 & 15) << 12 | byte2 << 6 | byte3
        );
      } else if (byte1 >= 240) {
        const byte2 = bytes[i++] & 63;
        const byte3 = bytes[i++] & 63;
        const byte4 = bytes[i++] & 63;
        let codePoint = (byte1 & 7) << 18 | byte2 << 12 | byte3 << 6 | byte4;
        codePoint -= 65536;
        result += String.fromCharCode(
          55296 + (codePoint >> 10),
          56320 + (codePoint & 1023)
        );
      } else {
        result += String.fromCharCode(byte1);
      }
    }
    return result;
  }
  function base64DecodeToString(input) {
    return utf8BytesToString(base64DecodeToBytes(input));
  }
  function shiftLetters(text) {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code >= 65 && code <= 90) {
        result += String.fromCharCode((code - 65 + 13) % 26 + 65);
      } else if (code >= 97 && code <= 122) {
        result += String.fromCharCode((code - 97 + 13) % 26 + 97);
      } else {
        result += String.fromCharCode(code);
      }
    }
    return result;
  }
  var VOE_JUNK_PARTS = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
  function replaceJunk(text) {
    let result = text;
    for (const part of VOE_JUNK_PARTS) {
      result = result.split(part).join("_");
    }
    return result;
  }
  function shiftBack(text, shift) {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) - shift);
    }
    return result;
  }
  function reverse(text) {
    return text.split("").reverse().join("");
  }
  function getVoeStreamUrl(redirectUrl) {
    let videoUrl = redirectUrl;
    let webContent = fetchAndValidate(videoUrl);
    const redirectMatch = webContent.match(
      /window\.location\.href\s*=\s*'([^']*)'/
    );
    if (redirectMatch) {
      videoUrl = redirectMatch[1];
      webContent = fetchAndValidate(videoUrl);
    }
    const scriptMatch = webContent.match(
      /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
    );
    if (scriptMatch) {
      try {
        let encoded = scriptMatch[1].trim();
        if (encoded.length > 4) {
          encoded = encoded.slice(2, encoded.length - 2);
        }
        let decoded = shiftLetters(encoded);
        decoded = replaceJunk(decoded).split("_").join("");
        decoded = base64DecodeToString(decoded);
        decoded = shiftBack(decoded, 3);
        decoded = base64DecodeToString(reverse(decoded));
        const json = JSON.parse(decoded);
        if (json && typeof json.source === "string" && json.source) {
          return { url: json.source, type: "hls" };
        }
      } catch (e) {
        log(`VOE primary decode failed: ${e}`);
      }
    }
    const a168c = webContent.match(/var a168c='([^']+)'/);
    if (a168c) {
      try {
        const reversed = reverse(base64DecodeToString(a168c[1]));
        const json = JSON.parse(reversed);
        if (json && typeof json.source === "string" && json.source) {
          return { url: json.source, type: "hls" };
        }
      } catch (e) {
        log(`VOE fallback a168c failed: ${e}`);
      }
    }
    const hls = webContent.match(/'hls':\s*'([^']+)'/);
    if (hls) {
      const url = base64DecodeToString(hls[1]);
      if (url) return { url, type: "hls" };
    }
    const plainSource = webContent.match(
      /["']source["']\s*:\s*["'](https?:\/\/[^"']+)["']/
    );
    if (plainSource) {
      return { url: plainSource[1], type: "hls" };
    }
    throw new ScriptException(`VOE stream extraction failed: ${videoUrl}`);
  }
  function getVidozaStreamUrl(redirectUrl) {
    const root = getHtmlRootFromUrl(redirectUrl);
    const source2 = root ? root.querySelector("#player source") : null;
    if (!source2) {
      throw new ScriptException(
        `Vidoza stream extraction failed (no <source>): ${redirectUrl}`
      );
    }
    const url = source2.getAttribute("src");
    if (!url) {
      throw new ScriptException(
        `Vidoza stream extraction failed (empty src): ${redirectUrl}`
      );
    }
    return { url, type: "mp4" };
  }
  function getStreamtapeStreamUrl(redirectUrl) {
    let videoUrl = redirectUrl;
    if (videoUrl.indexOf("/e/") === -1) {
      const r = getHtmlRootFromUrl(videoUrl);
      const meta = r ? r.querySelector('meta[name="og:url"]') : null;
      const content = meta ? meta.getAttribute("content") : null;
      if (!content) {
        throw new ScriptException(
          `Streamtape stream extraction failed (no og:url): ${videoUrl}`
        );
      }
      videoUrl = content;
    }
    const pageUrl = videoUrl.split("/e/").join("/v/");
    const html = fetchAndValidate(pageUrl);
    const root = domParser.parseFromString(html).getElementsByTagName("html")[0];
    const norobot = html.match(
      /document\.getElementById\('norobotlink'\)\.innerHTML = (.+);/
    );
    if (!norobot) {
      throw new ScriptException(
        `Streamtape stream extraction failed (no norobotlink): ${pageUrl}`
      );
    }
    const token = norobot[1].match(/token=([^&']+)/);
    if (!token) {
      throw new ScriptException(
        `Streamtape stream extraction failed (no token): ${pageUrl}`
      );
    }
    const hostNode = root ? root.querySelector("#ideoooolink") : null;
    const hostUrl = hostNode ? (hostNode.textContent || "").trim() : "";
    if (!hostUrl) {
      throw new ScriptException(
        `Streamtape stream extraction failed (no host link): ${pageUrl}`
      );
    }
    return {
      url: `https://${hostUrl}&token=${token[1]}&dl=1s`,
      type: "mp4"
    };
  }
  var DOOD_RANDOM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  function doodRandomString(length) {
    let result = "";
    for (let i = 0; i < length; i++) {
      const index = Math.floor(Math.random() * DOOD_RANDOM_CHARS.length);
      result += DOOD_RANDOM_CHARS.charAt(index);
    }
    return result;
  }
  function getDoodstreamStreamUrl(redirectUrl) {
    const root = getHtmlRootFromUrl(redirectUrl);
    if (!root) {
      throw new ScriptException(
        `Doodstream stream extraction failed (no page): ${redirectUrl}`
      );
    }
    let js = "";
    const scripts = root.querySelectorAll("script");
    for (let i = 0; i < scripts.length; i++) {
      const text = scripts[i].textContent || "";
      if (text.indexOf("/pass_md5/") !== -1) {
        js = text;
        break;
      }
    }
    if (!js) {
      throw new ScriptException(
        `Doodstream stream extraction failed (no pass_md5 script): ${redirectUrl}`
      );
    }
    const match = js.match(/\/pass_md5\/([^/]+\/[^']+)/);
    if (!match) {
      throw new ScriptException(
        `Doodstream stream extraction failed (no pass_md5 path): ${redirectUrl}`
      );
    }
    const passMd5 = match[1];
    const streamBase = fetchAndValidate(
      `${DOODSTREAM_HOST}/pass_md5/${passMd5}`,
      { Referer: redirectUrl }
    ).trim();
    const expiry = Date.now();
    const url = `${streamBase}${doodRandomString(10)}?token=${passMd5}&expiry=${expiry}`;
    return {
      url,
      type: "mp4",
      headers: { Referer: redirectUrl }
    };
  }
  function resolveStream(hoster, redirectUrl) {
    switch ((hoster || "").trim().toLowerCase()) {
      case "voe":
        return getVoeStreamUrl(redirectUrl);
      case "vidoza":
        return getVidozaStreamUrl(redirectUrl);
      case "streamtape":
        return getStreamtapeStreamUrl(redirectUrl);
      case "doodstream":
        return getDoodstreamStreamUrl(redirectUrl);
      default:
        throw new ScriptException(`Unsupported hoster: ${hoster}`);
    }
  }

  // src/language.ts
  function toLanguage(text) {
    switch (text.toLowerCase()) {
      case "german":
        return "German";
      case "english":
        return "English";
      case "japanese":
        return "Japanese";
      default:
        return "Unknown";
    }
  }
  function parseMediaLanguage(ref) {
    const text = (ref || "").trim();
    let language;
    if (text.startsWith("#icon-flag-")) {
      language = text.slice("#icon-flag-".length);
    } else if (text.startsWith("/storage/flags/")) {
      language = text.slice("/storage/flags/".length, -".svg".length);
    } else {
      return { audio: "Unknown", subtitle: null };
    }
    const parts = language.split("-").filter(Boolean);
    if (parts.length === 1) {
      return { audio: toLanguage(parts[0]), subtitle: null };
    }
    if (parts.length === 2) {
      return { audio: toLanguage(parts[0]), subtitle: toLanguage(parts[1]) };
    }
    return { audio: "Unknown", subtitle: null };
  }
  function languageLabel(lang) {
    return lang.audio;
  }
  function languageOrder(lang) {
    switch (lang.audio) {
      case "German":
        return 0;
      case "English":
        return 1;
      case "Japanese":
        return 2;
      default:
        return 3;
    }
  }
  function languageCode(lang) {
    switch (lang.audio) {
      case "German":
        return "de";
      case "English":
        return "en";
      case "Japanese":
        return "ja";
      default:
        return "";
    }
  }

  // src/content.ts
  function hosterIndex(hoster) {
    const lower = (hoster || "").toLowerCase();
    for (let i = 0; i < HOSTER_ORDER.length; i++) {
      if (HOSTER_ORDER[i].toLowerCase() === lower) return i;
    }
    return HOSTER_ORDER.length;
  }
  function sortStreams(streams) {
    return streams.slice().sort((a, b) => {
      const la = languageOrder(parseMediaLanguage(a.languageRef));
      const lb = languageOrder(parseMediaLanguage(b.languageRef));
      if (la !== lb) return la - lb;
      return hosterIndex(a.hoster) - hosterIndex(b.hoster);
    });
  }
  function buildSource(stream, resolved) {
    const lang = parseMediaLanguage(stream.languageRef);
    const name = `${stream.hoster} \xB7 ${languageLabel(lang)}`;
    if (resolved.type === "hls") {
      return {
        plugin_type: "HLSSource",
        name,
        duration: 0,
        url: resolved.url,
        priority: false,
        language: languageCode(lang)
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
      duration: 0
    };
  }
  function getContentDetails(url) {
    const parsed = parseUrl(url);
    if (!parsed || parsed.season === null || parsed.episode === null) {
      throw new ScriptException(`Invalid episode URL: ${url}`);
    }
    const { slug, season, episode } = parsed;
    const info = getEpisodeVideoInfo(slug, episode, season);
    const series = getSeries(slug);
    const author = authorFromSeries(slug, series);
    const found = info.streams.map((s) => `${s.hoster}[${s.languageRef}]->${s.videoUrl}`).join(", ");
    log(`s.to getContentDetails(${slug} s${season}e${episode}): ${info.streams.length} hoster link(s): ${found}`);
    const sources = [];
    const errors = [];
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
        `No sources could be resolved for ${url}. Found ${info.streams.length} hoster link(s). ` + (errors.length ? `Errors: ${errors.join(" | ")}` : `No hoster links were found on the episode page.`)
      );
    }
    const name = info.title || info.originalTitle || (season === 0 ? `Movie ${episode}` : `S${season}E${episode}`) || titleFromSlug(slug);
    return new PlatformVideoDetails({
      id: new PlatformID(
        PLATFORM,
        `${slug}/staffel-${season}/episode-${episode}`,
        getConfig("id")
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
        videoSources: sources
      },
      hls: null,
      dash: null,
      // `live` is a SINGLE optional IVideoSource, not an array. Passing `[]`
      // is non-undefined, so the engine tries to resolve its polymorphic
      // type and reads `plugin_type` off the empty array -> undefined ->
      // "Unable to cast Undefined to String" crash. Must be null.
      live: null
    });
  }

  // src/playlist.ts
  function getPlaylist(url) {
    const parsed = parseUrl(url);
    if (!parsed || parsed.season === null) {
      throw new ScriptException(`Invalid playlist URL: ${url}`);
    }
    const { slug, season } = parsed;
    const series = getSeries(slug);
    const author = authorFromSeries(slug, series);
    const videos = getEpisodes(slug, season).map(
      (ep) => buildEpisodeVideo(slug, series, author, season, ep)
    );
    const name = season === 0 ? "Movies" : `Season ${season}`;
    return new PlatformPlaylistDetails({
      id: new PlatformID(
        PLATFORM,
        `${slug}/staffel-${season}`,
        getConfig("id")
      ),
      name,
      thumbnail: series.posterUrl,
      author,
      url,
      videoCount: videos.length,
      contents: new VideoPager(videos, false, {})
    });
  }

  // src/search.ts
  function cleanName(name) {
    return (name || "").replace(/<\/?em>/gi, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }
  function suggestSearch(query) {
    const url = `${getBaseUrl()}/api/search/suggest?term=${encodeURIComponent(
      query
    )}`;
    const response = http.GET(
      url,
      {
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json"
      },
      false
    );
    if (!response.isOk) return [];
    let data;
    try {
      data = JSON.parse(response.body);
    } catch (e) {
      return [];
    }
    const shows = data && data.shows || [];
    const out = [];
    for (const show of shows) {
      const link = show.url || show.link || "";
      const slug = seriesSlugFromLink(link);
      if (!slug) continue;
      out.push({ slug, name: cleanName(show.name || show.title || "") });
    }
    return out;
  }
  function ajaxSearch(query) {
    const url = `${getBaseUrl()}/ajax/search`;
    const response = http.POST(
      url,
      `keyword=${encodeURIComponent(query)}`,
      {
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      false
    );
    if (!response.isOk) return [];
    let data;
    try {
      data = JSON.parse(response.body);
    } catch (e) {
      return [];
    }
    if (!Array.isArray(data)) return [];
    const out = [];
    const seen = {};
    for (const entry of data) {
      const link = entry.link || entry.url || "";
      const slug = seriesSlugFromLink(link);
      if (!slug || seen[slug]) continue;
      seen[slug] = true;
      out.push({
        slug,
        name: cleanName(entry.title || entry.name || "")
      });
    }
    return out;
  }
  function searchChannels(query) {
    let results = suggestSearch(query);
    if (results.length === 0) {
      results = ajaxSearch(query);
    }
    const authors = results.map(
      (r) => new PlatformAuthorLink(
        new PlatformID(PLATFORM, r.slug, getConfig("id")),
        r.name || titleFromSlug(r.slug),
        seriesUrl(r.slug),
        // Fetching each poster here would cost one request per result;
        // left empty so search stays fast.
        ""
      )
    );
    return new ChannelPager(authors, false, {});
  }

  // src/source.ts
  source.enable = (config, settings) => {
    setConfig(config);
    setSettings(settings);
  };
  source.setSettings = (settings) => {
    setSettings(settings);
  };
  source.reEnable = (config, settings) => {
    return source.enable(config != null ? config : getConfig(), settings != null ? settings : getSettings());
  };
  source.disable = () => {
  };
  source.getHome = () => new VideoPager([], false, {});
  source.searchSuggestions = () => [];
  source.getSearchCapabilities = () => new ResultCapabilities([], [], []);
  source.search = () => new VideoPager([], false, {});
  source.searchChannels = searchChannels;
  source.isChannelUrl = (url) => {
    const parsed = parseUrl(url);
    return !!parsed && parsed.season === null && parsed.episode === null;
  };
  source.getChannel = getChannel;
  source.getChannelContents = getChannelContents;
  source.getChannelCapabilities = getChannelCapabilities;
  source.getChannelPlaylists = getChannelPlaylists;
  source.isPlaylistUrl = (url) => {
    const parsed = parseUrl(url);
    return !!parsed && parsed.season !== null && parsed.episode === null;
  };
  source.getPlaylist = getPlaylist;
  source.isContentDetailsUrl = (url) => {
    const parsed = parseUrl(url);
    return !!parsed && parsed.episode !== null;
  };
  source.getContentDetails = getContentDetails;
})();
