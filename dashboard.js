// ✅ Require login before doing anything
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

// FC26 Transfer Tracker — Dashboard (multi-save) — AWS-backed (no localStorage)

async function initDashboard() {
  // UI state
  let editingSaveId = null;
  let editingDraftName = "";

  // Cached saves from API
  let savesCache = [];

  const $ = (id) => document.getElementById(id);
  const rowsEl = $("save-rows");
  const emptyStateEl = $("empty-state");
  const btnAdd = $("btn-add-save");

  function asInt(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }

  function profitGBPFromPlayerRow(p) {
    // support either schema:
    // 1) p.cost_gbp / p.sale_gbp (your current local schema)
    // 2) p.cost / p.sale (if you store already in GBP)
    const cost = asInt(p.cost_gbp ?? p.cost ?? 0, 0);
    const sale = asInt(p.sale_gbp ?? p.sale ?? 0, 0);
    return sale - cost;
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
    } catch {
      return "";
    }
  }

  function fmtMoneyAbbrevGBP(amountGBP) {
    const sym = "£";
    const n = Number(amountGBP) || 0;
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";

    const format = (val, suffix) => {
      const absVal = Math.abs(val);
      let str;
      if (absVal >= 10) str = String(Math.round(val));
      else str = String(Math.round(val * 10) / 10).replace(/\.0$/, "");
      return sign + sym + str + suffix;
    };

    if (abs >= 1_000_000_000) return format(abs / 1_000_000_000, "B");
    if (abs >= 1_000_000) return format(abs / 1_000_000, "M");
    if (abs >= 1_000) return format(abs / 1_000, "K");
    return sign + sym + Math.round(abs).toLocaleString("en-GB");
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function fetchSavesFromApi() {
    // Expect: [{id,name,createdAt, playerCount?, profit_gbp?}, ...]
    const saves = await Api.get("/saves");
    if (!Array.isArray(saves)) return [];
    return saves;
  }

  async function enrichSavesIfMissingStats(saves) {
    // If API doesn’t provide playerCount/profit, compute by calling transfers endpoint per save.
    // This keeps dashboard working even before you add stats server-side.
    const needsStats = saves.some(
      (s) => typeof s.playerCount === "undefined" || typeof s.profit_gbp === "undefined"
    );
    if (!needsStats) return saves;

    const enriched = await Promise.all(
      saves.map(async (s) => {
        // already has stats
        if (typeof s.playerCount !== "undefined" && typeof s.profit_gbp !== "undefined") return s;

        try {
          const transfers = await Api.get(`/saves/${encodeURIComponent(s.id)}/transfers`);
          const list = Array.isArray(transfers) ? transfers : [];
          const profit = list.reduce((sum, p) => sum + profitGBPFromPlayerRow(p), 0);
          return {
            ...s,
            playerCount: list.length,
            profit_gbp: profit,
          };
        } catch (e) {
          console.warn("Failed to fetch transfers for stats:", s.id, e);
          return {
            ...s,
            playerCount: s.playerCount ?? 0,
            profit_gbp: s.profit_gbp ?? 0,
          };
        }
      })
    );

    return enriched;
  }

  async function refreshAndRender() {
    // 1) load
    const rawSaves = await fetchSavesFromApi();

    // 2) sort newest first
    const sorted = rawSaves.slice().sort((a, b) => {
      const da = new Date(a.createdAt || 0).getTime();
      const db = new Date(b.createdAt || 0).getTime();
      return db - da;
    });

    // 3) ensure stats exist
    savesCache = await enrichSavesIfMissingStats(sorted);

    // 4) render
    render();
  }

  function render() {
    rowsEl.innerHTML = "";
    emptyStateEl.style.display = savesCache.length ? "none" : "block";

    for (const s of savesCache) {
      const profit = asInt(s.profit_gbp ?? 0, 0);
      const count = asInt(s.playerCount ?? 0, 0);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${
          s.id === editingSaveId
            ? `<input class="save-name-input" type="text" value="${escapeHtml(
                editingDraftName
              )}" data-name-input="${escapeHtml(s.id)}" />`
            : `<strong>${escapeHtml(s.name || "Untitled")}</strong>`
        }</td>
        <td class="val-muted">${escapeHtml(fmtDate(s.createdAt))}</td>
        <td class="num">${count}</td>
        <td class="num ${profit >= 0 ? "val-pos" : "val-neg"}">${fmtMoneyAbbrevGBP(profit)}</td>
        <td class="num">
          <div class="row-actions">
            ${
              s.id === editingSaveId
                ? `
                  <button class="icon-btn" data-save="${escapeHtml(s.id)}" type="button" title="Save">Save</button>
                  <button class="icon-btn" data-cancel="${escapeHtml(s.id)}" type="button" title="Cancel">Cancel</button>
                `
                : `
                  <a class="icon-btn" href="./tracker.html?save=${encodeURIComponent(
                    s.id
                  )}" title="Open">Open</a>
                  <button class="icon-btn" data-edit="${escapeHtml(
                    s.id
                  )}" type="button" title="Edit name">Edit</button>
                `
            }
            <button class="icon-btn danger" data-del="${escapeHtml(
              s.id
            )}" type="button" title="Delete">Delete</button>
          </div>
        </td>
      `;
      rowsEl.appendChild(tr);
    }
  }

  // Add new save -> API -> redirect to tracker
  btnAdd.addEventListener("click", async () => {
    const name = (prompt("Career save name?", "Barcelona") || "").trim();
    if (!name) return;

    try {
      // Expect API returns {id,name,createdAt,...}
      const created = await Api.post("/saves", { name });
      const id = created?.id;
      if (!id) throw new Error("API did not return an id for the new save.");
      location.href = `./tracker.html?save=${encodeURIComponent(id)}`;
    } catch (err) {
      console.error(err);
      alert("Failed to create save. Check console.");
    }
  });

  // Row actions
  rowsEl.addEventListener("click", async (e) => {
    // Start editing
    const editBtn = e.target.closest("button[data-edit]");
    if (editBtn) {
      const id = editBtn.dataset.edit;
      const save = savesCache.find((s) => s.id === id);
      editingSaveId = id;
      editingDraftName = (save?.name || "").trim();
      render();

      // focus after render
      setTimeout(() => {
        const inp = rowsEl.querySelector(`input[data-name-input="${CSS.escape(id)}"]`);
        if (inp) {
          inp.focus();
          inp.select();
        }
      }, 0);
      return;
    }

    // Cancel editing
    const cancelBtn = e.target.closest("button[data-cancel]");
    if (cancelBtn) {
      editingSaveId = null;
      editingDraftName = "";
      render();
      return;
    }

    // Save edited name -> API
    const saveBtn = e.target.closest("button[data-save]");
    if (saveBtn) {
      const id = saveBtn.dataset.save;
      const nextName = (editingDraftName || "").trim();

      try {
        await Api.put(`/saves/${encodeURIComponent(id)}`, { name: nextName || "Untitled" });
        editingSaveId = null;
        editingDraftName = "";
        await refreshAndRender();
      } catch (err) {
        console.error(err);
        alert("Failed to rename save. Check console.");
      }
      return;
    }

    // Delete -> API
    const delBtn = e.target.closest("button[data-del]");
    if (!delBtn) return;

    const id = delBtn.dataset.del;
    const save = savesCache.find((s) => s.id === id);
    const label = save?.name ? `"${save.name}"` : "this save";
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    try {
      await Api.del(`/saves/${encodeURIComponent(id)}`);

      // If we were editing this row, reset state
      if (editingSaveId === id) {
        editingSaveId = null;
        editingDraftName = "";
      }

      await refreshAndRender();
    } catch (err) {
      console.error(err);
      alert("Failed to delete save. Check console.");
    }
  });

  // Live edit text while in edit mode
  rowsEl.addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-name-input]");
    if (!inp) return;
    const id = inp.dataset.nameInput;
    if (id !== editingSaveId) return;
    editingDraftName = inp.value;
  });

  // Boot
  await refreshAndRender();
}
