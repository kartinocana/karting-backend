// ===============================
// PITS / ADMIN APP (FINAL)
// ===============================

const els = {
  api: document.getElementById("api"),
  saveApi: document.getElementById("btn-save-api"),
  reload: document.getElementById("btn-reload"),
  session: document.getElementById("session"),
  whoami: document.getElementById("whoami"),

  tbody: document.getElementById("tbody"),
  bStatus: document.getElementById("b-status"),
  bFlag: document.getElementById("b-flag"),
  bPart: document.getElementById("b-part"),

  btnStart: document.getElementById("btn-start"),
  btnPause: document.getElementById("btn-pause"),
  btnFinish: document.getElementById("btn-finish"),

  login: document.getElementById("btn-login"),
  logout: document.getElementById("btn-logout"),

  mLogin: document.getElementById("m-login"),
  mLoginClose: document.getElementById("btn-close-login"),
  mDoLogin: document.getElementById("btn-do-login"),
  role: document.getElementById("role"),
  token: document.getElementById("token"),

  mChange: document.getElementById("m-change"),
  mChangeClose: document.getElementById("btn-close-change"),
  changeTitle: document.getElementById("change-title"),
  changeLabel: document.getElementById("change-label"),
  changeSelect: document.getElementById("change-select"),
  changeHelp: document.getElementById("change-help"),
  changeConfirm: document.getElementById("btn-confirm-change"),
};

// ===============================
// STATE
// ===============================
let API = localStorage.getItem("pits_api") || els.api.value;
els.api.value = API;

let role = localStorage.getItem("pits_role") || "";
let token = localStorage.getItem("pits_token") || "";
let currentSessionId = null;

let cacheParticipants = [];
let cacheDrivers = [];
let cacheKarts = [];

let changePid = null;
let changeType = null;

// ===============================
// HELPERS
// ===============================
function setWhoami() {
  els.whoami.textContent = token ? `${role} ✅` : "Sin login";
}

function apiFetch(url, options = {}) {
  options.headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: "Bearer " + token } : {}),
    "Content-Type": "application/json"
  };
  return fetch(url, options);
}

function openModal(m) { m.style.display = "flex"; }
function closeModal(m) { m.style.display = "none"; }

function fmtMs(ms) {
  if (ms == null) return "-";
  const n = Number(ms);
  return Number.isFinite(n) ? (n / 1000).toFixed(3) : "-";
}

// ===============================
// LOAD DATA
// ===============================
async function loadSessions() {
  const res = await fetch(`${API}/sessions`);
  const sessions = await res.json();

  els.session.innerHTML = sessions
    .map(s => `<option value="${s.id}">${s.name || "Sesión " + s.id}</option>`)
    .join("");

  if (sessions.length) {
    currentSessionId = Number(els.session.value);
    await refreshAll();
  }
}

async function refreshAll() {
  if (!currentSessionId) return;
  await Promise.all([
    loadDriversAndKarts(),
    loadParticipants(),
    loadLive()
  ]);
}

async function loadDriversAndKarts() {
  const [dr, kt] = await Promise.all([
    fetch(`${API}/drivers`),
    fetch(`${API}/karts`)
  ]);

  cacheDrivers = await dr.json();
  cacheKarts = await kt.json();
}

async function loadParticipants() {
  const res = await fetch(`${API}/sessions/${currentSessionId}/participants`);
  const rows = await res.json();

  cacheParticipants = Array.isArray(rows) ? rows : [];
  els.bPart.textContent = "Participantes: " + cacheParticipants.length;
}

async function loadLive() {
  const res = await fetch(`${API}/sessions/${currentSessionId}/live-extended`);
  const data = await res.json().catch(() => ({ rows: [] }));

  renderTable(Array.isArray(data.rows) ? data.rows : []);
}

// ===============================
// RENDER
// ===============================
function renderTable(rows) {
  if (!rows.length) {
    els.tbody.innerHTML = `<tr><td colspan="6" class="muted">Sin datos</td></tr>`;
    return;
  }

  els.tbody.innerHTML = rows.map((r, i) => {
    const pid = r.participant_id;
    if (!pid) {
      console.warn("Fila sin participant_id", r);
      return "";
    }

    const kartTxt = r.racernumber ?? "—";
    const nameTxt = r.racername ?? "—";

    return `
      <tr data-pid="${pid}">
        <td>${i + 1}</td>
        <td class="click" data-action="kart">${kartTxt}</td>
        <td class="click" data-action="driver">${nameTxt}</td>
        <td>${r.lapcount ?? 0}</td>
        <td>${r.best != null ? fmtMs(r.best) : "-"}</td>
        <td>${r.lastTime != null ? fmtMs(r.lastTime) : "-"}</td>
      </tr>
    `;
  }).join("");
}

// ===============================
// CHANGE PILOT / KART
// ===============================
function getFreeKarts() {
  const used = new Set(cacheParticipants.map(p => p.kart_id).filter(Boolean));
  return cacheKarts.filter(k => !used.has(k.id));
}

function openChange(pid, type) {
  changePid = pid;
  changeType = type;

  if (type === "kart") {
    els.changeTitle.textContent = "Cambiar kart";
    els.changeLabel.textContent = "Kart libre";
    els.changeSelect.innerHTML = getFreeKarts()
      .map(k => `<option value="${k.id}">#${k.number}</option>`)
      .join("");
    els.changeHelp.textContent = "Solo karts no asignados.";
  } else {
    els.changeTitle.textContent = "Cambiar piloto";
    els.changeLabel.textContent = "Piloto";
    els.changeSelect.innerHTML = cacheDrivers
      .map(d => `<option value="${d.id}">${d.name}</option>`)
      .join("");
    els.changeHelp.textContent = "Lista completa de pilotos.";
  }

  openModal(els.mChange);
}

async function confirmChange() {
  if (!token) return alert("Necesitas login");

  const val = els.changeSelect.value;
  if (!val) return;

  const payload = changeType === "kart"
    ? { kart_id: Number(val) }
    : { driver_id: Number(val) };

  const res = await apiFetch(
    `${API}/sessions/${currentSessionId}/participants/${changePid}`,
    { method: "PUT", body: JSON.stringify(payload) }
  );

  if (!res.ok) {
    alert("Error cambiando participante");
    return;
  }

  closeModal(els.mChange);
  await refreshAll();
}

// ===============================
// RACE CONTROL
// ===============================
function postNoBody(path) {
  if (!token) return alert("Necesitas login");
  apiFetch(`${API}/sessions/${currentSessionId}/${path}`, { method: "POST" });
}

function setFlag(flag) {
  if (!token) return alert("Necesitas login");
  apiFetch(`${API}/sessions/${currentSessionId}/flag`, {
    method: "POST",
    body: JSON.stringify({ flag })
  });
}

// ===============================
// EVENTS
// ===============================
els.tbody.addEventListener("click", e => {
  const td = e.target.closest("td");
  const tr = e.target.closest("tr");
  if (!td || !tr) return;

  const action = td.dataset.action;
  if (!action) return;

  openChange(tr.dataset.pid, action);
});

els.saveApi.onclick = async () => {
  API = els.api.value.trim();
  localStorage.setItem("pits_api", API);
  await loadSessions();
};

els.reload.onclick = refreshAll;
els.session.onchange = async () => {
  currentSessionId = Number(els.session.value);
  await refreshAll();
};

els.btnStart.onclick = () => postNoBody("start");
els.btnPause.onclick = () => postNoBody("pause");
els.btnFinish.onclick = () => postNoBody("finish");

document.querySelectorAll("[data-flag]").forEach(b =>
  b.onclick = () => setFlag(b.dataset.flag)
);

// LOGIN
els.login.onclick = () => openModal(els.mLogin);
els.mLoginClose.onclick = () => closeModal(els.mLogin);
els.mDoLogin.onclick = () => {
  role = els.role.value;
  token = els.token.value.trim();
  localStorage.setItem("pits_role", role);
  localStorage.setItem("pits_token", token);
  closeModal(els.mLogin);
  setWhoami();
};
els.logout.onclick = () => {
  role = "";
  token = "";
  localStorage.clear();
  setWhoami();
};

els.mChangeClose.onclick = () => closeModal(els.mChange);
els.changeConfirm.onclick = confirmChange;

// ===============================
// INIT
// ===============================
setWhoami();
loadSessions();
setInterval(() => {
  if (currentSessionId) loadLive();
}, 1200);
