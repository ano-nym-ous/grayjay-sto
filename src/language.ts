// Language parsing + labelling.
//
// The site encodes languages in flag references, either new-style
// ("#icon-flag-german", "#icon-flag-english-german") or old-style
// ("/storage/flags/german.svg"). A two-part value means "audio-subtitle",
// e.g. "english-german" = English audio with German subtitles.
//
// Per the plugin design we label sources by AUDIO language only; subtitles are
// left baked into the hoster stream.

export type Language = "German" | "English" | "Japanese" | "Unknown";

export interface MediaLanguage {
    audio: Language;
    subtitle: Language | null;
}

function toLanguage(text: string): Language {
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

export function parseMediaLanguage(ref: string): MediaLanguage {
    const text = (ref || "").trim();

    let language: string;
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

// Label used in source names — audio language only.
export function languageLabel(lang: MediaLanguage): string {
    return lang.audio;
}

// Sort key so that German groups before English before everything else.
export function languageOrder(lang: MediaLanguage): number {
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

// Grayjay expects a language string on sources; map to a short code.
export function languageCode(lang: MediaLanguage): string {
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
