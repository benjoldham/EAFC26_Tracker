// api.js — hardened API client

const API_BASE =
  "https://5bwgybhzz2.execute-api.us-east-1.amazonaws.com/production";

async function apiFetch(path, opts = {}) {
  const token = await Auth.getIdToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(opts.headers || {}),
    },
  });

  // 🔴 IMPORTANT FIX:
  // Treat missing endpoints as empty data instead of fatal errors
  if (res.status === 404) {
    return [];
  }

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API error ${res.status}: ${txt}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const Api = {
  listSaves() {
    return apiFetch("/saves");
  },

  createSave(name) {
    return apiFetch("/saves", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  updateSave(id, name) {
    return apiFetch(`/saves/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
  },

  deleteSave(id) {
    return apiFetch(`/saves/${id}`, { method: "DELETE" });
  },

  // 🔴 FIX: transfers may not exist yet
  listTransfers(saveId) {
    return apiFetch(`/saves/${saveId}/transfers`);
  },

  createTransfer(saveId, payload) {
    return apiFetch(`/saves/${saveId}/transfers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};
