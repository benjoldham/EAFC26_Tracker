// ✅ Require login before doing anything
(async function boot(){
  const ok = await Auth.requireLogin("index.html");
  if (!ok) return;
  initDashboard().catch(err => {
    console.error(err);
    alert("Dashboard failed to load. Check console.");
  });
})();

// FC26 Transfer Tracker — Dashboard (multi-save, cloud)

async function initDashboard(){

  // Local legacy keys (for optional import)
  const LEGACY_KEY_V7 = "fc26_transfer_tracker_v7";
  const LEGACY_KEY_V6 = "fc26_transfer_tracker_v6";

  function asInt(v,fallback=0){ const n=Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
  function profitGBP(p){ return asInt(p.sale_gbp ?? p.sale ?? 0,0) - asInt(p.cost_gbp ?? p.cost ?? 0,0); }

  // Money abbrev (GBP only on dashboard)
  function fmtMoneyAbbrevGBP(gbp){
    const sym = "£";
    const sign = gbp < 0 ? "-" : "";
    const abs = Math.abs(gbp || 0);
    const format = (val, suffix)=>{
      const absVal = Math.abs(val);
      let str;
      if (absVal >= 100) str = String(Math.round(val));
      else if (absVal >= 10) str = String(Math.round(val));
      else str = String(Math.round(val * 10) / 10).replace(/\.0$/, "");
      return sign + sym + str + suffix;
    };
    if (abs >= 1_000_000_000) return format(abs / 1_000_000_000, "B");
    if (abs >= 1_000_000) return format(abs / 1_000_000, "M");
    if (abs >= 1_000) return format(abs / 1_000, "K");
    return sign + sym + Math.round(abs).toLocaleString("en-GB");
  }

  function fmtDate(iso){
    if(!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { year:"numeric", month:"short", day:"2-digit" });
  }

  function escapeHtml(str){
    return String(str)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  const $ = (id)=>document.getElementById(id);
  const rowsEl = $("save-rows");
  const emptyStateEl = $("empty-state");
  const btnAdd = $("btn-add-save");

  let editingSaveId = null;
  let editingDraftName = "";

  // Cache
  let savesCache = [];
  const statsCache = new Map(); // saveId -> { count, profit, loading, error }

  async function fetchSaves(){
    savesCache = await Api.listSaves();
    // Sort newest first
    savesCache = (Array.isArray(savesCache) ? savesCache : []).slice().sort((a,b)=>{
      const da = new Date(a.createdAt||0).getTime();
      const db = new Date(b.createdAt||0).getTime();
      return db - da;
    });
  }

  async function ensureStats(saveId){
    if (statsCache.has(saveId)) return;
    statsCache.set(saveId, { loading:true, count:0, profit:0 });

    try{
      const transfers = await Api.listTransfers(saveId);
      const list = Array.isArray(transfers) ? transfers : [];
      const profit = list.reduce((sum,p)=> sum + profitGBP(p), 0);
      statsCache.set(saveId, { loading:false, count:list.length, profit });
    }catch(err){
      console.error(err);
      statsCache.set(saveId, { loading:false, error:true, count:0, profit:0 });
    }
    render(); // update the row once stats arrive
  }

  function render(){
    rowsEl.innerHTML = "";
    emptyStateEl.style.display = savesCache.length ? "none" : "block";

    for (const s of savesCache){
      const stats = statsCache.get(s.id);
      if (!stats) ensureStats(s.id);

      const countCell = stats?.loading ? "…" : String(stats?.count ?? 0);
      const profitVal = stats?.loading ? null : (stats?.profit ?? 0);
      const profitCell = stats?.loading ? "…" : fmtMoneyAbbrevGBP(profitVal);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.id === editingSaveId
          ? `<input class="save-name-input" data-name-input="${escapeHtml(s.id)}" value="${escapeHtml(editingDraftName)}" />`
          : `<strong>${escapeHtml(s.name || "Untitled")}</strong>`}
        </td>
        <td class="val-muted">${escapeHtml(fmtDate(s.createdAt))}</td>
        <td class="num">${countCell}</td>
        <td class="num ${profitVal == null ? "" : (profitVal >= 0 ? "val-pos" : "val-neg")}">${profitCell}</td>
        <td class="num">
          <div class="row-actions">
            ${s.id === editingSaveId ? `
              <button class="icon-btn" data-save="${escapeHtml(s.id)}" type="button" title="Save">Save</button>
              <button class="icon-btn" data-cancel="${escapeHtml(s.id)}" type="button" title="Cancel">Cancel</button>
            ` : `
              <a class="icon-btn" href="./tracker.html?save=${encodeURIComponent(s.id)}" title="Open">Open</a>
              <button class="icon-btn" data-edit="${escapeHtml(s.id)}" type="button" title="Edit name">Edit</button>
            `}
            <button class="icon-btn danger" data-del="${escapeHtml(s.id)}" type="button" title="Delete">Delete</button>
          </div>
        </td>
      `;
      rowsEl.appendChild(tr);
    }
  }

  // Optional: one-time import from old localStorage (only if cloud has no saves)
  async function importLegacyIfCloudEmpty(){
    try{
      await fetchSaves();
      if (savesCache.length) return;

      const raw = localStorage.getItem(LEGACY_KEY_V7) || localStorage.getItem(LEGACY_KEY_V6);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return;

      const created = await Api.createSave("Imported save");
      const saveId = created?.id;
      if (!saveId) return;

      await Promise.all(parsed.map(p => Api.createTransfer(saveId, {
        ...p,
        id: String(p.id || (Math.random().toString(16).slice(2) + Date.now().toString(16))),
      })));

      localStorage.removeItem(LEGACY_KEY_V7);
      localStorage.removeItem(LEGACY_KEY_V6);
    }catch(err){
      console.error("Legacy import failed", err);
    }
  }

  btnAdd.addEventListener("click", async ()=>{
    const name = (prompt("Career save name?", "Barcelona") || "").trim();
    if (!name) return;

    try{
      const created = await Api.createSave(name);
      if (!created?.id) throw new Error("No save id returned");
      location.href = `./tracker.html?save=${encodeURIComponent(created.id)}`;
    }catch(err){
      console.error(err);
      alert("Could not create save (AWS error). Please try again.");
    }
  });

  rowsEl.addEventListener("click", async (e)=>{
    // Start editing
    const editBtn = e.target.closest("button[data-edit]");
    if (editBtn){
      const id = editBtn.dataset.edit;
      const save = savesCache.find(s=>s.id===id);
      editingSaveId = id;
      editingDraftName = (save?.name || "").trim();
      render();
      setTimeout(()=>{
        const inp = rowsEl.querySelector(`input[data-name-input="${CSS.escape(id)}"]`);
        if (inp){ inp.focus(); inp.select(); }
      }, 0);
      return;
    }

    // Cancel editing
    const cancelBtn = e.target.closest("button[data-cancel]");
    if (cancelBtn){
      editingSaveId = null;
      editingDraftName = "";
      render();
      return;
    }

    // Save rename
    const saveBtn = e.target.closest("button[data-save]");
    if (saveBtn){
      const id = saveBtn.dataset.save;
      const nextName = (editingDraftName || "").trim() || "Untitled";
      try{
        await Api.updateSave(id, nextName);
        // update cache
        const idx = savesCache.findIndex(s=>s.id===id);
        if (idx !== -1) savesCache[idx] = { ...savesCache[idx], name: nextName || "Untitled" };
      }catch(err){
        console.error(err);
        alert("Could not rename save (AWS error). Please try again.");
      }
      editingSaveId = null;
      editingDraftName = "";
      render();
      return;
    }

    // Delete
    const delBtn = e.target.closest("button[data-del]");
    if (!delBtn) return;
    const id = delBtn.dataset.del;
    const save = savesCache.find(s=>s.id===id);
    const label = save?.name ? `\"${save.name}\"` : "this save";
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    try{
      await Api.deleteSave(id);
      savesCache = savesCache.filter(s=>s.id!==id);
      statsCache.delete(id);
      if (editingSaveId === id){
        editingSaveId = null;
        editingDraftName = "";
      }
      render();
    }catch(err){
      console.error(err);
      alert("Could not delete save (AWS error). Please try again.");
    }
  });

  rowsEl.addEventListener("input", (e)=>{
    const inp = e.target.closest("input[data-name-input]");
    if (!inp) return;
    const id = inp.dataset.nameInput;
    if (id !== editingSaveId) return;
    editingDraftName = inp.value;
  });

  await importLegacyIfCloudEmpty();
  await fetchSaves();
  render();
}
