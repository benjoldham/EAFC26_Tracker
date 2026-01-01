// ✅ Require login before doing anything
(async function boot(){
  const ok = await Auth.requireLogin("index.html");
  if (!ok) return;
  initDashboard().catch(err => {
    console.error(err);
    alert("Dashboard failed to load. Check console.");
  });
})();

// FC26 Transfer Tracker — Dashboard (multi-save)

async function initDashboard(){

const SAVES_KEY = "fc26_transfer_tracker_saves_v1";
const SAVE_PREFIX = "fc26_transfer_tracker_save_v1_";

// Legacy single-save keys (pre-dashboard)
const LEGACY_KEY_V7 = "fc26_transfer_tracker_v7";
const LEGACY_KEY_V6 = "fc26_transfer_tracker_v6";

function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function asInt(v,fallback=0){ const n=Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function playersKey(saveId){ return `${SAVE_PREFIX}${saveId}_players`; }


// UI state
let editingSaveId = null;
let editingDraftName = "";
function loadSaves(){
  try{
    const raw = localStorage.getItem(SAVES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  }catch{ return []; }
}
function saveSaves(saves){ localStorage.setItem(SAVES_KEY, JSON.stringify(saves)); }

function loadPlayersForSave(saveId){
  try{
    const raw = localStorage.getItem(playersKey(saveId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  }catch{ return []; }
}

function profitGBP(p){ return asInt(p.sale_gbp,0) - asInt(p.cost_gbp,0); }
function fmtDate(iso){
  try{
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { year:"numeric", month:"short", day:"2-digit" });
  }catch{ return ""; }
}

function fmtMoneyAbbrevGBP(amountGBP){
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

function migrateLegacyIfNeeded(){
  const existing = loadSaves();
  if (existing.length) return;

  const raw = localStorage.getItem(LEGACY_KEY_V7) || localStorage.getItem(LEGACY_KEY_V6);
  if (!raw) return;
  let parsed;
  try{ parsed = JSON.parse(raw); }catch{ return; }
  if (!Array.isArray(parsed) || parsed.length === 0) return;

  const id = uid();
  const save = { id, name: "My Career Save", createdAt: new Date().toISOString() };
  saveSaves([save]);
  localStorage.setItem(playersKey(id), JSON.stringify(parsed));
  // Keep legacy key untouched (safe) — user can delete later.
}

const $ = (id)=>document.getElementById(id);
const rowsEl = $("save-rows");
const emptyStateEl = $("empty-state");
const btnAdd = $("btn-add-save");

function render(){
  const saves = loadSaves().slice().sort((a,b)=>{
    const da = new Date(a.createdAt||0).getTime();
    const db = new Date(b.createdAt||0).getTime();
    return db - da;
  });

  rowsEl.innerHTML = "";
  emptyStateEl.style.display = saves.length ? "none" : "block";

  for (const s of saves){
    const players = loadPlayersForSave(s.id);
    const profit = players.reduce((sum,p)=> sum + profitGBP(p), 0);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.id === editingSaveId ? `<input class="save-name-input" type="text" value="${escapeHtml(editingDraftName)}" data-name-input="${escapeHtml(s.id)}" />` : `<strong>${escapeHtml(s.name || "Untitled")}</strong>`}</td>
      <td class="val-muted">${escapeHtml(fmtDate(s.createdAt))}</td>
      <td class="num">${players.length}</td>
      <td class="num ${profit >= 0 ? "val-pos" : "val-neg"}">${fmtMoneyAbbrevGBP(profit)}</td>
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

function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

btnAdd.addEventListener("click", ()=>{
  const name = (prompt("Career save name?", "Barcelona") || "").trim();
  if (!name) return;

  const saves = loadSaves();
  const id = uid();
  saves.push({ id, name, createdAt: new Date().toISOString() });
  saveSaves(saves);
  localStorage.setItem(playersKey(id), JSON.stringify([]));
  location.href = `./tracker.html?save=${encodeURIComponent(id)}`;
});

rowsEl.addEventListener("click", (e)=>{
  // Start editing
  const editBtn = e.target.closest("button[data-edit]");
  if (editBtn){
    const id = editBtn.dataset.edit;
    const saves = loadSaves();
    const save = saves.find(s=>s.id===id);
    editingSaveId = id;
    editingDraftName = (save?.name || "").trim();
    render();
    // focus after render
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

  // Save edited name
  const saveBtn = e.target.closest("button[data-save]");
  if (saveBtn){
    const id = saveBtn.dataset.save;
    const nextName = (editingDraftName || "").trim();
    const saves = loadSaves();
    const idx = saves.findIndex(s=>s.id===id);
    if (idx !== -1){
      saves[idx] = { ...saves[idx], name: nextName || "Untitled" };
      saveSaves(saves);
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
  const saves = loadSaves();
  const save = saves.find(s=>s.id===id);
  const label = save?.name ? `\"${save.name}\"` : "this save";
  if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

  const next = saves.filter(s=>s.id!==id);
  saveSaves(next);
  localStorage.removeItem(playersKey(id));
  // If we were editing this row, reset state
  if (editingSaveId === id){
    editingSaveId = null;
    editingDraftName = "";
  }
  render();
});

rowsEl.addEventListener("input", (e)=>{
  const inp = e.target.closest("input[data-name-input]");
  if (!inp) return;
  const id = inp.dataset.nameInput;
  if (id !== editingSaveId) return;
  editingDraftName = inp.value;
});

// Boot
migrateLegacyIfNeeded();
render();

} // end initDashboard
