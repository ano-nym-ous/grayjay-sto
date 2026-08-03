// Self-hosted Cloudflare Turnstile solver for s.to's "redirect gate".
//
// Background (verified against grayjay-android source):
//   * s.to serves hoster links behind a Cloudflare Turnstile gate. Until it's
//     solved, `GET /r?t=<token>` returns a tiny "frameBridge" stub with no
//     hoster URL. The gate clears only after the site's modal POSTs `/r` with
//     `_token` (CSRF) + `t` (play token) + `cf-turnstile-response`; clearance
//     lives in the server-side Laravel session (the POST *response* sets it).
//   * Grayjay's captcha webview captures cookies at REQUEST time. It completes
//     when a request satisfies `completionUrl` AND all `cookiesToFind` are
//     present at that moment. The site's own form POSTs to `/r`, so pointing
//     `completionUrl` at `/r` captures the PRE-clearance session -> an
//     unsolvable loop (which is exactly what users hit).
//
// Fix: inject our OWN page as the captcha body. It renders a Turnstile widget,
// POSTs `/r` itself, and only AFTER that response clears the session does it
//   (a) set a marker cookie (CAPTCHA_DONE_COOKIE), then
//   (b) fire a same-origin request.
// config.json uses `completionUrl: null` (so any request qualifies) and requires
// both `laravel_session` and the marker cookie. Because the marker only exists
// after we set it, completion fires strictly AFTER clearance -> Grayjay captures
// the CLEARED `laravel_session`. This is domain-agnostic: it works on whatever
// origin the gated link lives on (s.to / serienstream.to / .cx / aniworld.to).

import { CAPTCHA_DONE_COOKIE, TURNSTILE_SITEKEY_FALLBACK } from "./constants";

// Origin ("https://host") of an absolute URL.
function originOf(url: string): string {
    const m = url.match(/^(https?:\/\/[^/]+)/i);
    return m ? m[1] : "https://serienstream.to";
}

// The `t=` play token carried by a `/r?t=<token>` redirect URL (decoded).
function playTokenOf(url: string): string {
    const m = url.match(/[?&]t=([^&]+)/);
    if (!m) return "";
    try {
        return decodeURIComponent(m[1]);
    } catch {
        return m[1];
    }
}

// Build the HTML page shown in Grayjay's captcha webview. All dynamic values are
// JSON-encoded so tokens (base64 with +/=) embed safely into JS string literals.
function buildCaptchaHtml(
    origin: string,
    playToken: string,
    csrfToken: string,
    sitekey: string,
    doneCookie: string,
): string {
    const cfg = JSON.stringify({ origin, playToken, csrfToken, doneCookie });
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  html,body{margin:0;height:100%;background:#0f0f10;color:#eee;
    font-family:-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{min-height:100%;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:18px;padding:24px;text-align:center}
  h1{font-size:18px;font-weight:600;margin:0}
  #status{font-size:14px;color:#9aa0a6;min-height:20px}
  .err{color:#f28b82}
  .ok{color:#81c995}
</style>
</head>
<body>
<div class="wrap">
  <h1>Verify to continue</h1>
  <div id="ts" class="cf-turnstile" data-sitekey="${sitekey}" data-theme="dark" data-callback="onCaptchaSolved"></div>
  <div id="status">Complete the checkbox above.</div>
</div>
<script>
(function(){
  var CFG = ${cfg};
  function setStatus(t, cls){
    var el = document.getElementById('status');
    if(!el) return;
    el.textContent = t;
    el.className = cls || '';
  }
  // Fire a same-origin request AFTER clearance so Grayjay's request-time cookie
  // capture grabs the cleared laravel_session + our marker cookie.
  function finish(){
    document.cookie = CFG.doneCookie + '=1; path=/';
    var ping = CFG.origin + '/r?gjdone=' + Date.now();
    fetch(ping, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .catch(function(){})
      .then(function(){ setStatus('Verified. You can close this window.', 'ok'); });
  }
  window.onCaptchaSolved = function(token){
    setStatus('Verifying\\u2026');
    var body = '_token=' + encodeURIComponent(CFG.csrfToken)
      + '&t=' + encodeURIComponent(CFG.playToken)
      + '&cf-turnstile-response=' + encodeURIComponent(token);
    // POST /r ourselves. Its RESPONSE sets the cleared laravel_session.
    fetch(CFG.origin + '/r', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: body
    }).then(function(){ finish(); })
      .catch(function(){ finish(); });
  };
})();
</script>
</body>
</html>`;
}

// Throw Grayjay's CaptchaRequiredException carrying our custom Turnstile page.
// `gatedUrl` is any of the gated `/r?t=<token>` hoster URLs for this episode.
// Returns false (does NOT throw) when it lacks the info to build a solver, so
// the caller can fall back to a plain error.
export function throwTurnstileCaptcha(
    gatedUrl: string,
    csrfToken: string,
    sitekey: string,
): boolean {
    const playToken = playTokenOf(gatedUrl);
    const key = sitekey || TURNSTILE_SITEKEY_FALLBACK;
    if (!playToken || !csrfToken || !key) {
        return false; // not enough to build a working solver
    }

    const origin = originOf(gatedUrl);
    const html = buildCaptchaHtml(
        origin,
        playToken,
        csrfToken,
        key,
        CAPTCHA_DONE_COOKIE,
    );

    log(
        `s.to: opening Turnstile captcha webview (origin=${origin}, ` +
            `sitekey=${key})`,
    );
    // baseURL = origin so the webview's document origin is the site (Turnstile
    // validates the sitekey against location.hostname, and our fetches +
    // document.cookie are same-origin with the gated links' cookies).
    throw new CaptchaRequiredException(`${origin}/`, html);
}
