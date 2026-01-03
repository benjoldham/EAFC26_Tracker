/* api.js — fetch wrapper for API Gateway (JWT auth)
   NOTE: auth.js defines `const Auth = (...)();` which is a global lexical binding
   (not window.Auth). So we reference `Auth` directly (and fall back to window.Auth if present).
*/
(function () {
  const API_BASE_URL = "https://5bwgybhzz2.execute-api.us-east-1.amazonaws.com";

  function getAuth() {
    // Prefer the global lexical binding created by auth.js
    if (typeof Auth !== "undefined" && Auth && typeof Auth.getAccessToken === "function") return Auth;
    // Fallback if someone attached it to window
    if (typeof window !== "undefined" && window.Auth && typeof window.Auth.getAccessToken === "function") return window.Auth;
    return null;
  }

  async function apiFetch(path, options = {}) {
    const auth = getAuth();
    if (!auth) throw new Error("Auth not loaded (auth.js missing or failed).");

    const token = auth.getAccessToken();
    if (!token) throw new Error("No access token. Not logged in.");

    const url = API_BASE_URL + path;

    const resp = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });

    // Some endpoints may not exist yet; treat 404 as empty list where appropriate
    if (resp.status === 404) {
      return [];
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`API error ${resp.status}: ${text}`);
    }

    if (resp.status === 204) return null;
    return await resp.json();
  }

  const Api = {
    // Saves
    listSaves: () => apiFetch("/saves", { method: "GET" }),
    createSave: (name) =>
      apiFetch("/saves", { method: "POST", body: JSON.stringify({ name }) }),
    updateSave: (saveId, name) =>
      apiFetch(`/saves/${encodeURIComponent(saveId)}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      }),
    deleteSave: (saveId) =>
      apiFetch(`/saves/${encodeURIComponent(saveId)}`, { method: "DELETE" }),

    // Transfers
    listTransfers: async (saveId) => {
      try {
        const data = await apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers`, { method: "GET" });
        return Array.isArray(data) ? data : [];
      } catch (e) {
        // If transfers route isn't available yet or backend errors, don't crash the UI
        console.warn("listTransfers failed; returning empty list", e);
        return [];
      }
    },
    createTransfer: (saveId, transfer) =>
      apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers`, {
        method: "POST",
        body: JSON.stringify(transfer),
      }),
    updateTransfer: (saveId, transferId, transfer) =>
      apiFetch(
        `/saves/${encodeURIComponent(saveId)}/transfers/${encodeURIComponent(transferId)}`,
        { method: "PUT", body: JSON.stringify(transfer) }
      ),
    deleteTransfer: (saveId, transferId) =>
      apiFetch(
        `/saves/${encodeURIComponent(saveId)}/transfers/${encodeURIComponent(transferId)}`,
        { method: "DELETE" }
      ),
  };

  window.Api = Api;
  window.apiFetch = apiFetch;
})();
