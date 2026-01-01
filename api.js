/* api.js — fetch wrapper for API Gateway (JWT auth) */

// ✅ EDIT THIS (your API Gateway invoke URL, NO trailing slash)
// Example: https://abc123.execute-api.us-east-1.amazonaws.com
const API_BASE_URL = "https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com";

async function apiFetch(path, options = {}) {
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

  if (resp.status === 204) return null;
  return await resp.json();
}

const Api = {
  // Saves
  listSaves: () => apiFetch("/saves", { method: "GET" }),
  createSave: (name) => apiFetch("/saves", { method: "POST", body: JSON.stringify({ name }) }),
  updateSave: (saveId, name) =>
    apiFetch(`/saves/${encodeURIComponent(saveId)}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteSave: (saveId) =>
    apiFetch(`/saves/${encodeURIComponent(saveId)}`, { method: "DELETE" }),

  // Transfers
  listTransfers: (saveId) =>
    apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers`, { method: "GET" }),
  createTransfer: (saveId, transfer) =>
    apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers`, { method: "POST", body: JSON.stringify(transfer) }),
  updateTransfer: (saveId, transferId, transfer) =>
    apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers/${encodeURIComponent(transferId)}`, {
      method: "PUT",
      body: JSON.stringify(transfer),
    }),
  deleteTransfer: (saveId, transferId) =>
    apiFetch(`/saves/${encodeURIComponent(saveId)}/transfers/${encodeURIComponent(transferId)}`, { method: "DELETE" }),
};
