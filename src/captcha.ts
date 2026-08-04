// Self-hosted Cloudflare Turnstile solver for s.to's "redirect gate".
//
// Background (verified against grayjay-android source + the live site):
//   * s.to serves hoster links behind a Cloudflare Turnstile gate. Until it's
//     solved, `GET /r?t=<token>` returns a tiny "frameBridge" stub with no
//     hoster URL. The gate clears only after the site's modal POSTs `/r` with
//     `_token` (CSRF) + `t` (play token) + `cf-turnstile-response`; clearance
//     lives in the server-side Laravel session (the POST *response* sets it).
//   * Grayjay's captcha webview has its OWN cookie jar (Android CookieManager),
//     separate from the plugin's HTTP client. So the CSRF token / session that
//     the plugin sees is NOT the one the webview posts under. Posting the
//     plugin's `_token` from the webview fails Laravel CSRF validation (419)
//     and never clears the gate -> the captcha loops forever.
//   * Grayjay captures cookies at REQUEST time and completes when a request
//     satisfies `completionUrl` AND all `cookiesToFind` are present.
//
// Fix: inject a SELF-CONTAINED page. Inside the webview it (1) clears the marker
// cookie, (2) fetches the episode page itself to read a session-consistent CSRF
// token, sitekey and play token, (3) renders Turnstile, (4) on solve POSTs `/r`,
// and only AFTER that response clears the session does it set the marker cookie
// and fire a same-origin request. config.json uses `completionUrl: null` and
// requires `laravel_session` + the marker cookie, so completion fires strictly
// after a fresh clearance, on ANY mirror domain.

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

// Build the page shown in Grayjay's captcha webview. Dynamic values are
// JSON-encoded so tokens (base64 with +/=) embed safely into JS string literals.
function buildCaptchaHtml(
    origin: string,
    episodeUrl: string,
    fallbackToken: string,
    fallbackSitekey: string,
    doneCookie: string,
): string {
    const cfg = JSON.stringify({
        origin,
        episodeUrl,
        fallbackToken,
        fallbackSitekey,
        doneCookie,
    });
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
  #status{font-size:13px;color:#9aa0a6;min-height:18px;max-width:90%;
    word-break:break-word}
  .err{color:#f28b82}
  .ok{color:#81c995}
</style>
</head>
<body>
<div class="wrap">
  <h1>Verify to continue</h1>
  <div id="ts"></div>
  <div id="status">Loading\u2026</div>
</div>
<script>
(function(){
  var CFG = ${cfg};
  var csrf = CFG.fallbackToken || '';
  var sitekey = CFG.fallbackSitekey || '';
  var playToken = '';
  var widgetId = null;

  function setStatus(t, cls){
    var el = document.getElementById('status');
    if(!el) return;
    el.textContent = t;
    el.className = cls || '';
  }

  // Wipe the marker cookie up-front so a stale value can never auto-complete
  // the captcha before a fresh POST clears the session.
  document.cookie = CFG.doneCookie + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

  function decodeEntities(s){
    return (s||'').replace(/&amp;/g,'&');
  }
  function extract(html){
    var m = html.match(/<meta[^>]*name=["']csrf-token["'][^>]*content=["']([^"']+)["']/i)
         || html.match(/name=["']_token["'][^>]*value=["']([^"']+)["']/i);
    if(m) csrf = m[1];
    var s = html.match(/data-turnstile-sitekey=["']([^"']+)["']/i);
    if(s) sitekey = s[1];
    var p = html.match(/data-play-url=["'][^"']*[?&]t=([^"'&]+)/i);
    if(p){
      try { playToken = decodeURIComponent(decodeEntities(p[1])); }
      catch(e){ playToken = decodeEntities(p[1]); }
    }
    if(!playToken && CFG.fallbackToken) playToken = CFG.fallbackToken;
  }

  function renderWidget(){
    if(widgetId !== null) return;
    if(!(window.turnstile && sitekey)) return;
    setStatus('Complete the checkbox above. (csrf=' + (csrf?'ok':'MISSING')
      + ', t=' + (playToken?'ok':'MISSING') + ')');
    widgetId = window.turnstile.render('#ts', {
      sitekey: sitekey,
      theme: 'dark',
      callback: onSolve,
      'error-callback': function(c){ setStatus('Turnstile error: ' + c, 'err'); },
      'expired-callback': function(){ setStatus('Turnstile expired, tick again.', 'err'); }
    });
  }

  function onSolve(token){
    setStatus('Verifying\\u2026');
    var body = '_token=' + encodeURIComponent(csrf)
      + '&t=' + encodeURIComponent(playToken)
      + '&cf-turnstile-response=' + encodeURIComponent(token);
    // POST /r to clear the session. Laravel answers 302 either way, so we don't
    // trust its status; instead we verify by re-fetching the gated link below.
    fetch(CFG.origin + '/r', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': CFG.episodeUrl
      },
      body: body
    }).then(function(){ verifyCleared(); })
      .catch(function(e){ setStatus('POST /r error: ' + e, 'err'); });
  }

  // GET the gated link again: if the session is cleared it no longer returns the
  // "frameBridge" stub. This request also carries the cleared laravel_session,
  // so on success we then trip Grayjay's capture via finish().
  function verifyCleared(){
    setStatus('Checking\\u2026');
    fetch(CFG.origin + '/r?t=' + encodeURIComponent(playToken), {
      credentials: 'include',
      headers: { 'Referer': CFG.episodeUrl }
    }).then(function(r){ return r.text(); })
      .then(function(html){
        if(html.indexOf('frameBridge') !== -1){
          // Still gated: the POST did not clear the session. Do NOT finish
          // (that would loop). Keep the window open so the state is visible.
          setStatus('Still gated after solving \u2014 POST /r did not clear the '
            + 'session. Please tell the developer.', 'err');
        } else {
          setStatus('Verified. Finishing\\u2026', 'ok');
          finish();
        }
      }).catch(function(e){ setStatus('Verify error: ' + e, 'err'); });
  }

  // After the session is cleared: set the marker cookie, then make a same-origin
  // request so Grayjay's request-time capture grabs the cleared laravel_session.
  function finish(){
    document.cookie = CFG.doneCookie + '=1; path=/';
    fetch(CFG.origin + '/r?gjdone=' + Date.now(), {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).catch(function(){}).then(function(){
      setStatus('Verified. You can close this window.', 'ok');
    });
  }

  // Fetch the episode page in the WEBVIEW to get a session-consistent CSRF
  // token, sitekey and play token, then render the widget.
  fetch(CFG.episodeUrl, { credentials: 'include' })
    .then(function(r){ return r.text(); })
    .then(function(html){ extract(html); })
    .catch(function(){ /* fall back to embedded values */ })
    .then(function(){
      if(!playToken) playToken = CFG.fallbackToken || '';
      renderWidget();
      // In case the Turnstile script loads after this point, poll briefly.
      var tries = 0;
      var iv = setInterval(function(){
        tries++;
        if(widgetId !== null || tries > 100){ clearInterval(iv); return; }
        renderWidget();
      }, 100);
    });
})();
</script>
</body>
</html>`;
}

// Throw Grayjay's CaptchaRequiredException carrying our custom Turnstile page.
// `episodeUrl` is the episode page URL; `gatedUrl` is any gated `/r?t=<token>`
// hoster URL for this episode (used for origin + as a play-token fallback).
// Returns false (does NOT throw) when it lacks the info to build a solver.
export function throwTurnstileCaptcha(
    episodeUrl: string,
    gatedUrl: string,
    sitekey: string,
): boolean {
    const origin = originOf(gatedUrl || episodeUrl);
    const fallbackToken = playTokenOf(gatedUrl);
    const key = sitekey || TURNSTILE_SITEKEY_FALLBACK;
    if (!origin || !episodeUrl) {
        return false;
    }

    const html = buildCaptchaHtml(
        origin,
        episodeUrl,
        fallbackToken,
        key,
        CAPTCHA_DONE_COOKIE,
    );

    log(`s.to: opening Turnstile captcha webview (origin=${origin})`);
    // baseURL = the episode URL so the webview's document origin is the site
    // (Turnstile validates the sitekey against location.hostname, and our
    // fetches + document.cookie are same-origin with the gated links).
    throw new CaptchaRequiredException(episodeUrl, html);
}
