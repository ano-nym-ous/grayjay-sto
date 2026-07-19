import { absoluteUrl, getHtmlRoot, getSite } from "./helpers";

// The Grayjay DOM engine only supports the nth-child / nth-last-child
// functional pseudo-classes — NOT :contains() — so text matching is done
// manually here.

// Return the trimmed text of every <a> inside the <li> whose <strong> label
// contains `keyword` (e.g. "Regisseur", "Genre").
function infoLinks(root: DOMNode, keyword: string): string[] {
    const items = root.querySelectorAll("li");
    for (const li of items) {
        const strong = li.querySelector("strong");
        if (strong && (strong.textContent || "").indexOf(keyword) !== -1) {
            return li
                .querySelectorAll("a")
                .map((a) => a.textContent?.trim() || "")
                .filter(Boolean);
        }
    }
    return [];
}

// Text content of the first element matching `selector` that contains `keyword`.
function firstTextContaining(
    root: DOMNode,
    selector: string,
    keyword: string,
): string {
    const nodes = root.querySelectorAll(selector);
    for (const node of nodes) {
        const text = node.textContent || "";
        if (text.indexOf(keyword) !== -1) return text;
    }
    return "";
}

export interface SeriesInfo {
    title: string;
    description: string;
    bannerUrl: string; // absolute
    posterUrl: string; // absolute (channel avatar); falls back to bannerUrl
    yearStart: number;
    yearEnd: number | null;
    directors: string[];
    actors: string[];
    creators: string[];
    countriesOfOrigin: string[];
    genres: string[];
    ageRating: number;
    ratingsCount: number;
    imdbUrl: string;
    trailerUrl: string;
    hasMovies: boolean;
    seasonsCount: number;
}

export function getSeries(slug: string): SeriesInfo {
    const root = getHtmlRoot(`${getSite()}/${slug}`);

    if (root.querySelectorAll("div.messageAlert.danger").length > 0) {
        throw new ScriptException(`Series not found: ${slug}`);
    }

    const endYearText =
        root.querySelector("p.text-muted span")?.textContent?.trim() || "";

    const bannerRelative =
        root
            .querySelector("div.col-12.col-md-9 picture img")
            ?.getAttribute("data-src") || "";
    const bannerUrl = bannerRelative ? absoluteUrl(bannerRelative) : "";

    const posterNode =
        root.querySelector('img[data-src*="/media/images/channel/"]') ||
        root.querySelector('img[src*="/media/images/channel/"]') ||
        root.querySelector("div.col-lg-2 picture img") ||
        root.querySelector("div.col-3 picture img");
    let posterRelative =
        posterNode?.getAttribute("data-src") ||
        posterNode?.getAttribute("src") ||
        "";
    if (!posterRelative) {
        // Reliable across layouts.
        posterRelative =
            root
                .querySelector('meta[property="og:image"]')
                ?.getAttribute("content") || "";
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
        title: root.querySelector("div.row h1")?.textContent?.trim() || "",
        description:
            root
                .querySelector("div.series-description span.description-text")
                ?.textContent?.trim() || "",
        bannerUrl,
        posterUrl,
        yearStart: parseInt(
            root.querySelector("p.text-muted a")?.textContent?.trim() || "0",
        ),
        yearEnd: endYearText === "NA" ? null : parseInt(endYearText),
        directors: infoLinks(root, "Regisseur"),
        actors: infoLinks(root, "Besetzung"),
        creators: infoLinks(root, "Produzent"),
        countriesOfOrigin: infoLinks(root, "Land"),
        genres: infoLinks(root, "Genre"),
        ageRating: parseInt(ageRatingText.match(/FSK (\d+)/)?.[1] || "0"),
        ratingsCount: parseInt(
            ratingsText.match(/([\d.,]+) Bewertungen/)?.[1]?.replace(
                /[.,]/g,
                "",
            ) || "0",
        ),
        imdbUrl:
            root.querySelector("a[href*='imdb.com']")?.getAttribute("href") ||
            "",
        trailerUrl:
            root
                .querySelector("button[data-trailer-url]")
                ?.getAttribute("data-trailer-url") || "",
        hasMovies,
        seasonsCount,
    };
}

export interface EpisodeInfo {
    number: number;
    title: string;
    originalTitle: string;
    hosters: string[]; // <img alt> values from the watch cell
    languages: string[]; // flag hrefs from the language cell (e.g. "#icon-flag-german")
}

// season 0 == movies
export function getEpisodes(slug: string, season: number): EpisodeInfo[] {
    const root = getHtmlRoot(`${getSite()}/${slug}/staffel-${season}`);

    if (root.querySelectorAll("div.messageAlert.danger").length > 0) {
        throw new ScriptException(`Series not found: ${slug}`);
    }
    if (root.childNodes.length === 0) {
        if (season === 0) {
            return [];
        } else {
            throw new ScriptException(
                `Season not found: ${slug} - Season ${season}`,
            );
        }
    }

    return root
        .querySelectorAll("section.episode-section tbody tr.episode-row")
        .map((node) => ({
            number: parseInt(
                node
                    .querySelector("th.episode-number-cell")
                    ?.textContent?.trim() || "0",
            ),
            title:
                node
                    .querySelector("td.episode-title-cell strong")
                    ?.textContent?.trim() || "",
            originalTitle:
                node
                    .querySelector("td.episode-title-cell span")
                    ?.textContent?.trim() || "",
            hosters: node
                .querySelectorAll("td.episode-watch-cell img")
                .map((img) => img.getAttribute("alt") || "")
                .filter(Boolean),
            languages: node
                .querySelectorAll("td.episode-language-cell svg use")
                .map((use) => use.getAttribute("href") || "")
                .filter(Boolean),
        }));
}

export function getMovies(slug: string): EpisodeInfo[] {
    return getEpisodes(slug, 0);
}

export interface EpisodeStream {
    videoUrl: string; // ABSOLUTE redirect url (from data-play-url via absoluteUrl)
    hoster: string; // data-provider-name
    languageRef: string; // flag href from the button's <use href=...>
}

export interface EpisodeVideoInfo {
    number: number;
    season: number | null;
    title: string;
    originalTitle: string;
    description: string;
    streams: EpisodeStream[];
}

export function getEpisodeVideoInfo(
    slug: string,
    number: number,
    season: number,
): EpisodeVideoInfo {
    const root = getHtmlRoot(
        `${getSite()}/${slug}/staffel-${season}/episode-${number}`,
    );

    const rawTitle =
        root.querySelector("article h2.h4.mb-1")?.textContent?.trim() || "";
    // Strip the leading "S00E00:" style prefix (robust to multi-digit numbers).
    const fullTitle = rawTitle.replace(/^S\d+E\d+:\s*/i, "");
    const currentInfo =
        root.querySelector("div.small.mx-2 span strong")?.textContent?.trim() ||
        "";

    const titleMatch = fullTitle.match(/(.*?)(?:\s*\(([^()]*)\))?\s*$/);

    return {
        number: parseInt(currentInfo.match(/E(\d+)/)?.[1] || "0"),
        season: currentInfo.includes("S00")
            ? null
            : parseInt(currentInfo.match(/S(\d+)/)?.[1] || "0"),
        title: titleMatch?.[1] || "",
        originalTitle: titleMatch?.[2] || "",
        description:
            root.querySelector("div[id^='desc-'] div")?.textContent?.trim() ||
            "",
        streams: root
            .querySelectorAll("div#episode-links button.link-box")
            .map((node) => ({
                videoUrl: absoluteUrl(node.getAttribute("data-play-url") || ""),
                hoster: node.getAttribute("data-provider-name") || "",
                languageRef:
                    node.querySelector("use")?.getAttribute("href") || "",
            })),
    };
}

export function getMovieVideoInfo(
    slug: string,
    number: number,
): EpisodeVideoInfo {
    return getEpisodeVideoInfo(slug, number, 0);
}
