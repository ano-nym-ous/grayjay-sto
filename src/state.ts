// Plugin config + settings state.
//
// Grayjay calls source.enable(config, settings) with the parsed config.json and
// the user's settings. Dropdown settings are delivered as the *selected index*
// (as a string or number), so callers should resolve them via the helpers in
// ./helpers rather than reading raw values.

let _config: any = null;
let _settings: any = {};

export function setConfig(config: any): void {
    _config = config || {};
}

export function getConfig<T = any>(key?: string): T {
    if (!_config)
        throw new ScriptException(
            "Config accessed before source.enable() was called",
        );

    if (key) {
        return _config[key];
    }
    return _config;
}

export function setSettings(settings: any): void {
    _settings = settings || {};
}

export function getSettings<T = any>(key?: string): T {
    if (key) {
        return _settings[key];
    }
    return _settings;
}
