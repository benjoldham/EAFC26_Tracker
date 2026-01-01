/* auth.js — Cognito Hosted UI (Authorization Code + PKCE)
   Stores tokens in sessionStorage (safer than localStorage).
*/

const Auth = (() => {
  // ✅ FILL THESE IN
  const CONFIG = {
    cognitoDomain: "https://us-east-122ffnaib9.auth.us-east-1.amazoncognito.com",
    clientId: "4h6ch2jh93i4e2ncc4a7s076df",
    redirectUri: "https://main.d38idh1saq8gux.amplifyapp.com/auth.html",
    logoutRedirectUri: "https://main.d38idh1saq8gux.amplifyapp.com",
    scopes: ["openid", "email"], // keep minimal for privacy
  };

  const STORAGE = {
    verifier: "fc26_pkce_verifier",
    accessToken: "fc26_access_token",
    idToken: "fc26_id_token",
    refreshToken: "fc26_refresh_token",
    tokenExp: "fc26_token_exp", // epoch seconds
  };

  function base64UrlEncode(bytes) {
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function sha256(str) {
    const data = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return new Uint8Array(digest);
  }

  function randomString(len = 64) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  function nowSec() { return Math.floor(Date.now() / 1000); }

  function setSession(key, val) { sessionStorage.setItem(key, val); }
  function getSession(key) { return sessionStorage.getItem(key); }
  function clearSession() {
    Object.values(STORAGE).forEach(k => sessionStorage.removeItem(k));
  }

  function isLoggedIn() {
    const token = getSession(STORAGE.accessToken);
    const exp = Number(getSession(STORAGE.tokenExp) || "0");
    return !!token && exp > nowSec() + 30; // 30s buffer
  }

  function getAccessToken() {
    return getSession(STORAGE.accessToken);
  }

  async function login(currentPathAfterLogin = "index.html") {
    // PKCE
    const verifier = randomString(64);
    setSession(STORAGE.verifier, verifier);

    const challenge = base64UrlEncode(await sha256(verifier));

    const state = encodeURIComponent(currentPathAfterLogin);

    const authUrl =
      `${CONFIG.cognitoDomain}/oauth2/authorize` +
      `?client_id=${encodeURIComponent(CONFIG.clientId)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(CONFIG.scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(CONFIG.redirectUri)}` +
      `&code_challenge_method=S256` +
      `&code_challenge=${encodeURIComponent(challenge)}` +
      `&state=${state}`;

    window.location.href = authUrl;
  }

  async function handleCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // we store return page here
    const err = url.searchParams.get("error");

    if (err) {
      const desc = url.searchParams.get("error_description") || "";
      throw new Error(`Cognito error: ${err} ${desc}`);
    }

    if (!code) {
      // No code present – go to dashboard
      window.location.replace("./index.html");
      return;
    }

    const verifier = getSession(STORAGE.verifier);
    if (!verifier) throw new Error("Missing PKCE verifier (sessionStorage cleared). Try logging in again.");

    // Exchange code for tokens
    const tokenUrl = `${CONFIG.cognitoDomain}/oauth2/token`;

    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("client_id", CONFIG.clientId);
    body.set("code", code);
    body.set("redirect_uri", CONFIG.redirectUri);
    body.set("code_verifier", verifier);

    const resp = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Token exchange failed: ${resp.status} ${text}`);
    }

    const tokens = await resp.json();
    // tokens: access_token, id_token, refresh_token?, expires_in
    setSession(STORAGE.accessToken, tokens.access_token);
    setSession(STORAGE.idToken, tokens.id_token || "");
    if (tokens.refresh_token) setSession(STORAGE.refreshToken, tokens.refresh_token);

    const exp = nowSec() + Number(tokens.expires_in || 3600);
    setSession(STORAGE.tokenExp, String(exp));

    // Clean callback params and go where we came from (or dashboard)
    const next = state ? decodeURIComponent(state) : "index.html";
    window.location.replace("./" + next);
  }

  function logout() {
    clearSession();

    const logoutUrl =
      `${CONFIG.cognitoDomain}/logout` +
      `?client_id=${encodeURIComponent(CONFIG.clientId)}` +
      `&logout_uri=${encodeURIComponent(CONFIG.logoutRedirectUri)}`;

    window.location.href = logoutUrl;
  }

  // Used on protected pages
  async function requireLogin(returnTo = "index.html") {
    if (!isLoggedIn()) {
      await login(returnTo);
      return false;
    }
    return true;
  }

  return {
    CONFIG,
    login,
    logout,
    handleCallback,
    requireLogin,
    isLoggedIn,
    getAccessToken,
  };
})();

