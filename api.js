/* api.js — fetch wrapper for API Gateway (JWT auth) */

// ✅ FILL THIS IN (your API Gateway invoke URL, no trailing slash)
// Example: https://abc123.execute-api.eu-west-2.amazonaws.com
const API_BASE_URL = "https://5bwgybhzz2.execute-api.us-east-1.amazonaws.com";

async function apiFetch(path, options = {}) {
  // Support Auth defined as a top-level const (not attached to window)
  // and also a direct token fallback from storage.
  const token =
    (typeof Auth !== "undefined" && Auth && typeof Auth.getAccessToken === "function"
      ? Auth.getAccessToken()
      : null) ||
    sessionStorage.getItem("fc26_access_token") ||
    localStorage.getItem("fc26_access_token") ||
    sessionStorage.getItem("access_token") ||
    localStorage.getItem("access_token") ||
    "";

  if (!token) throw new Error("No access token. Not logged in.");

  const url = API_BASE_URL + path;

  const resp = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  // If a transfers endpoint isn't implemented yet, treat as empty list
  if (resp.status === 404) return [];

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API error ${resp.status}: ${text}`);
  }

  if (resp.status === 204) return null;
  return await resp.json();
}) {
  const token = Auth.getAccessToken();
  if (!token) throw new Error("No access token. Not logged in.");

  const url = API_BASE_URL + path;

  const resp = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`API error ${resp.status}: ${text}`);
  }

  // 204 No Content
  if (resp.status === 204) return null;

  return await resp.json();
}

const Api = {
  // Saves
  listSaves: () => apiFetch("/saves", { method: "GET" }),
  createSave: (name) => apiFetch("/saves", { method: "POST", body: JSON.stringify({ name }) }),
  updateSave: (saveId, name) => apiFetch(`/saves/${encodeURIComponent(saveId)}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteSave: (saveId) => apiFetch(`/saves/${encodeURIComponent(saveId)}`, { method: "DELETE" }),

  // Transfers
  listTransfers: (saveId) => apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers`, { method: "GET" }),
  createTransfer: (saveId, transfer) => apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers`, { method: "POST", body: JSON.stringify(transfer) }),
  updateTransfer: (saveId, transferId, transfer) =>
    apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers/${encodeURIComponent(transferId)}`, { method: "PUT", body: JSON.stringify(transfer) }),
  deleteTransfer: (saveId, transferId) =>
    apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers/${encodeURIComponent(transferId)}`, { method: "DELETE" }),
};



// Expose for non-module scripts
window.Api = Api;
window.apiFetch = apiFetch;
