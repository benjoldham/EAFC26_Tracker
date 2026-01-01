// FC26 Transfer Tracker (v7) — v6 UI + correct sorting + ex-player toggle
// Exchange rates source: exchangerate-api.com (open.er-api.com) base GBP.
// Rates last updated: Tue, 23 Dec 2025 00:02:31 +0000.

// ✅ Require login (Cognito) before allowing access to tracker
if (typeof Auth !== "undefined" && !Auth.isLoggedIn() && !/\/auth\.html$/.test(location.pathname)) {
  Auth.login(location.pathname + location.search);
  throw new Error("Redirecting to login...");
}


function getDashboardUrl(){
  // Works whether this page is /tracker/ or root
  const p = window.location.pathname || "";
  if (p.includes("/tracker/") || p.endsWith("/tracker")) return "../index.html";
  return "./index.html";
}
// ---------- multi-save (cloud) ----------
function getSaveIdFromUrl(){
  const url = new URL(location.href);
  return url.searchParams.get("save");
}

let CURRENT_SAVE_ID = getSaveIdFromUrl();
let CURRENT_SAVE = { id: CURRENT_SAVE_ID, name: "" };

if (!CURRENT_SAVE_ID){
  // If someone opens the tracker without selecting a save, send them to the dashboard.
  location.replace(getDashboardUrl());
}

// Fetch current save (name) from API
async function hydrateCurrentSave(){
  try{
    const saves = await Api.listSaves();
    const found = saves.find(s => s.id === CURRENT_SAVE_ID);
    if (!found){
      location.replace(getDashboardUrl());
      return false;
    }
    CURRENT_SAVE = found;
    return true;
  }catch(err){
    console.error(err);
    alert("Failed to load your career save. Please refresh.");
    return false;
  }
}

// 1 GBP = X currency units
const FX = { GBP: 1, EUR: 1.144446, USD: 1.34518 };
const CURRENCY_META = { GBP: { symbol: "£" }, EUR: { symbol: "€" }, USD: { symbol: "$" } };

// ---------- helpers ----------
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function clamp(n,min,max){ const x=Number(n); if(!Number.isFinite(x)) return min; return Math.min(max, Math.max(min,x)); }
function parseMoneyInput(str){
  const s = String(str ?? "").replaceAll(",", "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}
function asInt(v,fallback=0){ const n=Number(v); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function fmtNumberForInput(n){
  const x = Number(n);
  if (!Number.isFinite(x) || x === 0) return "";
  return Math.trunc(x).toLocaleString("en-GB");
}
function fullName(firstName,surname){
  const f=(firstName||"").trim();
  const s=(surname||"").trim();
  return (f+" "+s).trim();
}
function displayName(p){
  const first=(p.firstName||"").trim();
  const sur=(p.surname||"").trim();
  if(!first && !sur) return "";
  const initial = first ? first[0].toUpperCase()+"." : "";
  const space = initial && sur ? " " : "";
  return initial + space + sur;
}
function potAvg(p){
  const min=asInt(p.potMin,0);
  const max=asInt(p.potMax,0);
  if(!min && !max) return null;
  return (min+max)/2;
}
function statusFromAvg(avg){
  if(!Number.isFinite(avg)) return "N/A";
  if(avg>=90) return "Special";
  if(avg>=85) return "Exciting";
  if(avg>=80) return "Great";
  return "Sell";
}
function profitGBP(p){ return asInt(p.sale_gbp,0) - asInt(p.cost_gbp,0); }
function roi(p){
  const cost=asInt(p.cost_gbp,0);
  const sale=asInt(p.sale_gbp,0);
  if(cost<=0 || sale<=0) return null;
  return (sale - cost)/cost;
}
function badgeClass(status){
  switch(status){
    case "Special": return "special";
    case "Exciting": return "exciting";
    case "Great": return "great";
    case "Sell": return "sell";
    default: return "";
  }
}
function valClassFromNumber(n){
  if(!Number.isFinite(n)) return "";
  return n>=0 ? "val-pos" : "val-neg";
}
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function convertFromGBP(amountGBP, currency){
  const c = (currency in FX) ? currency : "GBP";
  return Number(amountGBP) * FX[c];
}
function convertToGBP(amountInCurrency, currency){
  const c = (currency in FX) ? currency : "GBP";
  return Number(amountInCurrency) / FX[c];
}

function abbrevNumber(n){
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const format = (val, suffix) => {
    const absVal = Math.abs(val);
    let str;
    if (absVal >= 10) str = String(Math.round(val));
    else str = String(Math.round(val * 10) / 10).replace(/\.0$/, "");
    return sign + str + suffix;
  };
  if (abs >= 1_000_000_000) return format(abs / 1_000_000_000, "B");
  if (abs >= 1_000_000) return format(abs / 1_000_000, "M");
  if (abs >= 1_000) return format(abs / 1_000, "K");
  return sign + Math.round(abs).toLocaleString("en-GB");
}
function fmtMoneyAbbrevFromGBP(amountGBP, currency){
  const cur = (currency in CURRENCY_META) ? currency : "GBP";
  const sym = CURRENCY_META[cur].symbol;
  const converted = convertFromGBP(amountGBP, cur);
  const str = abbrevNumber(converted);
  if (str.startsWith("-")) return "-" + sym + str.slice(1);
  return sym + str;
}
function fmtPct(p){
  if(!Number.isFinite(p)) return "—";
  return Math.trunc(p*100) + "%";
}

// ---------- boot: save selection (cloud) ----------
(async function boot(){
  const ok = await hydrateCurrentSave();
  if (!ok) return;

  // Set tracker title (save name)
  const saveTitleEl = document.getElementById("save-title");
  if (saveTitleEl){
    saveTitleEl.textContent = CURRENT_SAVE?.name || "Untitled";
  }

  // Load transfers for this save
  await loadPlayersFromApi();

  // Now that data is loaded, render
  updateEditName();
  applySeniorityToForm();

  if (toggleExEl) toggleExEl.checked = true;
  showExPlayers = true;

  setCurrency("GBP");
  setSeniorityFilter("Senior");
  updateSortIndicators();
  render();
})();

// Title editor (updates save name)
const editTitleBtn = document.getElementById("edit-save-title");
if (saveTitleEl && editTitleBtn){
  let isEditingTitle = false;
  let originalTitle = saveTitleEl.textContent || "";

  const placeCaretAtEnd = (el)=>{
    try{
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }catch{}
  };

  const startTitleEdit = ()=>{
    originalTitle = saveTitleEl.textContent || "";
    isEditingTitle = true;
    editTitleBtn.textContent = "Done";
    saveTitleEl.setAttribute("contenteditable","true");
    saveTitleEl.setAttribute("spellcheck","false");
    saveTitleEl.focus();
    placeCaretAtEnd(saveTitleEl);
  };

  const commitTitleEdit = ()=>{
    if (!isEditingTitle) return;
    isEditingTitle = false;
    editTitleBtn.textContent = "Edit title";
    saveTitleEl.removeAttribute("contenteditable");
    saveTitleEl.removeAttribute("spellcheck");

    const next = (saveTitleEl.textContent || "").trim() || "Untitled";
    saveTitleEl.textContent = next; // normalize
    document.title = `${next} — FC26 Transfer Tracker`;
    (async ()=>{
      try{
        await Api.updateSave(CURRENT_SAVE_ID, next);
        CURRENT_SAVE.name = next;
      }catch(err){
        console.error(err);
        alert("Could not rename save (AWS error). Please try again.");
        // revert title
        saveTitleEl.textContent = CURRENT_SAVE?.name || originalTitle || "Untitled";
      }
    })();
  };

  const cancelTitleEdit = ()=>{
    if (!isEditingTitle) return;
    saveTitleEl.textContent = originalTitle;
    isEditingTitle = false;
    editTitleBtn.textContent = "Edit title";
    saveTitleEl.removeAttribute("contenteditable");
    saveTitleEl.removeAttribute("spellcheck");
  };

  editTitleBtn.addEventListener("click", ()=>{
    if (!isEditingTitle) startTitleEdit();
    else commitTitleEdit();
  });

  saveTitleEl.addEventListener("keydown", (e)=>{
    if (!isEditingTitle) return;
    if (e.key === "Enter"){ e.preventDefault(); commitTitleEdit(); }
    if (e.key === "Escape"){ e.preventDefault(); cancelTitleEdit(); }
  });

  // Live-update the document title while typing (no API calls until you click Done)
  saveTitleEl.addEventListener("input", ()=>{
    if (!isEditingTitle) return;
    const next = (saveTitleEl.textContent || "").trim() || "Untitled";
    document.title = `${next} — FC26 Transfer Tracker`;
  });

  saveTitleEl.addEventListener("blur", ()=>{
    if (isEditingTitle) commitTitleEdit();
  });
}

// ---------- state ----------
let players = [];
let editingId = null;

let seniorityFilter = "Senior"; // shared
let currency = "GBP";           // shared
let showExPlayers = true;       // players list only

let lastFlashId = null;

// Sorting (default: OVR high -> low)
let sortKey = "ovr";
let sortDir = "desc"; // "asc" | "desc"

const POS_ORDER = ["GK","RB","CB","LB","CDM","CM","CAM","RM","LM","ST"];
const STATUS_ORDER = ["Special","Exciting","Great","Sell"];

// ---------- DOM ----------
const $ = (id)=>document.getElementById(id);

const editCard = $("edit-card");
const editNameEl = $("edit-player-name");

const form = $("player-form");
const fFirst = $("f-first");
const fSurname = $("f-surname");
const fSeniority = $("f-seniority");
const fPos = $("f-pos");
const fIntl = $("f-intl");
const fPotMin = $("f-potmin");
const fPotMax = $("f-potmax");
const fActive = $("f-active");
const fCost = $("f-cost");
const fSale = $("f-sale");

const btnAdd = $("btn-add");
const btnUpdate = $("btn-update");
const btnClear = $("btn-clear");
const btnCancel = $("btn-cancel");
const btnReset = $("btn-reset");
const btnExport = $("btn-export");
const importFile = $("import-file");

const rowsEl = $("rows");
const tCost = $("t-cost");
const tSale = $("t-sale");
const tProfit = $("t-profit");
const tRoi = $("t-roi");

const searchEl = $("search");
const filterActiveEl = $("filter-active");
const toggleExEl = $("toggle-ex");

const allSenioritySegs = Array.from(document.querySelectorAll('.segmented[aria-label="Seniority filter"]'));
const currencySeg = document.querySelector('.segmented[aria-label="Currency"]');
const sortableHeaders = Array.from(document.querySelectorAll("th.sortable"));

// ---------- persistence ----------
async function loadPlayersFromApi(){
  if(!CURRENT_SAVE_ID) { players = []; return; }
  try{
    const list = await Api.listTransfers(CURRENT_SAVE_ID);
    // Normalize fields to keep the rest of the UI logic unchanged
    players = (Array.isArray(list) ? list : []).map(p => {
      const seniority = (p.seniority === "Youth") ? "Youth" : "Senior";
      const cost_gbp = asInt(p.cost_gbp ?? p.cost ?? 0, 0);
      const sale_gbp = asInt(p.sale_gbp ?? p.sale ?? 0, 0);
      const active = (p.active === "N") ? "N" : "Y";
      return { ...p, seniority, cost_gbp, sale_gbp, active };
    });
  }catch(err){
    console.error(err);
    alert("Failed to load transfers from AWS. Please refresh.");
    players = [];
  }
}

// CRUD helpers
async function createPlayerInApi(player){
  const payload = { ...player };
  // Ensure id exists (backend can accept it or generate one)
  if (!payload.id) payload.id = uid();
  const created = await Api.createTransfer(CURRENT_SAVE_ID, payload);
  return created || payload;
}
async function updatePlayerInApi(playerId, player){
  const payload = { ...player, id: playerId };
  const updated = await Api.updateTransfer(CURRENT_SAVE_ID, playerId, payload);
  return updated || payload;
}
async function deletePlayerInApi(playerId){
  await Api.deleteTransfer(CURRENT_SAVE_ID, playerId);
}

// ---------- edit name display ----------
function updateEditName(){
  const name = fullName(fFirst.value, fSurname.value);
  editNameEl.textContent = name || "New Player";
}
fFirst.addEventListener("input", updateEditName);
fSurname.addEventListener("input", updateEditName);

// ---------- seniority (form) ----------
function applySeniorityToForm(){
  const s = fSeniority.value === "Youth" ? "Youth" : "Senior";
  if(s === "Youth"){
    fCost.value = "0";
    fCost.disabled = true;
  }else{
    fCost.disabled = false;
  }
}
fSeniority.addEventListener("change", applySeniorityToForm);

// ---------- currency ----------
function setCurrency(next){
  currency = (next === "EUR" || next === "USD") ? next : "GBP";
  for (const b of Array.from(currencySeg.querySelectorAll(".seg-btn"))){
    b.classList.toggle("active", b.dataset.currency === currency);
  }
  syncMoneyInputsToCurrency();
  render();
}
currencySeg.addEventListener("click", (e)=>{
  const btn = e.target.closest("button.seg-btn");
  if(!btn) return;
  setCurrency(btn.dataset.currency);
});

function syncMoneyInputsToCurrency(){
  if(!editingId) return;
  const p = players.find(x=>x.id===editingId);
  if(!p) return;
  fCost.value = fmtNumberForInput(Math.round(convertFromGBP(p.cost_gbp||0, currency)));
  fSale.value = fmtNumberForInput(Math.round(convertFromGBP(p.sale_gbp||0, currency)));
  applySeniorityToForm();
}

// ---------- shared seniority filters ----------
function setSeniorityFilter(next){
  seniorityFilter = (next === "Youth" || next === "All") ? next : "Senior";
  for(const seg of allSenioritySegs){
    for(const b of Array.from(seg.querySelectorAll(".seg-btn"))){
      b.classList.toggle("active", b.dataset.seniority === seniorityFilter);
    }
  }
  render();
}
for(const seg of allSenioritySegs){
  seg.addEventListener("click", (e)=>{
    const btn = e.target.closest("button.seg-btn");
    if(!btn) return;
    setSeniorityFilter(btn.dataset.seniority);
  });
}
function matchesSeniority(p){
  const s = p.seniority || "Senior";
  if(seniorityFilter === "All") return true;
  return s === seniorityFilter;
}

// ---------- show ex-players toggle (players list only) ----------
if (toggleExEl){
  toggleExEl.addEventListener("change", ()=>{
    showExPlayers = !!toggleExEl.checked;
    render();
  });
}

// ---------- sorting ----------
function tieBreakName(a,b){
  const sur = String(a.surname||"").localeCompare(String(b.surname||""), undefined, { sensitivity:"base" });
  if (sur !== 0) return sur;
  return String(a.firstName||"").localeCompare(String(b.firstName||""), undefined, { sensitivity:"base" });
}

function sortIndex(arr, val){
  const i = arr.indexOf(String(val||""));
  return i === -1 ? 999 : i;
}

function sortValue(p, key){
  switch(key){
    case "player": return String(p.surname || "");
    case "seniority": return (p.seniority === "Youth") ? 1 : 0; // Senior then Youth (asc)
    case "position": return sortIndex(POS_ORDER, p.pos);
    case "ovr": return asInt(p.intl, 0);
    case "potential": {
      const a = potAvg(p);
      return a == null ? -1 : Math.trunc(a);
    }
    case "status": return sortIndex(STATUS_ORDER, statusFromAvg(potAvg(p)));
    case "cost": return asInt(p.cost_gbp, 0);
    case "sale": return asInt(p.sale_gbp, 0);
    case "profit": return profitGBP(p);
    case "roi": {
      const r = roi(p);
      return Number.isFinite(r) ? r : -Infinity;
    }
    default: return 0;
  }
}

function sortPlayers(list){
  const dir = (sortDir === "asc") ? 1 : -1;
  return [...list].sort((a,b)=>{
    const A = sortValue(a, sortKey);
    const B = sortValue(b, sortKey);

    if (A === B) return tieBreakName(a,b);

    if (sortKey === "player"){
      return dir * String(A).localeCompare(String(B), undefined, { sensitivity:"base" });
    }
    // numeric / index sorts
    return dir * ((A > B) ? 1 : -1);
  });
}

function updateSortIndicators(){
  for (const th of sortableHeaders){
    th.classList.remove("active-sort");
    const a = th.querySelector(".arrow");
    if (a) a.remove();
  }
  const active = sortableHeaders.find(th => th.dataset.sort === sortKey);
  if (!active) return;
  active.classList.add("active-sort");
  const sp = document.createElement("span");
  sp.className = "arrow";
  sp.textContent = sortDir === "asc" ? "▲" : "▼";
  active.appendChild(sp);
}

for (const th of sortableHeaders){
  th.addEventListener("click", ()=>{
    const key = th.dataset.sort;
    if (!key) return;
    if (sortKey === key){
      sortDir = (sortDir === "asc") ? "desc" : "asc";
    } else {
      sortKey = key;
      // default direction by column
      if (["player","seniority","position","status"].includes(key)) sortDir = "asc";
      else sortDir = "desc";
      if (key === "ovr") sortDir = "desc";
    }
    updateSortIndicators();
    render();
  });
}

// ---------- formatting inputs (commas) ----------
function formatNumericWithCommas(el){
  if(el.disabled) return;
  const raw = String(el.value ?? "");
  const digits = raw.replace(/[^0-9]/g,"");
  if(!digits){ el.value=""; return; }
  if(digits.length>15){ el.value=digits; return; }
  el.value = Number(digits).toLocaleString("en-GB");
}
fCost.addEventListener("input", ()=>formatNumericWithCommas(fCost));
fSale.addEventListener("input", ()=>formatNumericWithCommas(fSale));

// ---------- rendering ----------
function render(){
  const q = (searchEl.value||"").trim().toLowerCase();
  const activeFilter = filterActiveEl.value;

  let filtered = players
    .filter(matchesSeniority)
    .filter(p=>{
      if(!showExPlayers && p.active !== "Y") return false;
      if(showExPlayers && activeFilter !== "ALL" && p.active !== activeFilter) return false;
      if(!q) return true;
      return (displayName(p)||"").toLowerCase().includes(q) || (p.pos||"").toLowerCase().includes(q);
    });

  filtered = sortPlayers(filtered);

  rowsEl.innerHTML = "";
  for(const p of filtered){
    const avg = potAvg(p);
    const avgDisplay = avg==null ? "—" : String(Math.trunc(avg));
    const status = statusFromAvg(avg);
    const profGBP = profitGBP(p);
    const r = roi(p);

    const saleCell = asInt(p.sale_gbp,0) > 0
      ? `<span class="val-pos">${fmtMoneyAbbrevFromGBP(p.sale_gbp, currency)}</span>`
      : `<span class="val-muted">N/A</span>`;

    const tr = document.createElement("tr");
    if (p.active === "N") tr.classList.add("inactive");
    if (lastFlashId && p.id === lastFlashId) tr.classList.add("flash");

    tr.innerHTML = `
      <td>${escapeHtml(displayName(p))}</td>
      <td>${escapeHtml(p.seniority || "Senior")}</td>
      <td>${escapeHtml(p.pos || "")}</td>
      <td>${escapeHtml(String(p.intl ?? ""))}</td>
      <td>${avgDisplay}</td>
      <td><span class="badge ${badgeClass(status)}">${status}</span></td>
      <td>${escapeHtml(p.active || "Y")}</td>
      <td class="num"><span class="val-neg">${fmtMoneyAbbrevFromGBP(p.cost_gbp || 0, currency)}</span></td>
      <td class="num">${saleCell}</td>
      <td class="num"><span class="${valClassFromNumber(profGBP)}">${fmtMoneyAbbrevFromGBP(profGBP, currency)}</span></td>
      <td class="num"><span class="${valClassFromNumber(Number.isFinite(r)?r:NaN)}">${fmtPct(r)}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-action="edit" data-id="${p.id}">Edit</button>
          <button class="icon-btn danger" data-action="delete" data-id="${p.id}">Delete</button>
        </div>
      </td>`;
    rowsEl.appendChild(tr);
  }

  if (lastFlashId){
    const id = lastFlashId;
    setTimeout(()=>{
      if (lastFlashId === id){
        lastFlashId = null;
        render();
      }
    }, 1400);
  }

  renderTotals();
}

function renderTotals(){
  // Totals include active + ex players, but respect seniorityFilter
  const list = players.filter(matchesSeniority);

  const totalCostGBP = list.reduce((s,p)=>s+asInt(p.cost_gbp,0),0);
  const totalSaleGBP = list.reduce((s,p)=>s+asInt(p.sale_gbp,0),0);
  const totalProfitGBP = list.reduce((s,p)=>s+profitGBP(p),0);

  const rois = list.map(roi).filter(v=>Number.isFinite(v));
  const avgRoi = rois.length ? rois.reduce((a,b)=>a+b,0)/rois.length : null;

  tCost.textContent = fmtMoneyAbbrevFromGBP(totalCostGBP, currency);
  tSale.textContent = fmtMoneyAbbrevFromGBP(totalSaleGBP, currency);
  tProfit.textContent = fmtMoneyAbbrevFromGBP(totalProfitGBP, currency);
  tRoi.textContent = avgRoi==null ? "—" : fmtPct(avgRoi);

  tProfit.classList.remove("val-pos","val-neg");
  tProfit.classList.add(totalProfitGBP>=0 ? "val-pos":"val-neg");

  tRoi.classList.remove("val-pos","val-neg");
  if(avgRoi!=null) tRoi.classList.add(avgRoi>=0 ? "val-pos":"val-neg");
}

// ---------- events ----------
btnAdd.addEventListener("click", async ()=>{
  const data = readForm();
  if(!data) return;

  try{
    // Create in AWS first (so it has an id)
    const created = await createPlayerInApi(data);
    players.push(created);

    // Auto-switch Senior/Youth unless currently All
    if (seniorityFilter !== "All"){
      setSeniorityFilter(created.seniority);
    }
    lastFlashId = created.id;

    clearForm();
    render();
  }catch(err){
    console.error(err);
    alert("Could not add player (AWS error). Please try again.");
  }
});

btnUpdate.addEventListener("click", async ()=>{
  if(!editingId) return;
  const data = readForm();
  if(!data) return;

  const idx = players.findIndex(p=>p.id===editingId);
  if(idx === -1) return;

  const next = { ...data, id: editingId, createdAt: players[idx].createdAt || Date.now() };

  try{
    const updated = await updatePlayerInApi(editingId, next);
    players[idx] = { ...players[idx], ...updated };

    if (seniorityFilter !== "All"){
      setSeniorityFilter(players[idx].seniority);
    }
    lastFlashId = editingId;

    clearForm();
    render();
  }catch(err){
    console.error(err);
    alert("Could not update player (AWS error). Please try again.");
  }
});

btnClear.addEventListener("click", ()=>{
  form.reset();
  fActive.value = "Y";
  fCost.value = "";
  fSale.value = "";
  fPos.value = "";
  fSeniority.value = "Senior";
  applySeniorityToForm();
  updateEditName();
});

btnCancel.addEventListener("click", ()=>clearForm());

btnReset.addEventListener("click", async ()=>{
  const ok = confirm("Reset everything? This deletes all players from this career save.");
  if(!ok) return;

  try{
    // Delete all transfers in AWS for this save
    const ids = players.map(p=>p.id).filter(Boolean);
    await Promise.all(ids.map(id => deletePlayerInApi(id)));
    players = [];
    clearForm();
    render();
  }catch(err){
    console.error(err);
    alert("Could not reset (AWS error). Please try again.");
  }
});

rowsEl.addEventListener("click", (e)=>{
  const btn = e.target.closest("button");
  if(!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const p = players.find(x=>x.id===id);
  if(!p) return;

  if(action==="edit") loadIntoForm(p);
  if(action==="delete"){
    const ok = confirm(`Delete ${displayName(p)}?`);
    if(!ok) return;
    try{
      await deletePlayerInApi(id);
      players = players.filter(x=>x.id!==id);
      if(editingId===id) clearForm();
      render();
    }catch(err){
      console.error(err);
      alert("Could not delete (AWS error). Please try again.");
    }
  }
});

searchEl.addEventListener("input", render);
filterActiveEl.addEventListener("change", render);

btnExport.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(players,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fc26-transfer-tracker.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importFile.addEventListener("change", async ()=>{
  const file = importFile.files?.[0];
  if(!file) return;
  try{
    const text = await file.text();
    const parsed = JSON.parse(text);
    if(!Array.isArray(parsed)) throw new Error("Invalid file format");
    const prevIds = players.map(p=>p.id).filter(Boolean);
    players = parsed.map(x=>{
      const seniority = (x.seniority === "Youth") ? "Youth" : "Senior";
      const cost_gbp = asInt(x.cost_gbp ?? x.cost ?? 0, 0);
      const sale_gbp = asInt(x.sale_gbp ?? x.sale ?? 0, 0);
      return {
        id: String(x.id || uid()),
        firstName: String(x.firstName || x.first || ""),
        surname: String(x.surname || x.last || ""),
        seniority,
        pos: String(x.pos || ""),
        intl: asInt(x.intl,0),
        potMin: asInt(x.potMin,0),
        potMax: asInt(x.potMax,0),
        active: (x.active === "N" ? "N" : "Y"),
        cost_gbp,
        sale_gbp,
        createdAt: Number.isFinite(Number(x.createdAt)) ? Number(x.createdAt) : Date.now(),
      };
    });
    // Replace all transfers in AWS with the imported list
    await Promise.all(prevIds.map(id => deletePlayerInApi(id)));
    const created = await Promise.all(players.map(p => createPlayerInApi(p)));
    players = created;

    clearForm();
    render();
  }catch(err){
    alert("Could not import file: " + (err?.message || String(err)));
  }finally{
    importFile.value="";
  }
});

form.addEventListener("keydown", (e)=>{
  if(e.key!=="Enter") return;
  e.preventDefault();
  if(editingId) btnUpdate.click(); else btnAdd.click();
});

// ---------- form ----------
function readForm(){
  const firstName = (fFirst.value||"").trim();
  const surname = (fSurname.value||"").trim();
  const seniority = (fSeniority.value==="Youth" ? "Youth" : "Senior");
  const pos = (fPos.value||"").trim().toUpperCase();

  if(!firstName) return alert("Forename is required."), null;
  if(!surname) return alert("Surname is required."), null;
  if(!pos) return alert("Position is required."), null;

  const intl = clamp(fIntl.value,1,99);
  const potMin = clamp(fPotMin.value,1,99);
  const potMax = clamp(fPotMax.value,1,99);
  const active = (fActive.value==="N"?"N":"Y");

  const costInCur = (seniority==="Youth") ? 0 : Math.max(0, parseMoneyInput(fCost.value));
  const saleInCur = Math.max(0, parseMoneyInput(fSale.value));

  const cost_gbp = Math.round(convertToGBP(costInCur, currency));
  const sale_gbp = Math.round(convertToGBP(saleInCur, currency));

  return { id: uid(), firstName, surname, seniority, pos, intl, potMin, potMax, active, cost_gbp, sale_gbp, createdAt: Date.now() };
}

function loadIntoForm(p){
  editingId = p.id;
  fFirst.value = p.firstName || "";
  fSurname.value = p.surname || "";
  fSeniority.value = (p.seniority==="Youth" ? "Youth":"Senior");
  fPos.value = p.pos || "";
  fIntl.value = p.intl ?? "";
  fPotMin.value = p.potMin ?? "";
  fPotMax.value = p.potMax ?? "";
  fActive.value = (p.active==="N"?"N":"Y");

  fCost.value = fmtNumberForInput(Math.round(convertFromGBP(p.cost_gbp ?? 0, currency)));
  fSale.value = fmtNumberForInput(Math.round(convertFromGBP(p.sale_gbp ?? 0, currency)));

  applySeniorityToForm();
  updateEditName();

  editCard.classList.add("editing");
  btnCancel.classList.remove("hidden");
  btnAdd.classList.add("hidden");
  btnUpdate.classList.remove("hidden");

  editCard.scrollIntoView({behavior:"smooth", block:"start"});
}

function clearForm(){
  editingId = null;
  form.reset();
  fActive.value = "Y";
  fCost.value = "";
  fSale.value = "";
  fPos.value = "";
  fSeniority.value = "Senior";
  applySeniorityToForm();
  updateEditName();

  editCard.classList.remove("editing");
  btnCancel.classList.add("hidden");
  btnUpdate.classList.add("hidden");
  btnAdd.classList.remove("hidden");
}

// ---------- init ----------
// (Bootstrapped in async boot() above)
