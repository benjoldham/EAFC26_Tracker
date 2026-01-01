// dashboard.js — Dashboard now uses AWS API instead of localStorage.
// UI stays the same; only data source changes.

(async function boot() {
  const ok = await Auth.requireLogin("index.html");
  if (!ok) return;

  try {
    await initDashboard();
  } catch (err) {
    console.error(err);
    alert("Dashboard failed to load. Check console.");
  }
})();

async function initDashboard() {
  // ---- Find UI elements (non-destructive; works even if some are missing) ----
  const addBtn =
    document.querySelector("#addSaveBtn") ||
    document.querySelector("[data-add-save]") ||
    document.querySelector("button");

  const rowsEl =
    document.querySelector("#savesRows") ||
    document.querySelector("#careerSavesRows") ||
    document.querySelector("tbody");

  const emptyStateEl =
    document.querySelector("#emptyState") ||
    document.querySelector("[data-empty-state]");

  const logoutBtn =
    document.querySelector("#logoutBtn") ||
    document.querySelector("[data-logout]");

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      Auth.logout();
    });
  }

  // ---- State ----
  let saves = [];
  let editingSaveId = null;
  let editingDraftName = "";

  // ---- Helpers ----
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  }

  function toNumber(val) {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }

  // Try to calculate profit if transfers are returned
  function profitFromTransfers(transfers) {
    let sum = 0;
    for (const t of transfers || []) {
      // Support a few possible field names
      const cost =
        toNumber(t.costGbp) ||
        toNumber(t.costGBP) ||
        toNumber(t.cost) ||
        0;

      const sale =
        toNumber(t.saleGbp) ||
        toNumber(t.saleGBP) ||
        toNumber(t.sale) ||
        0;

      sum += (sale - cost);
    }
    return sum;
  }

  async function refresh() {
    saves = await Api.listSaves();

    // Normalize if backend returns {items:[...]}
    if (saves && typeof saves === "object" && Array.isArray(saves.items)) {
      saves = saves.items;
    }
    if (!Array.isArray(saves)) saves = [];

    await render();
  }

  async function render() {
    if (!rowsEl) return;

    rowsEl.innerHTML = "";

    if (emptyStateEl) {
      emptyStateEl.style.display = saves.length ? "none" : "block";
    }

    // Optional: calculate per-save counts/profit (requires extra API calls).
    // If you don’t want extra calls, set SHOW_SUMMARY=false.
    const SHOW_SUMMARY = true;

    let summaries = {};
    if (SHOW_SUMMARY && saves.length) {
      // Parallel fetch transfers for each save (can be slower if many saves)
      const results = await Promise.allSettled(
        saves.map(async (s) => {
          const transfers = await Api.listTransfers(s.id);
          const arr = (transfers && transfers.items) ? transfers.items : transfers;
          const list = Array.isArray(arr) ? arr : [];
          return {
            id: s.id,
            count: list.length,
            profit: profitFromTransfers(list),
          };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") summaries[r.value.id] = r.value;
      }
    }

    for (const s of saves) {
      const tr = document.createElement("tr");
      const name = s.name || "Untitled";

      const summary = summaries[s.id] || { count: "—", profit: "—" };

      const isEditing = editingSaveId === s.id;

      tr.innerHTML = `
        <td>
          ${
            isEditing
              ? `<input class="save-name-input" data-name-input="${escapeHtml(s.id)}" value="${escapeHtml(editingDraftName)}" />`
              : `<strong>${escapeHtml(name)}</strong>`
          }
        </td>
        <td class="val-muted">${escapeHtml(fmtDate(s.createdAt || s.created_at))}</td>
        <td class="num">${escapeHtml(summary.count)}</td>
        <td class="num ${typeof summary.profit === "number" ? (summary.profit >= 0 ? "v-pos" : "v-neg") : ""}">
          ${
            typeof summary.profit === "number"
              ? escapeHtml(summary.profit.toLocaleString())
              : escapeHtml(summary.profit)
          }
        </td>
        <td class="actions">
          ${
            isEditing
              ? `
                <button class="btn btn-small" data-save-rename="${escapeHtml(s.id)}">Save</button>
                <button class="btn btn-small" data-save-cancel="${escapeHtml(s.id)}">Cancel</button>
              `
              : `
                <button class="btn btn-small" data-save-open="${escapeHtml(s.id)}">Open</button>
                <button class="btn btn-small" data-save-edit="${escapeHtml(s.id)}">Edit</button>
                <button class="btn btn-small btn-danger" data-save-delete="${escapeHtml(s.id)}">Delete</button>
              `
          }
        </td>
      `;
      rowsEl.appendChild(tr);
    }
  }

  // ---- Events ----

  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const name = prompt("Career save name:");
      if (!name) return;

      await Api.createSave(name.trim());
      await refresh();
    });
  }

  if (rowsEl) {
    rowsEl.addEventListener("click", async (e) => {
      const openBtn = e.target.closest("[data-save-open]");
      const editBtn = e.target.closest("[data-save-edit]");
      const renameBtn = e.target.closest("[data-save-rename]");
      const cancelBtn = e.target.closest("[data-save-cancel]");
      const delBtn = e.target.closest("[data-save-delete]");

      if (openBtn) {
        const id = openBtn.dataset.saveOpen;
        window.location.href = `./tracker.html?save=${encodeURIComponent(id)}`;
        return;
      }

      if (editBtn) {
        const id = editBtn.dataset.saveEdit;
        editingSaveId = id;
        const found = saves.find((x) => x.id === id);
        editingDraftName = found ? (found.name || "") : "";
        await render();
        return;
      }

      if (cancelBtn) {
        editingSaveId = null;
        editingDraftName = "";
        await render();
        return;
      }

      if (renameBtn) {
        const id = renameBtn.dataset.saveRename;
        const newName = (editingDraftName || "").trim();
        if (!newName) {
          alert("Please enter a name.");
          return;
        }
        await Api.updateSave(id, newName);
        editingSaveId = null;
        editingDraftName = "";
        await refresh();
        return;
      }

      if (delBtn) {
        const id = delBtn.dataset.saveDelete;
        const ok = confirm("Delete this career save? This will remove its transfers too.");
        if (!ok) return;
        await Api.deleteSave(id);
        await refresh();
        return;
      }
    });

    rowsEl.addEventListener("input", (e) => {
      const inp = e.target.closest("input[data-name-input]");
      if (!inp) return;
      const id = inp.dataset.nameInput;
      if (id !== editingSaveId) return;
      editingDraftName = inp.value;
    });
  }

  // ---- Load initial data ----
  await refresh();
}
