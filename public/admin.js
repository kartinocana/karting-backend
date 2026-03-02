// ====================================================
// ULTRA RACECONTROL - ADMIN FRONTEND (FINAL CORREGIDO)
// ====================================================
// 🔧 alias de compatibilidad (HTML antiguo)
window.assignKart = function(index, kartId) {
  assignTempKart(index, kartId);
};
console.log("🚀 admin.js CARGADO");
let hash = "";

const API = window.API_BASE || "http://localhost:4000/api";

// -------------------------------
// Helpers DOM & Helpers API
// -------------------------------

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));



async function apiGet(path, fallback = []) {
  try {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("API GET ERROR", e);
    return fallback;
  }
}


async function apiSend(url, method = "POST", body = null) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return await res.json();
}


document.addEventListener("DOMContentLoaded", () => {

  const hash = window.location.hash.replace("#", "");
  const urlParams = new URLSearchParams(window.location.search);
  const editId = urlParams.get("edit");

  const navBtns = qsa(".nav-button");
  const sections = qsa(".section");
  const title = qs(".main-area header h2");

  // ===== CLICK NORMAL DE NAVEGACIÓN =====
  navBtns.forEach(btn => {
    btn.addEventListener("click", e => {

      // bloquear clicks automáticos falsos
      if (!e.isTrusted) return;

      navBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      sections.forEach(s => s.classList.remove("active"));
      const sectionId = btn.dataset.section;
      const section = qs(`#${sectionId}`);
      if (section) section.classList.add("active");

      if (title) title.textContent = btn.textContent.trim();
    });
  });

  // ===== LÓGICA DE CARGA INICIAL (IMPORTANTE) =====

  // CASO 1 — Venimos desde campeonato para editar piloto
  if (editId) {
    const driverBtn = document.querySelector(
      `.nav-button[data-section="section-drivers"]`
    );

    if (driverBtn) {
      driverBtn.click(); // abre sección drivers
    }

    // Esperamos a que la UI esté lista y cargamos el piloto
   setTimeout(() => {
  fillDriverForm(Number(editId));
}, 900);


    window.__navInitialized = true;
    return; // ⛔ no sigas evaluando hash ni dashboard
  }

  // CASO 2 — Venimos con hash explícito (#drivers, #sessions, etc.)
  if (hash) {
    const btn = document.querySelector(
      `.nav-button[data-section="section-${hash}"]`
    );

    if (btn) {
      btn.click();
      window.__navInitialized = true;
      return;
    }
  }

  // CASO 3 — Primera carga normal → dashboard
  if (!window.__navInitialized) {
    window.__navInitialized = true;
    initDashboard();
  }

});


// ====================================================
// OVERVIEW
// ====================================================

async function updateOverview() {
  const [drivers, karts, sessions] = await Promise.all([
    apiGet("/drivers", []),
    apiGet("/karts", []),
    apiGet("/sessions", []),
  ]);

  qs("#overview-drivers-count").textContent = drivers.length;
  qs("#overview-karts-count").textContent = karts.length;

  const today = new Date().toISOString().slice(0, 10);

  const running = sessions.filter(s => s.status === "running").length;
  const finishedToday = sessions.filter(
    s => s.status === "finished" && s.finished_at?.slice(0, 10) === today
  ).length;

  qs("#overview-running-count").textContent = running;
  qs("#overview-finished-today").textContent = finishedToday;
}

async function loadDailyRanking() {
  const rows = await apiGet("/rankings/best-laps", []);
  const tbody = qs("#ranking-daily-body");
  if (!tbody) return;

  tbody.innerHTML = rows
    .map(
      (r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${r.driver_name || "-"}</td>
          <td>${formatLapTime(r.best_lap_ms || r.best_lap || 0)}</td>
        </tr>
      `
    )
    .join("");
}

// -------------------------------
// Cargar listado de pilotos
// -------------------------------
async function loadDrivers(filters = {}) {
  let url = "/drivers";

  if (filters.level) {
    url += `?level=${encodeURIComponent(filters.level)}`;
  }

  const res = await fetch(`${API}${url}`);
  if (!res.ok) {
    console.error("Error cargando drivers", res.status);
    return;
  }

  const drivers = await res.json();

  const tbody = document.querySelector("#drivers-table-body");
  if (!tbody) return;

  tbody.innerHTML = drivers.map(d => `
    <tr>
      <td>${d.id}</td>
      <td>${d.name}</td>
      <td>${d.driver_number || "-"}</td>   <!-- ✅ DORSAL -->
      <td>${d.email || "-"}</td>
      <td>${d.skill || "-"}</td>
      <td>${d.weight || "-"}</td>
      <td>${d.transponder || "-"}</td>     <!-- ✅ TRANSPONDER -->

      <td class="actions">
        <button class="btn btn-sm btn-primary"
                title="Editar"
                onclick="editDriver(${d.id})">
          ✏️
        </button>

        <button class="btn btn-sm btn-danger"
                title="Eliminar"
                onclick="deleteDriver(${d.id})">
          🗑️
        </button>

        <button class="btn btn-sm btn-secondary"
                title="Historial"
                onclick="openDriverHistory(${d.id}, '${escapeQuotes(d.name)}')">
          📊
        </button>

        <button class="btn btn-sm btn-warning"
                title="Comparar"
                onclick="selectDriverForCompare(${d.id}, '${escapeQuotes(d.name)}')">
          ⚖️
        </button>

        <button class="btn btn-sm btn-info"
                title="PDF"
                onclick="downloadDriverPDF(${d.id}, '${escapeQuotes(d.name)}')">
          📄
        </button>
      </td>
    </tr>
  `).join("");
}


function setupDriverLevelFilter() {
  const select = document.querySelector("#filter-driver-level");
  if (!select) return;

  select.addEventListener("change", () => {
    const level = select.value || null;
    loadDrivers(level ? { level } : {});
  });
}


// -------------------------------
// Renderizar tabla
// -------------------------------
function renderDrivers(list) {
  const tbody = document.getElementById("drivers-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="muted">Sin resultados</td>
      </tr>
    `;
    return;
  }

  list.forEach(addDriverToTable);
}

// -------------------------------
// Añadir fila
// -------------------------------
function addDriverToTable(d) {
  const tbody = document.getElementById("drivers-table-body");
  if (!tbody) return;

  const tr = document.createElement("tr");

 tr.innerHTML = `
  <td>${d.id}</td>
  <td>${d.name}</td>
  <td>${d.email || "-"}</td>
  <td>${d.skill || "-"}</td>
  <td>${d.weight ?? "-"}</td>
  <td>${d.transponder || "-"}</td>
  <td class="actions">
    <button class="btn btn-sm btn-primary" onclick="fillDriverForm(${d.id})">Editar</button>
    <button class="btn btn-sm btn-danger" onclick="deleteDriver(${d.id})">Eliminar</button>
    <button class="btn btn-sm btn-secondary"
      onclick="openDriverHistory(${d.id}, '${escapeQuotes(d.name)}')">
      Historial
    </button>
    <button class="btn btn-sm btn-warning"
      onclick="selectDriverForCompare(${d.id}, '${escapeQuotes(d.name)}')">
      Comparar
    </button>
    <button class="btn btn-sm btn-info"
      onclick="downloadDriverPDF(${d.id}, '${escapeQuotes(d.name)}')">
      PDF
    </button>
  </td>
`;


  tbody.appendChild(tr);
}


// -------------------------------
// Filtros + búsqueda + orden
// -------------------------------
function applyDriversFilters() {
  const tbody = document.getElementById("drivers-table-body");
  if (!tbody) return;

  const q = qs("#drivers-search")?.value.toLowerCase() || "";
  const skill = qs("#drivers-skill-filter")?.value || "";
  const wMinEl = qs("#drivers-weight-min");
  const wMaxEl = qs("#drivers-weight-max");

  const wMin = wMinEl && wMinEl.value !== "" ? Number(wMinEl.value) : null;
  const wMax = wMaxEl && wMaxEl.value !== "" ? Number(wMaxEl.value) : null;

  let filtered = driversCache.filter(d => {
    const text = `${d.name || ""} ${d.lastname || ""} ${d.nickname || ""}`.toLowerCase();

    if (q && !text.includes(q)) return false;
    if (skill && d.skill !== skill) return false;
    if (wMin !== null && Number(d.weight) < wMin) return false;
    if (wMax !== null && Number(d.weight) > wMax) return false;

    return true;
  });

  filtered = sortDrivers(filtered);
  renderDrivers(filtered);
}

// -------------------------------
// Ordenar
// -------------------------------
function sortDrivers(list) {
  const { field, dir } = driversSort;

  return [...list].sort((a, b) => {
    let va = a[field];
    let vb = b[field];

    if (va === null || va === undefined) va = "";
    if (vb === null || vb === undefined) vb = "";

    if (typeof va === "number" && typeof vb === "number") {
      return dir === "asc" ? va - vb : vb - va;
    }

    return dir === "asc"
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va));
  });
}

// -------------------------------
// Activar click en headers
// -------------------------------
function setupDriversSorting() {
  const headers = qsa("th[data-sort]");
  if (!headers.length) return;

  headers.forEach(th => {
    th.style.cursor = "pointer";

    th.addEventListener("click", () => {
      const field = th.dataset.sort;

      if (driversSort.field === field) {
        driversSort.dir = driversSort.dir === "asc" ? "desc" : "asc";
      } else {
        driversSort.field = field;
        driversSort.dir = "asc";
      }

      applyDriversFilters();
    });
  });
}

// -------------------------------
// Conectar inputs de filtros
// -------------------------------
function setupDriversFilters() {
  [
    "#drivers-search",
    "#drivers-skill-filter",
    "#drivers-weight-min",
    "#drivers-weight-max"
  ].forEach(sel => {
    const el = qs(sel);
    if (!el) return;

    el.addEventListener("input", applyDriversFilters);
    el.addEventListener("change", applyDriversFilters);
  });
}

// -------------------------------
// Rellenar formulario (editar)
// -------------------------------
async function fillDriverForm(id) {
  const set = (sel, val) => {
    const el = qs(sel);
    if (el) el.value = val ?? "";
  };

  const d = await apiGet(`/drivers/${id}`, null);
  if (!d) return;

  await loadDriverLevels();

  set("#driver-name", d.name);
  set("#driver-lastname", String(d.lastname ?? ""));
  set("#driver-nickname", d.nickname);
  set("#driver-dni", d.dni);
  set("#driver-email", d.email);
  set("#driver-skill", d.skill);
  set("#driver-weight", d.weight);
  set("#driver-transp", d.transponder);

  const form = qs("#form-driver");
  if (form) form.dataset.editId = d.id;
}


// -------------------------------
// Eliminar piloto
// -------------------------------
async function deleteDriver(id) {
  if (!confirm("¿Eliminar piloto?")) return;

  await apiSend(`/drivers/${id}`, "DELETE");
  delete qs("#form-driver")?.dataset.editId;

  loadDrivers();
  updateOverview();
}

// -------------------------------
// Formulario alta / edición
// -------------------------------
function setupDriverForm() {
  const form = qs("#form-driver");
  if (!form || form.dataset.ready) return;

  form.dataset.ready = "1";

  form.addEventListener("submit", async e => {
    e.preventDefault();
const val = sel => qs(sel)?.value || "";

const payload = {
  name: val("#driver-name"),

  // 👇 usa el campo REAL que espera el backend
  lastname: val("#driver-lastname") || null,

  nickname: val("#driver-nickname") || null,
  dni: val("#driver-dni") || null,
  email: val("#driver-email") || null,
  skill: val("#driver-skill") || null,

  weight: val("#driver-weight")
    ? Number(val("#driver-weight"))
    : null,

  transponder: val("#driver-transp") || null
};






    const editId = form.dataset.editId || null;

    await apiSend(
      editId ? `/drivers/${editId}` : "/drivers",
      editId ? "PUT" : "POST",
      payload
    );

    form.reset();
    delete form.dataset.editId;

    loadDrivers();
    updateOverview();
  });
}
// -------------------------------
// EXPORT IMPORT CSV
// -------------------------------
function exportDriversToCSV() {
  if (!driversCache.length) {
    alert("No hay pilotos para exportar");
    return;
  }

  const headers = [
    "name",
    "lastname",
    "nickname",
    "dni",
    "license",
    "weight",
    "skill",
    "team_id",
    "transponder",
    "photo_url"
  ];

  const rows = driversCache.map(d =>
    headers.map(h => `"${d[h] ?? ""}"`).join(",")
  );

  const csv = [
    headers.join(","),
    ...rows
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "drivers.csv";
  a.click();

  URL.revokeObjectURL(url);
}
async function importDriversFromCSV(file) {
  const text = await file.text();

  const { errors } = validateDriversCSV(text);

  if (errors.length) {
    alert(
      "❌ Errores en el CSV:\n\n" +
      errors.slice(0, 10).join("\n")
    );
    return;
  }

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const headers = lines[0]
    .split(",")
    .map(h => h.replace(/"/g, "").trim());

  const drivers = lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.replace(/"/g, "").trim());
    const obj = {};

    headers.forEach((h, i) => {
      obj[h] = values[i] || undefined;
    });

    if (obj.weight) obj.weight = Number(obj.weight);

    return obj;
  });

  if (!confirm(`CSV válido ✅\n\nImportar ${drivers.length} pilotos?`)) {
    return;
  }

  for (const d of drivers) {
    await apiSend("/drivers", "POST", d);
  }

  loadDrivers();
  updateOverview();
}

function setupDriversCSV() {
  qs("#btn-export-drivers")?.addEventListener("click", exportDriversToCSV);

  qs("#input-import-drivers")?.addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) importDriversFromCSV(file);
    e.target.value = "";
  });
}
function validateDriversCSV(text) {
  const errors = [];

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { errors: ["El CSV está vacío o no tiene datos"] };
  }

  const headers = lines[0]
    .split(",")
    .map(h => h.replace(/"/g, "").trim());

  // --- validar cabeceras ---
  DRIVER_CSV_HEADERS.forEach(h => {
    if (!headers.includes(h)) {
      errors.push(`Falta la columna obligatoria: ${h}`);
    }
  });

  if (errors.length) return { errors };

  // --- validar filas ---
  lines.slice(1).forEach((line, index) => {
    const rowNum = index + 2; // línea real en CSV
    const values = line.split(",").map(v => v.replace(/"/g, "").trim());
    const row = {};

    headers.forEach((h, i) => {
      row[h] = values[i] || "";
    });

    // nombre obligatorio
    if (!row.name) {
      errors.push(`Línea ${rowNum}: el nombre es obligatorio`);
    }

    // peso numérico
    if (row.weight && isNaN(Number(row.weight))) {
      errors.push(`Línea ${rowNum}: el peso no es numérico`);
    }

    // nivel no vacío si existe
    if (row.skill !== undefined && row.skill === "") {
      errors.push(`Línea ${rowNum}: nivel vacío`);
    }
  });

  return { errors };
}
// ====================================================
// HISTORIAL + CHARTS + COMPARE + RANKING + EXPORT + PDF
// ====================================================

// ---- Estado global (NO duplicar en otro sitio) ----
let lapsChartInstance = null;
let compareChartInstance = null;
let compareSelection = []; // para elegir 2 pilotos
let lastOpenedHistory = { driverId: null, driverName: null, history: null };

// Cache para no pedir 500 veces lo mismo (ranking)
const driverHistoryCache = new Map(); // driverId -> history

// -----------------------------
// Util: formato tiempo mm:ss.mmm
// -----------------------------
function formatLapTime(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return "-";
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${min}:${String(sec).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

// -----------------------------
// Stats por lista de laps
// -----------------------------
function calculateSessionStats(laps) {
  const times = (laps || [])
    .map(l => Number(l.time_ms))
    .filter(x => !isNaN(x));

  if (!times.length) {
    return { laps: 0, best: null, avg: null, total: 0, consistency: null };
  }

  const best = Math.min(...times);
  const total = times.reduce((a, b) => a + b, 0);
  const avg = Math.round(total / times.length);

  const deviation =
    times.reduce((sum, t) => sum + Math.abs(t - avg), 0) /
    times.length;

  const consistency =
    avg > 0
      ? Math.max(0, (1 - deviation / avg) * 100)
      : 0;

  return {
    laps: times.length,
    best,
    avg,
    total,
    consistency: Math.round(consistency)
  };
}


// -----------------------------
// 6️⃣ Chart evolución (por sesión)
// -----------------------------
function renderLapsChart(history) {
  const canvas = document.getElementById("lapsChart");
  if (!canvas || !history || !history.length) return;

  if (lapsChartInstance) lapsChartInstance.destroy();

  // Labels: la mayor cantidad de vueltas entre sesiones
  const maxLaps = Math.max(...history.map(b => b.laps.length));
  const labels = Array.from({ length: maxLaps }, (_, i) => `V${i + 1}`);

  const datasets = history.map((block, idx) => ({
    label: block.session?.name || `Sesión ${idx + 1}`,
    data: block.laps.map(l => l.time_ms),
    borderWidth: 2,
    tension: 0.25
  }));

  lapsChartInstance = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        y: { ticks: { callback: v => formatLapTime(v) } }
      }
    }
  });
}

// -----------------------------
// Abrir modal historial (Piloto)
// -----------------------------
async function openDriverHistory(driverId, driverName) {
  const modal = document.getElementById("historyModal");
  const title = document.getElementById("historyTitle");
  const summary = document.getElementById("historySummary");
  const sessionsTable = document.getElementById("historySessions");
  const lapsTable = document.getElementById("historyLaps");

  if (!modal || !title || !summary || !sessionsTable || !lapsTable) return;

  title.textContent = `Historial — ${driverName}`;
  summary.innerHTML = "Cargando...";
  sessionsTable.innerHTML = "";
  lapsTable.innerHTML = "";

  modal.style.display = "block";

  try {
    // Cache
    let history = driverHistoryCache.get(driverId);
    if (!history) {
      history = await apiGet(`/drivers/${driverId}/history`, []);
      driverHistoryCache.set(driverId, history);
    }

    lastOpenedHistory = { driverId, driverName, history };

    if (!history || !history.length) {
      summary.innerHTML = "Sin historial registrado";
      // destruir chart si había
      if (lapsChartInstance) lapsChartInstance.destroy();
      return;
    }

    // Resumen global
    const allLaps = history.flatMap(h => h.laps || []);
    const globalStats = calculateSessionStats(allLaps);

    summary.innerHTML = `
      Total sesiones: <b>${history.length}</b><br>
      Total vueltas: <b>${globalStats.laps}</b><br>
      Mejor vuelta: <b>${formatLapTime(globalStats.best)}</b><br>
      Promedio: <b>${formatLapTime(globalStats.avg)}</b><br>
      Consistencia: <b>${globalStats.consistency !== null ? globalStats.consistency + " %" : "-"}</b><br>
      Tiempo total: <b>${formatLapTime(globalStats.total)}</b>
    `;

    // Chart
    renderLapsChart(history);

    // Tabla sesiones (stats)
    sessionsTable.innerHTML = `
      <tr>
        <th>Sesión</th>
        <th>Tipo</th>
        <th>Vueltas</th>
        <th>Mejor</th>
        <th>Promedio</th>
        <th>Consistencia</th>
        <th>Total</th>
      </tr>
    `;

    history.forEach(block => {
      const stats = calculateSessionStats(block.laps || []);
      sessionsTable.innerHTML += `
        <tr>
          <td>${block.session?.name || "-"}</td>
          <td>${block.session?.type || "-"}</td>
          <td>${stats.laps}</td>
          <td>${formatLapTime(stats.best)}</td>
          <td>${formatLapTime(stats.avg)}</td>
          <td>${stats.consistency !== null ? "±" + stats.consistency + " %" : "-"}</td>
          <td>${formatLapTime(stats.total)}</td>
        </tr>
      `;
    });

    // Tabla vuelta a vuelta (marca best global)
    const globalBest = globalStats.best;

    lapsTable.innerHTML = `
      <tr>
        <th>Sesión</th>
        <th>Vuelta</th>
        <th>Tiempo</th>
      </tr>
    `;

    history.forEach(block => {
      (block.laps || []).forEach(l => {
        const isBest = globalBest !== null && l.time_ms === globalBest;
        lapsTable.innerHTML += `
          <tr style="${isBest ? "color:#0f0;font-weight:bold;" : ""}">
            <td>${block.session?.name || "-"}</td>
            <td>${l.lap}</td>
            <td>${formatLapTime(l.time_ms)}</td>
          </tr>
        `;
      });
    });

  } catch (err) {
    console.error("Error cargando historial:", err);
    summary.innerHTML = "Error cargando historial";
  }
}

function closeHistoryModal() {
  const modal = document.getElementById("historyModal");
  if (modal) modal.style.display = "none";
}

// -----------------------------
// 7️⃣ Comparar dos pilotos
// -----------------------------
function selectDriverForCompare(id, name) {
  if (compareSelection.find(d => d.id === id)) return;

  compareSelection.push({ id, name });

  if (compareSelection.length < 2) {
    alert(`Seleccionado ${name}. Selecciona otro piloto para comparar.`);
    return;
  }

  if (compareSelection.length === 2) {
    openDriversComparison(compareSelection[0], compareSelection[1]);
    compareSelection = [];
  }
}

async function openDriversComparison(d1, d2) {
  const modal = document.getElementById("compareModal");
  const title = document.getElementById("compareTitle");
  const summary = document.getElementById("compareSummary");
  const table = document.getElementById("compareTable");

  if (!modal || !title || !summary || !table) return;

  modal.style.display = "block";
  title.textContent = `Comparación — ${d1.name} vs ${d2.name}`;
  summary.textContent = "Cargando...";
  table.innerHTML = "";

  try {
    const [h1, h2] = await Promise.all([
      apiGet(`/drivers/${d1.id}/history`, []),
      apiGet(`/drivers/${d2.id}/history`, [])
    ]);

    // Stats globales
    const s1 = calculateSessionStats(h1.flatMap(s => s.laps || []));
    const s2 = calculateSessionStats(h2.flatMap(s => s.laps || []));

    summary.innerHTML = `
      <b>${d1.name}</b> mejor: ${formatLapTime(s1.best)} | avg: ${formatLapTime(s1.avg)} | vueltas: ${s1.laps}<br>
      <b>${d2.name}</b> mejor: ${formatLapTime(s2.best)} | avg: ${formatLapTime(s2.avg)} | vueltas: ${s2.laps}
    `;

    // Tabla
    table.innerHTML = `
      <tr>
        <th></th>
        <th>${d1.name}</th>
        <th>${d2.name}</th>
      </tr>
      <tr>
        <td>Mejor vuelta</td>
        <td>${formatLapTime(s1.best)}</td>
        <td>${formatLapTime(s2.best)}</td>
      </tr>
      <tr>
        <td>Promedio</td>
        <td>${formatLapTime(s1.avg)}</td>
        <td>${formatLapTime(s2.avg)}</td>
      </tr>
      <tr>
        <td>Consistencia</td>
       <td>${s1.consistency !== null ? s1.consistency + " %" : "-"}</td>
<td>${s2.consistency !== null ? s2.consistency + " %" : "-"}</td>
      </tr>
      <tr>
        <td>Total vueltas</td>
        <td>${s1.laps}</td>
        <td>${s2.laps}</td>
      </tr>
    `;

    // Gráfica comparación: intenta última sesión común por nombre (si existe),
    // si no, usa la última sesión de cada uno.
    const last1 = h1[0];
    const last2 = h2[0];

    const common = findCommonSessionBlock(h1, h2);
    const b1 = common?.b1 || last1;
    const b2 = common?.b2 || last2;

    renderCompareChart(d1.name, b1, d2.name, b2);

  } catch (err) {
    console.error(err);
    summary.textContent = "Error comparando pilotos";
  }
}

function findCommonSessionBlock(h1, h2) {
  const map2 = new Map(h2.map(b => [String(b.session?.name || "").toLowerCase(), b]));
  for (const b1 of h1) {
    const key = String(b1.session?.name || "").toLowerCase();
    if (map2.has(key) && key) {
      return { b1, b2: map2.get(key) };
    }
  }
  return null;
}

function renderCompareChart(name1, block1, name2, block2) {
  const canvas = document.getElementById("compareChart");
  if (!canvas) return;

  if (compareChartInstance) compareChartInstance.destroy();

  const laps1 = (block1?.laps || []).map(l => l.time_ms);
  const laps2 = (block2?.laps || []).map(l => l.time_ms);

  const maxLaps = Math.max(laps1.length, laps2.length, 1);
  const labels = Array.from({ length: maxLaps }, (_, i) => `V${i + 1}`);

  compareChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: name1, data: laps1, borderWidth: 2, tension: 0.25 },
        { label: name2, data: laps2, borderWidth: 2, tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { ticks: { callback: v => formatLapTime(v) } } }
    }
  });
}

function closeCompareModal() {
  const modal = document.getElementById("compareModal");
  if (modal) modal.style.display = "none";
}

// -----------------------------
// 8️⃣ Ranking histórico (mejor vuelta)
// -----------------------------
function openRankingModal() {
  const modal = document.getElementById("rankingModal");
  if (modal) modal.style.display = "block";
  buildRanking();
}

function closeRankingModal() {
  const modal = document.getElementById("rankingModal");
  if (modal) modal.style.display = "none";
}

async function buildRanking() {
  const status = document.getElementById("rankingStatus");
  const table = document.getElementById("rankingTable");
  if (!status || !table) return;

  // driversCache viene de tu módulo DRIVERS; si no existe, no podemos rankear
  if (typeof driversCache === "undefined" || !Array.isArray(driversCache) || !driversCache.length) {
    status.textContent = "No hay driversCache cargado. Entra a Drivers y carga la lista primero.";
    table.innerHTML = "";
    return;
  }

  status.textContent = "Calculando ranking... (puede tardar si hay muchos pilotos)";
  table.innerHTML = "";

  const ranking = [];
  for (let i = 0; i < driversCache.length; i++) {
    const d = driversCache[i];
    status.textContent = `Calculando ranking... ${i + 1}/${driversCache.length} (${d.name})`;

    let history = driverHistoryCache.get(d.id);
    if (!history) {
      try {
        history = await apiGet(`/drivers/${d.id}/history`, []);
        driverHistoryCache.set(d.id, history);
      } catch {
        history = [];
      }
    }

    const allLaps = (history || []).flatMap(b => b.laps || []);
    const stats = calculateSessionStats(allLaps);
    if (stats.laps > 0) {
      ranking.push({
        id: d.id,
        name: d.name || `#${d.id}`,
        best: stats.best,
        avg: stats.avg,
        laps: stats.laps
      });
    }
  }

  ranking.sort((a, b) => (a.best ?? 1e18) - (b.best ?? 1e18));

  status.textContent = `Ranking listo ✅ (${ranking.length} pilotos con vueltas)`;

  table.innerHTML = `
    <tr>
      <th>#</th>
      <th>Piloto</th>
      <th>Mejor vuelta</th>
      <th>Promedio</th>
      <th>Vueltas</th>
      <th>Acciones</th>
    </tr>
    ${ranking.map((r, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${r.name}</td>
        <td>${formatLapTime(r.best)}</td>
        <td>${formatLapTime(r.avg)}</td>
        <td>${r.laps}</td>
        <td>
          <button class="btn btn-sm" onclick="openDriverHistory(${r.id}, '${escapeQuotes(r.name)}')">Historial</button>
          <button class="btn btn-sm" onclick="downloadDriverPDF(${r.id}, '${escapeQuotes(r.name)}')">PDF</button>
        </td>
      </tr>
    `).join("")}
  `;

  // guardar ranking para export
  window.__lastRanking = ranking;
}

function escapeQuotes(s) {
  return String(s).replace(/'/g, "\\'");
}

// -----------------------------
// 9️⃣ Export CSV + PNG
// -----------------------------
function downloadCSV(filename, csvText) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Export vueltas del último historial abierto
function exportDriverHistoryCSV() {
  const h = lastOpenedHistory.history;
  if (!h || !h.length) return alert("No hay historial cargado.");

  const rows = [];
  rows.push(["session_name","session_type","lap","time_ms","time"].join(","));

  h.forEach(block => {
    (block.laps || []).forEach(l => {
      rows.push([
        safeCSV(block.session?.name),
        safeCSV(block.session?.type),
        l.lap,
        l.time_ms,
        safeCSV(formatLapTime(l.time_ms))
      ].join(","));
    });
  });

  downloadCSV(`history_driver_${lastOpenedHistory.driverId}.csv`, rows.join("\n"));
}

function exportDriverSessionStatsCSV() {
  const h = lastOpenedHistory.history;
  if (!h || !h.length) return alert("No hay historial cargado.");

  const rows = [];
  rows.push(["session_name","session_type","laps","best_ms","best","avg_ms","avg","consistency_ms","total_ms","total"].join(","));

  h.forEach(block => {
    const stats = calculateSessionStats(block.laps || []);
    rows.push([
      safeCSV(block.session?.name),
      safeCSV(block.session?.type),
      stats.laps,
      stats.best ?? "",
      safeCSV(formatLapTime(stats.best)),
      stats.avg ?? "",
      safeCSV(formatLapTime(stats.avg)),
      stats.consistency ?? "",
      stats.total ?? "",
      safeCSV(formatLapTime(stats.total))
    ].join(","));
  });

  downloadCSV(`session_stats_driver_${lastOpenedHistory.driverId}.csv`, rows.join("\n"));
}

function safeCSV(val) {
  const s = (val === null || val === undefined) ? "" : String(val);
  return `"${s.replace(/"/g, '""')}"`;
}

// Descargar PNG de la gráfica del historial
function downloadHistoryChartPNG() {
  if (!lapsChartInstance) return alert("No hay gráfica cargada.");
  const url = lapsChartInstance.toBase64Image();
  const a = document.createElement("a");
  a.href = url;
  a.download = `laps_chart_driver_${lastOpenedHistory.driverId}.png`;
  a.click();
}

// Export ranking CSV
function exportRankingCSV() {
  const ranking = window.__lastRanking || [];
  if (!ranking.length) return alert("No hay ranking calculado.");

  const rows = [];
  rows.push(["pos","driver_id","name","best_ms","best","avg_ms","avg","laps"].join(","));
  ranking.forEach((r, i) => {
    rows.push([
      i + 1,
      r.id,
      safeCSV(r.name),
      r.best,
      safeCSV(formatLapTime(r.best)),
      r.avg,
      safeCSV(formatLapTime(r.avg)),
      r.laps
    ].join(","));
  });

  downloadCSV("ranking_best_lap.csv", rows.join("\n"));
}

// -----------------------------
// 🔟 PDF por piloto
// -----------------------------
async function downloadDriverPDF(forcedId = null, forcedName = null) {
  const driverId = forcedId ?? lastOpenedHistory.driverId;
  const driverName = forcedName ?? lastOpenedHistory.driverName;

  if (!driverId) return alert("No hay piloto seleccionado.");

  // cargar historia si no está
  let history = driverHistoryCache.get(driverId);
  if (!history) history = await apiGet(`/drivers/${driverId}/history`, []);

  const allLaps = (history || []).flatMap(b => b.laps || []);
  const globalStats = calculateSessionStats(allLaps);

  // jsPDF UMD
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Reporte de piloto: ${driverName}`, 40, 50);

  doc.setFontSize(11);
  doc.text(`Total sesiones: ${history.length}`, 40, 80);
  doc.text(`Total vueltas: ${globalStats.laps}`, 40, 98);
  doc.text(`Mejor vuelta: ${formatLapTime(globalStats.best)} (${globalStats.best ?? "-"} ms)`, 40, 116);
  doc.text(`Promedio: ${formatLapTime(globalStats.avg)} (${globalStats.avg ?? "-"} ms)`, 40, 134);
  doc.text(`Consistencia: ${globalStats.consistency !== null ? "±" + globalStats.consistency +  " %" : "-"}`, 40, 152);

  // Tabla sesiones
  const sessionRows = history.map(b => {
    const s = calculateSessionStats(b.laps || []);
    return [
      b.session?.name || "-",
      b.session?.type || "-",
      String(s.laps),
      formatLapTime(s.best),
      formatLapTime(s.avg),
      s.consistency !== null ? `±${s.consistency} ms` : "-",
      formatLapTime(s.total)
    ];
  });

  doc.autoTable({
    startY: 180,
    head: [["Sesión","Tipo","Vueltas","Mejor","Promedio","Consistencia","Total"]],
    body: sessionRows,
    styles: { fontSize: 9 }
  });

  // Añadir gráfica si existe en pantalla y corresponde al mismo piloto
  try {
    if (lapsChartInstance && lastOpenedHistory.driverId === driverId) {
      const img = lapsChartInstance.toBase64Image();
      const y = doc.lastAutoTable.finalY + 20;
      doc.setFontSize(12);
      doc.text("Gráfica (evolución de vueltas)", 40, y);
      doc.addImage(img, "PNG", 40, y + 10, 520, 220);
    }
  } catch {}

  doc.save(`reporte_driver_${driverId}.pdf`);
}

window.editDriver = async function (id) {
  const d = await apiGet(`/drivers/${id}`, []);

  const set = (sel, val) => {
    const el = qs(sel);
    if (el) el.value = val ?? "";
  };

  set("#driver-name", d.name);
  set("#driver-lastname", String(d.lastname ?? ""));
  set("#driver-email", d.email);
  set("#driver-weight", d.weight);
  set("#driver-transponder", d.transponder);
  set("#driver-skill", d.skill);

  const form = qs("#form-driver");
  if (form) form.dataset.editId = d.id;
};


// ====================================================
// KARTS
// ====================================================
window.editKart = async function (id) {
  const k = await apiGet(`/karts/${id}`, null);
  if (!k) return;

  qs("#kart-number").value = k.number;
  qs("#kart-transp").value = k.transponder || "";
  qs("#kart-notes").value = k.notes || "";

  const form = qs("#form-kart");
  form.dataset.editId = k.id;
};

async function loadKarts() {
  const list = await apiGet("/karts", []);
  const tbody = qs("#karts-table-body");
  if (!tbody) return;

  tbody.innerHTML = list
    .map(
      k => `
    <tr>
      <td>${k.number}</td>
      <td>${k.maintenance_status || "-"}</td>
      <td>${k.hours_used || 0}</td>
      <td>${k.last_service || "-"}</td>
      <td>${k.transponder || "-"}</td>
     <td class="actions-cell">
  <button class="btn btn-icon"
          onclick="editKart(${k.id})"
          title="Editar">
    ✏️
  </button>

  <button class="btn btn-icon"
          onclick="viewKartHistory(${k.id}, '${k.number}')"
          title="Historial">
    📊
  </button>

  <button class="btn btn-icon"
          onclick="window.open('/api/karts/${k.id}/report/pdf')"
          title="PDF">
    📄
  </button>

  <button class="btn btn-icon danger"
          data-id="${k.id}"
          data-action="del-kart"
          title="Desactivar">
    🗑️
  </button>
</td>

    </tr>`
    )
    .join("");

  qsa("button[data-action='del-kart']", tbody).forEach(btn => {
    btn.addEventListener("click", () => deleteKart(btn.dataset.id));
  });
}



async function deleteKart(id) {
  if (!confirm("¿Eliminar kart?")) return;
  await apiSend(`/karts/${id}`, "DELETE");
  loadKarts();
  updateOverview();
}

function setupKartForm() {
  const form = qs("#form-kart");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const payload = {
      number: qs("#kart-number").value,
      transponder: qs("#kart-transp").value || null,
      notes: qs("#kart-notes").value || null,
    };

    const editId = form.dataset.editId;

    await apiSend(
      editId ? `/karts/${editId}` : "/karts",
      editId ? "PUT" : "POST",
      payload
    );

    form.reset();
    delete form.dataset.editId;

    loadKarts();
    updateOverview();
  });
}

async function loadKartAlerts() {
  const alerts = await apiGet("/karts/alerts/maintenance", []);

  if (!alerts.length) return;

  const msg = alerts
    .map(
      k =>
        `Kart #${k.number} → ${k.hours_used}h (${k.status.toUpperCase()})`
    )
    .join("\n");

  alert("⚠️ ALERTAS DE MANTENIMIENTO\n\n" + msg);
}
function toggleKartMenu(btn) {
  const menu = btn.nextElementSibling;
  const openMenus = document.querySelectorAll(".dropdown-menu");

  openMenus.forEach(m => {
    if (m !== menu) m.style.display = "none";
  });

  menu.style.display = menu.style.display === "block" ? "none" : "block";
}

// cerrar al hacer click fuera
document.addEventListener("click", e => {
  if (!e.target.closest(".dropdown")) {
    document
      .querySelectorAll(".dropdown-menu")
      .forEach(m => (m.style.display = "none"));
  }
});


// ====================================================
// TEAMS
// ====================================================

async function loadTeams() {
  const list = await apiGet("/teams", []);
  const tbody = qs("#teams-table-body");
  if (!tbody) return;

  tbody.innerHTML = list
    .map(
      t => `
    <tr>
      <td>${t.id}</td>
      <td>${t.name}</td>
      <td>${t.category || "-"}</td>
      <td><span style="display:inline-block;width:16px;height:16px;background:${t.color}"></span> ${t.color}</td>
      <td>
        <button class="btn btn-sm" data-id="${t.id}" data-action="edit-team">Editar</button>
        <button class="btn btn-sm" data-id="${t.id}" data-action="del-team">Eliminar</button>
      </td>
    </tr>`
    )
    .join("");

  qsa("button[data-action='edit-team']", tbody).forEach(btn => {
    btn.addEventListener("click", () => fillTeamForm(btn.dataset.id));
  });

  qsa("button[data-action='del-team']", tbody).forEach(btn => {
    btn.addEventListener("click", () => deleteTeam(btn.dataset.id));
  });
}

async function fillTeamForm(id) {
  const t = await apiGet(`/teams/${id}`, null);
  if (!t) return;

  qs("#team-id").value = t.id;
  qs("#team-name").value = t.name;
  qs("#team-category").value = t.category || "";
  qs("#team-color").value = t.color || "";
  qs("#team-notes").value = t.notes || "";
}

async function deleteTeam(id) {
  if (!confirm("¿Eliminar equipo?")) return;
  await apiSend(`/teams/${id}`, "DELETE");
  loadTeams();
}

function setupTeamForm() {
  const form = qs("#form-team");
  if (!form) return;

  qs("#btn-team-reset")?.addEventListener("click", () => {
    form.reset();
    qs("#team-id").value = "";
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const id = qs("#team-id").value;
    const payload = {
      name: qs("#team-name").value,
      category: qs("#team-category").value || null,
      color: qs("#team-color").value || null,
      notes: qs("#team-notes").value || null
    };

    await apiSend(id ? `/teams/${id}` : "/teams", id ? "PUT" : "POST", payload);

    form.reset();
    qs("#team-id").value = "";
    loadTeams();
  });
}


// ====================================================
// CARGAR LISTADO DE SESIONES (OBLIGATORIO)
// ====================================================

// 🔒 hacerla visible globalmente
window.loadSessions = loadSessions;


// ====================================================
// FORMULARIO CREAR / EDITAR SESIÓN (SPA CORRECTA)
// ====================================================

function setupSessionForm() {
  const form = qs("#form-session");
  if (!form || form.dataset.ready) return;

  form.dataset.ready = "1";

  form.addEventListener("submit", async e => {
    e.preventDefault();

    // ⛔ Evitar doble submit
    if (form.dataset.saving === "1") return;
    form.dataset.saving = "1";

    const sessionId = Number(qs("#session-id")?.value || 0);

    const payload = {
      name: qs("#session-name")?.value || "Sesión",
      type: qs("#session-type")?.value || "practice",
      lap_limit: Number(qs("#session-lap-limit")?.value) || null,
      time_limit_seconds: Number(qs("#session-time-limit")?.value) || null
    };

    try {
      let session;

      // ============================
      // 🆕 CREAR SESIÓN
      // ============================
      if (!sessionId) {
        session = await apiSend("/sessions", "POST", payload);
        qs("#session-id").value = session.id;
        console.log("✅ Sesión creada:", session.id);

        // Guardar parrilla inicial
        for (const g of tempGrid) {
          await apiSend(`/sessions/${session.id}/participants`, "POST", {
            driver_id: g.driver_id,
            kart_id: g.kart_id ?? null
          });
        }
      }

      // ============================
      // ✏️ EDITAR SESIÓN
      // ============================
      else {
        session = await apiSend(`/sessions/${sessionId}`, "PUT", payload);
        console.log("✅ Sesión actualizada:", sessionId);
        // Los participantes ya se gestionan en tiempo real
      }

      // ============================
// 🔄 REFRESCO SPA CORRECTO
// ============================

// 🔹 limpiar formulario
resetSessionForm();

// 🔹 recargar listado de sesiones (CLAVE)
await loadSessions();

// 🔹 volver a la sección Sesiones
document.querySelector(
  '.nav-button[data-section="section-sessions"]'
)?.click();

alert("✅ Sesión guardada correctamente");
console.log("🚨 FIN SUBMIT", Date.now());

    } catch (err) {
      console.error("❌ Error guardando sesión:", err);
      alert("❌ Error guardando la sesión");
    } finally {
      form.dataset.saving = "0";
    }
  });
}


// ====================================================
// CARGAR PARRILLA DE UNA SESIÓN (FIX REAL)
// ====================================================
async function loadSessionGrid(sessionId) {
  console.log("📥 Cargando parrilla de sesión:", sessionId);

  // ✅ ENDPOINT CORRECTO
  const list = await apiGet(`/sessions/${sessionId}/participants`, []);
  console.log("📥 Participantes recibidos:", list);

  if (!Array.isArray(list)) {
    console.warn("⚠️ La parrilla recibida no es un array");
    tempGrid = [];
    renderTempGrid();
    return;
  }

  // Adaptar participants → tempGrid
tempGrid = list.map(p => ({
  driver_id: p.driver_id,
  kart_id: p.kart_id,
  transponder: p.transponder ?? null
}));



  renderTempGrid();
}
async function addParticipantToSession(driver) {
  const sessionId = qs("#session-id")?.value;
  if (!sessionId) {
    console.warn("⚠️ No hay sesión activa");
    return;
  }

  try {
    // 🔹 cargar piloto completo
    const fullDriver = await apiGet(`/drivers/${driver.id}`, null);
    if (!fullDriver) {
      alert("No se pudo cargar el piloto");
      return;
    }

    await apiSend(`/sessions/${sessionId}/participants`, "POST", {
      driver_id: fullDriver.id,
      kart_id: null,
      transponder: fullDriver.transponder ?? null
    });

    console.log("✅ Participante añadido a sesión:", fullDriver.id);

    // 🔹 refrescar parrilla desde backend
    loadSessionGrid(sessionId);

  } catch (err) {
    console.error("❌ Error añadiendo participante:", err);
    alert("Error añadiendo piloto a la sesión");
  }
}

// ====================================================
// RESET FORMULARIO SESIÓN (MODO NUEVO)
// ====================================================
function resetSessionForm() {
  const form = qs("#form-session");
  if (!form) return;

  form.reset();
  qs("#session-id").value = "";

  tempGrid = [];
  renderTempGrid();

  const search = qs("#session-search");
  if (search) search.value = "";

  console.log("🔄 Formulario de sesión reseteado");
}
// ====================================================
// REFRESCAR SESIÓN ACTUAL (MODO EDICIÓN)
// ====================================================
async function refreshCurrentSession(sessionId) {
  if (!sessionId) return;

  try {
    const session = await apiGet(`/sessions/${sessionId}`);
    qs("#session-name").value = session.name || "";
    qs("#session-type").value = session.type || "practice";
    qs("#session-lap-limit").value = session.lap_limit || "";
    qs("#session-time-limit").value = session.time_limit_seconds || "";

    await loadSessionGrid(sessionId);

    console.log("🔄 Sesión refrescada desde backend:", sessionId);
  } catch (err) {
    console.error("❌ Error refrescando sesión:", err);
  }
}



// ----------------------------
// ESTADO
// ----------------------------
let tempGrid = [];      // [{ driver_id, kart_id }]
let driversCache = [];
let kartsCache = [];

// ----------------------------
// BUSCAR PILOTOS Y KARTS
// ----------------------------
function setupSessionSearch() {
  const input = qs("#session-search");
  const box = qs("#session-search-results");
  if (!input || !box) return;

  // =========================
  // INPUT SEARCH
  // =========================
  input.addEventListener("input", async () => {
    const q = input.value.trim().toLowerCase();

    if (q.length < 2) {
      box.style.display = "none";
      return;
    }

    await ensureCachesLoaded();

    // -------- PILOTOS --------
    const driverResults = driversCache
      .filter(d =>
        `${d.name} ${d.lastname || ""}`.toLowerCase().includes(q)
      )
      .map(d => ({
        type: "driver",
        id: d.id,
        label: `👤 ${d.name} ${d.lastname || ""}`
      }));

    // -------- KARTS --------
    const kartResults = kartsCache
      .filter(k =>
        `${k.number}`.includes(q) ||
        `${k.transponder || ""}`.toLowerCase().includes(q)
      )
      .map(k => ({
        type: "kart",
        id: k.id,
        label: `🚗 Kart #${k.number}${k.transponder ? ` · ${k.transponder}` : ""}`
      }));

    const results = [...driverResults, ...kartResults];

    if (!results.length) {
      box.innerHTML = `<div class="muted">Sin resultados</div>`;
      box.style.display = "block";
      return;
    }

    box.innerHTML = results.map(r => `
      <div class="search-item"
           data-type="${r.type}"
           data-id="${r.id}">
        ${r.label}
      </div>
    `).join("");

    box.style.display = "block";
  });

  // =========================
  // CLICK RESULT
  // =========================
  box.addEventListener("click", e => {
    const item = e.target.closest(".search-item");
    if (!item) return;

    const id = Number(item.dataset.id);
    const type = item.dataset.type;

    if (type === "driver") {
      const driver = getDriverById(id);
      if (!driver) return;

      if (isEditingSession()) {
        addParticipantToSession(driver);
      } else {
        addDriverToTempGrid(driver);
      }
    }
console.log("CLICK RESULT", item.dataset.type, item.dataset.id);

    if (type === "kart") {
      if (!tempGrid.length) return;
      tempGrid[tempGrid.length - 1].kart_id = id;
      renderTempGrid();
    }

    input.value = "";
    box.style.display = "none";
  });
}



// ----------------------------
// HELPERS
// ----------------------------
function getDriverById(driverId) {
  if (!driversCache.length) return null;
  return driversCache.find(d => d.id === driverId) || null;
}

function isEditingSession() {
  const el = qs("#session-id");
  return !!(el && el.value && Number(el.value));
}

function hasToken() {
  return !!localStorage.getItem("token");
}
// ----------------------------
// ENSURE CACHES LOADED
// ----------------------------
async function ensureCachesLoaded() {
  if (!driversCache || !driversCache.length) {
    driversCache = await apiGet("/drivers", []);
  }
  if (!kartsCache || !kartsCache.length) {
    kartsCache = await apiGet("/karts", []);
  }
}

// ----------------------------
// CARGA INICIAL
// ----------------------------
apiGet("/drivers", []).then(d => {
  driversCache = d;
  renderTempGrid();
});

apiGet("/karts", []).then(k => {
  kartsCache = Array.isArray(k) ? k : [];
});
async function addDriverToTempGrid(driver) {
  console.log("🚨 addDriverToTempGrid RECIBE:", driver);

  if (!Number.isInteger(driver.id)) return;
  if (tempGrid.some(g => g.driver_id === driver.id)) return;

  console.log("🔍 ID piloto:", driver.id);

  const fullDriver = await apiGet(`/drivers/${driver.id}`, null);

  console.log("📦 DRIVER COMPLETO:", fullDriver);

  if (!fullDriver) {
    alert("No se pudo cargar el piloto completo");
    return;
  }

  tempGrid.push({
    driver_id: fullDriver.id,
    kart_id: null,
    transponder: fullDriver.transponder || null
  });

  renderTempGrid();
}




// ❌ NO se permiten karts sin piloto
// ❌ NO debe existir addKartToTempGrid

function removeTemp(index) {
  if (!tempGrid[index]) return;
  tempGrid.splice(index, 1);
  renderTempGrid();
}

// Asignar kart explícitamente a una fila
function assignTempKart(index, kartId) {
  if (!tempGrid[index]) return;

  const newKartId = kartId ? Number(kartId) : null;

  // ⛔ impedir kart duplicado
  if (
    newKartId &&
    tempGrid.some((g, i) => i !== index && g.kart_id === newKartId)
  ) {
    alert("❌ Este kart ya está asignado a otro piloto");
    return;
  }

  tempGrid[index].kart_id = newKartId;
  renderTempGrid();
}


// Render UI parrilla
function renderTempGrid() {
  const tbody = qs("#grid-table-body");
  if (!tbody) return;

  if (!tempGrid.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="muted">Añade pilotos a la parrilla</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = tempGrid.map((g, i) => {
    const driver = driversCache.find(d => d.id === g.driver_id);
    const kart = kartsCache.find(k => k.id === g.kart_id);

    const transponder =
      kart?.transponder ??
      kart?.transponder_code ??
      driver?.transponder ??
      "-";

    return `
      <tr>
        <td>${i + 1}</td>
        <td>${driver ? `${driver.name} ${driver.lastname || ""}` : "-"}</td>
        <td>
          <select onchange="assignTempKart(${i}, this.value)">
            <option value="">-</option>
            ${kartsCache
              .filter(k => {
                const usedByOther = tempGrid.some(
                  (g2, idx) => idx !== i && g2.kart_id === k.id
                );
                // permitir el kart propio y excluir los de otros
                return !usedByOther || k.id === g.kart_id;
              })
              .map(k => `
                <option value="${k.id}" ${k.id === g.kart_id ? "selected" : ""}>
                  #${k.number}
                </option>
              `)
              .join("")}
          </select>
        </td>
        <td>${transponder}</td>
        <td>
          <button class="btn btn-sm" onclick="removeTemp(${i})">❌</button>
        </td>
      </tr>
    `;
  }).join("");
}

 

// ====================================================
// BORRAR SESIÓN
// ====================================================
async function deleteSession(sessionId) {
  if (!confirm("⚠️ ¿Seguro que quieres borrar esta sesión?\nSe eliminarán participantes y vueltas.")) {
    return;
  }

  await apiSend(`/sessions/${sessionId}`, "DELETE");
  loadSessions();
}

// ====================================================
// GRID UI (compatibilidad)
// ====================================================
function setupGridUI() {
  // La parrilla ahora se maneja dentro de SESSIONS
  // Esta función existe solo para no romper initDashboard
}

// ====================================================
// TIMING POINTS
// ====================================================

async function loadTimingPoints() {
  const list = await apiGet("/timing-points", []);
  const tbody = qs("#tpoints-table-body");
  if (!tbody) return;

  tbody.innerHTML = list
    .map(
      tp => `
      <tr>
        <td>${tp.id}</td>
        <td>${tp.name}</td>
        <td>${tp.type}</td>
        <td>${tp.sector_number || "-"}</td>
        <td>${tp.protocol || "-"}</td>
        <td>${tp.decoder_ip || "-"}</td>
        <td>
          <button data-id="${tp.id}" data-action="edit-tp" class="btn btn-sm">Editar</button>
          <button data-id="${tp.id}" data-action="del-tp" class="btn btn-sm">Eliminar</button>
        </td>
      </tr>`
    )
    .join("");

  qsa("button[data-action='edit-tp']", tbody).forEach(btn => {
    btn.addEventListener("click", () =>
      fillTimingPointForm(btn.dataset.id, list)
    );
  });

  qsa("button[data-action='del-tp']", tbody).forEach(btn => {
    btn.addEventListener("click", () =>
      deleteTimingPoint(btn.dataset.id)
    );
  });
}

function fillTimingPointForm(id, list) {
  const tp = list.find(x => x.id == id);
  if (!tp) return;

  qs("#tp-id").value = tp.id;
  qs("#tp-name").value = tp.name;
  qs("#tp-type").value = tp.type;
  qs("#tp-sector").value = tp.sector_number || "";
  qs("#tp-loop").value = tp.loop_code || "";
  qs("#tp-protocol").value = tp.protocol;
  qs("#tp-ip").value = tp.decoder_ip || "";
  qs("#tp-port").value = tp.decoder_port || "";
  qs("#tp-user").value = tp.username || "";
  qs("#tp-password").value = "";
}

async function deleteTimingPoint(id) {
  if (!confirm("¿Eliminar punto?")) return;
  await apiSend(`/timing-points/${id}`, "DELETE");
  loadTimingPoints();
}

function setupTimingPointForm() {
  const form = qs("#form-tpoint");
  if (!form) return;

  qs("#btn-tp-reset")?.addEventListener("click", () => {
    form.reset();
    qs("#tp-id").value = "";
  });

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const id = qs("#tp-id").value || null;

  const toIntOrNull = v => {
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

const payload = {
  name: qs("#tp-name").value.trim(),
  type: qs("#tp-type").value,

  sector_number: toIntOrNull(qs("#tp-sector").value),
  loop_code: toIntOrNull(qs("#tp-loop").value),

  protocol: qs("#tp-protocol").value,
  decoder_ip: qs("#tp-ip").value || null,

  decoder_port: toIntOrNull(qs("#tp-port").value),

  username: qs("#tp-user").value || null,
  password: qs("#tp-password").value || null
};


    console.log("📤 Enviando Timing Point:", payload);

    if (id) {
      await apiSend("/timing-points", "POST", { ...payload, id });
    } else {
      await apiSend("/timing-points", "POST", payload);
    }

    form.reset();
    qs("#tp-id").value = "";
    loadTimingPoints();
  });
}


// ====================================================
// TRANSPONDERS
// ====================================================

async function loadTransponders() {
  const list = await apiGet("/transponders", []);
  const tbody = qs("#transponders-table-body");
  if (!tbody) return;

  tbody.innerHTML = list
    .map(
      t => `
    <tr>
      <td>${t.id}</td>
      <td>${t.code}</td>
      <td>${t.driver_id || "-"}</td>
      <td>${t.kart_id || "-"}</td>
      <td>
        <button data-id="${t.id}" data-action="del-transp" class="btn btn-sm">Eliminar</button>
      </td>
    </tr>`
    )
    .join("");

  qsa("button[data-action='del-transp']", tbody).forEach(btn => {
    btn.addEventListener("click", () => deleteTransponder(btn.dataset.id));
  });
}

async function deleteTransponder(id) {
  if (!confirm("¿Eliminar transponder?")) return;
  await apiSend(`/transponders/${id}`, "DELETE");
  loadTransponders();
}

function setupTranspondersForm() {
  const form = qs("#form-transponder");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const payload = {
      code: qs("#transp-code").value,
      driver_id: qs("#transp-driver").value || null,
      kart_id: qs("#transp-kart").value || null,
    };

    await apiSend("/transponders", "POST", payload);
    form.reset();
    loadTransponders();
  });
}

// ====================================================
// PARTICIPANTS
// ====================================================

async function loadParticipantsForSelected() {
  const sessionId = qs("#participants-session-select").value;
  if (!sessionId) return;

  const list = await apiGet(`/sessions/${sessionId}/participants`, []);
  const tbody = qs("#participants-table-body");
  if (!tbody) return;

  tbody.innerHTML = list
    .map(
      p => `
    <tr>
      <td>${p.id}</td>
      <td>${p.driver_name || p.driver_id || "-"}</td>
      <td>${p.kart_number || p.kart_id || "-"}</td>
      <td>${p.transponder || "-"}</td>
      <td>${p.laps || "-"}</td>
      <td>${p.best_lap ? formatMs(p.best_lap) : "-"}</td>
      <td>${p.last_lap ? formatMs(p.last_lap) : "-"}</td>
    </tr>`
    )
    .join("");
}

function setupParticipantsUI() {
  qs("#btn-participants-refresh")?.addEventListener("click", loadParticipantsForSelected);

  const form = qs("#form-participant");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const sessionId = qs("#participants-session-select").value;
    if (!sessionId) {
      alert("Selecciona sesión");
      return;
    }

    const payload = {
      driver_id: qs("#part-driver-id").value || null,
      kart_id: qs("#part-kart-id").value || null,
      transponder: qs("#part-transp").value || null
    };

    await apiSend(`/sessions/${sessionId}/participants`, "POST", payload);
    form.reset();
    loadParticipantsForSelected();
  });
}

// ====================================================
// PENALTIES
// ====================================================

async function loadPenalties() {
  const list = await apiGet("/penalties", []);
  const tbody = qs("#penalties-table-body");
  if (!tbody) return;

  tbody.innerHTML = list
    .map(
      p => `
    <tr>
      <td>${p.id}</td>
      <td>${p.session_id}</td>
      <td>${p.participant_id}</td>
      <td>${p.type || p.code}</td>
      <td>${p.details || p.notes}</td>
    </tr>`
    )
    .join("");
}

function setupPenaltiesUI() {
  qs("#btn-penalties-refresh")?.addEventListener("click", loadPenalties);
}

// ====================================================
// RACE CONTROL
// ====================================================

async function loadRaceState() {
  const id = qs("#racecontrol-session-select")?.value;
  const box = qs("#racecontrol-state");
  if (!id || !box) return;

  try {
    const res = await fetch(`${API}/race-control/session/${id}/state`);
    box.textContent = res.ok ? JSON.stringify(await res.json(), null, 2) : "Sin estado";
  } catch {
    box.textContent = "Error de conexión";
  }
}

function setupRaceControlUI() {
  qs("#btn-race-refresh")?.addEventListener("click", loadRaceState);
}

// ====================================================
// RANKINGS
// ====================================================

async function loadRankingsSection() {
  const list = await apiGet("/rankings/best-laps", []);
  const tbody = qs("#rankings-table-body");
  if (!tbody) return;

  tbody.innerHTML = list
    .map(
      (r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.driver_name}</td>
      <td>${r.session_name}</td>
      <td>${formatMs(r.best_lap_ms || r.best_lap)}</td>
    </tr>`
    )
    .join("");
}

function setupRankingsUI() {
  qs("#btn-rankings-refresh")?.addEventListener("click", loadRankingsSection);
  qs("#btn-open-rankings2")?.addEventListener("click", () => window.open("/rankings.html", "_blank"));
}

// ====================================================
// MAINTENANCE OVERVIEW
// ====================================================

async function loadMaintenanceOverview() {
  const list = await apiGet("/maintenance/karts/overview", []);
  window.__maintenanceOverviewCache = Array.isArray(list) ? list : [];
  renderMaintenanceOverview();
}

function fmtHours(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  const num = Number(v);
  // Mostrar 1 decimal si hace falta
  const s = Math.round(num * 10) / 10;
  return (s % 1 === 0) ? String(s.toFixed(0)) : String(s.toFixed(1));
}

function fmtDate(v) {
  if (!v) return "-";
  try {
    return new Date(v).toLocaleString();
  } catch {
    return "-";
  }
}

function renderMaintenanceOverview() {
  const tbody = qs("#maint-karts-body");
  if (!tbody) return;

  const list = window.__maintenanceOverviewCache || [];
  const kartFilter = qs("#maint-kart-filter")?.value || "";
  const q = (qs("#maint-search")?.value || "").trim().toLowerCase();

  let view = list.slice();

  if (kartFilter) view = view.filter(k => String(k.id) === String(kartFilter));

  if (q) {
    view = view.filter(k => {
      const num = String(k.number ?? "").toLowerCase();
      const tx = String(k.transponder ?? "").toLowerCase();
      const notes = String(k.notes ?? "").toLowerCase();
      return num.includes(q) || tx.includes(q) || notes.includes(q);
    });
  }

  // Estado final para UI (si el backend ya lo da, perfecto).
  // Si no lo da, lo calculamos aquí con tareas/jobs.
  const uiStatusOf = (k) => {
    const base = String((k.ui_status || k.maintenance_status || "")).toLowerCase();
    const openTasks = Number(k.open_tasks || 0);
    const openJobs = Number(k.open_jobs || 0);

    // Si el backend manda ui_status, lo respetamos.
    if (k.ui_status) return base;

    // Si no, combinamos: overdue manda siempre, luego review si hay pendientes,
    // luego warn, luego ok.
    if (base === "overdue") return "overdue";
    if (openTasks > 0 || openJobs > 0) return "review";
    if (base === "warn") return "warn";
    if (base === "ok") return "ok";
    return base || "ok";
  };

  // Orden: overdue primero, luego review, luego warn, luego ok/otros; y por "restantes" asc
  const prio = (s) => (s === "overdue" ? 0 : s === "review" ? 1 : s === "warn" ? 2 : 3);

  view.sort((a, b) => {
    const sa = uiStatusOf(a);
    const sb = uiStatusOf(b);

    const pa = prio(sa);
    const pb = prio(sb);
    if (pa !== pb) return pa - pb;

    const ra = (a.next_service_at != null && a.hours_used != null)
      ? (Number(a.next_service_at) - Number(a.hours_used))
      : 1e9;
    const rb = (b.next_service_at != null && b.hours_used != null)
      ? (Number(b.next_service_at) - Number(b.hours_used))
      : 1e9;
    if (ra !== rb) return ra - rb;

    return Number(a.number) - Number(b.number);
  });

  if (!view.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Sin resultados</td></tr>`;
    return;
  }

  const badge = (status, k) => {
    const s = String(status || "").toLowerCase();

    const openTasks = Number(k.open_tasks || 0);
    const openJobs = Number(k.open_jobs || 0);

    let label = s || "-";

    if (s === "review") {
      const parts = [];
      if (openTasks > 0) parts.push(`${openTasks} tarea${openTasks === 1 ? "" : "s"}`);
      if (openJobs > 0) parts.push(`${openJobs} trabajo${openJobs === 1 ? "" : "s"}`);
      label = `REVISAR (${parts.length ? parts.join(", ") : "pendiente"})`;
    } else if (s === "overdue") {
      label = "OVERDUE";
    } else if (s === "warn") {
      label = "WARN";
    } else if (s === "ok") {
      label = "OK";
    }

    const bg =
      s === "overdue" ? "#7f1d1d" :
      s === "review" ? "#991b1b" :
      s === "warn" ? "#7c2d12" :
      s === "ok" ? "#064e3b" :
      "#334155";

    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:${bg};color:#e5e7eb;">${label}</span>`;
  };

  tbody.innerHTML = view.map(k => {
    const remaining = (k.next_service_at != null && k.hours_used != null)
      ? (Number(k.next_service_at) - Number(k.hours_used))
      : null;

    const remainingTxt = remaining === null ? "-" : fmtHours(remaining);

    const status = uiStatusOf(k);

    return `
      <tr>
        <td><b>#${k.number}</b>${k.transponder ? `<div class="muted" style="font-size:12px;">TX: ${k.transponder}</div>` : ""}</td>
        <td>${badge(status, k)}</td>
        <td>${fmtHours(k.hours_used)}</td>
        <td>${fmtHours(k.next_service_at)}</td>
        <td>${remainingTxt}</td>
        <td>${fmtDate(k.last_service)}</td>
        <td>${k.alert_margin ?? "-"}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" data-action="maint-new-job" data-kart-id="${k.id}" data-kart-number="${k.number}">Trabajo</button>
          <button class="btn btn-sm" data-action="maint-new-task" data-kart-id="${k.id}" data-kart-number="${k.number}">Tarea</button>
          <button class="btn btn-sm" data-action="maint-history" data-kart-id="${k.id}" data-kart-number="${k.number}">Historial</button>
        </td>
      </tr>
    `;
  }).join("");

  // Delegación de eventos (acciones rápidas)
  qsa("button[data-action]", tbody).forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const kartId = btn.dataset.kartId;
      const kartNumber = btn.dataset.kartNumber;

      if (btn.dataset.action === "maint-new-job") {
        const sel = qs("#job-kart");
        if (sel) sel.value = String(kartId);
        const title = qs("#job-title");
        if (title && !title.value) title.value = `Servicio kart #${kartNumber}`;
        qs("#job-title")?.focus();
        qs("#job-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (btn.dataset.action === "maint-new-task") {
        const sel = qs("#maint-task-kart");
        if (sel) sel.value = String(kartId);
        qs("#maint-task-rule")?.focus();
        qs("#form-maint-task")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      if (btn.dataset.action === "maint-history") {
        loadMaintenanceHistory(Number(kartId), String(kartNumber));
        return;
      }
    });
  });
}
/**
 * Historial simple por kart (Jobs + Tareas)
 * NOTA: no hay endpoint dedicado, así que filtramos en frontend.
 */
async function loadMaintenanceHistory(kartId, kartNumberLabel) {
  const card = qs("#maint-history-card");
  if (!card) return;

  qs("#maint-history-kart-label").textContent = `#${kartNumberLabel}`;
  card.style.display = "block";
  card.scrollIntoView({ behavior: "smooth", block: "start" });

  const [jobs, tasks] = await Promise.all([
    apiGet("/maintenance/jobs", []),
    apiGet("/maintenance/tasks", []),
  ]);

  const jobsTbody = qs("#maint-history-jobs");
  const tasksTbody = qs("#maint-history-tasks");
  const alertsTbody = qs("#maint-history-alerts");

  if (jobsTbody) {
    const j = (jobs || []).filter(x => String(x.kart_id) === String(kartId));
    jobsTbody.innerHTML = j.length
      ? j.map(x => `
          <tr>
            <td>${x.id}</td>
            <td>${x.title || "-"}</td>
            <td>${x.status}</td>
            <td>${fmtDate(x.opened_at)}</td>
            <td>${x.closed_at ? fmtDate(x.closed_at) : "-"}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="5" class="muted">Sin trabajos</td></tr>`;
  }

  if (tasksTbody) {
    const t = (tasks || []).filter(x => String(x.kart_id) === String(kartId));
    tasksTbody.innerHTML = t.length
      ? t.map(x => `
          <tr>
            <td>${x.id}</td>
            <td>${x.rule_id || "-"}</td>
            <td>${x.status}</td>
            <td>${fmtDate(x.created_at)}</td>
            <td>${x.completed_at ? fmtDate(x.completed_at) : "-"}</td>
            <td>${x.job_id || "-"}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6" class="muted">Sin tareas</td></tr>`;
  }

  if (alertsTbody) {
    // No hay tabla de alertas histórica en backend.
    // Mostramos un resumen simple según el estado actual del kart.
    const k = (window.__maintenanceOverviewCache || []).find(x => String(x.id) === String(kartId));
    if (!k) {
      alertsTbody.innerHTML = `<tr><td colspan="4" class="muted">Sin alertas</td></tr>`;
    } else if (k.maintenance_status === "warn" || k.maintenance_status === "overdue") {
      const msg = k.maintenance_status === "overdue"
        ? `Servicio vencido. Próx: ${fmtHours(k.next_service_at)}h — Actual: ${fmtHours(k.hours_used)}h`
        : `Servicio próximo. Próx: ${fmtHours(k.next_service_at)}h — Actual: ${fmtHours(k.hours_used)}h`;
      alertsTbody.innerHTML = `
        <tr>
          <td>-</td>
          <td>-</td>
          <td>${fmtDate(new Date().toISOString())}</td>
          <td>${msg}</td>
        </tr>
      `;
    } else {
      alertsTbody.innerHTML = `<tr><td colspan="4" class="muted">Sin alertas</td></tr>`;
    }
  }
}
// ====================================================
// MAINTENANCE TASKS (ADVANCED LIST + FILTERS)
// ====================================================

async function loadMaintenanceTasks() {
  const tbody = qs("#maint-tasks-body");
  if (!tbody) return;

  const status = qs("#maint-status-filter")?.value || "all";
  const kartId = qs("#maint-kart-filter")?.value || "";

  let list = await apiGet("/maintenance/tasks", []);

  if (status !== "all") list = list.filter(t => t.status === status);
  if (kartId) list = list.filter(t => String(t.kart_id) === String(kartId));

  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sin tareas</td></tr>`;
    return;
  }

  tbody.innerHTML = list
    .map(
      t => `
    <tr>
      <td>${t.id}</td>
      <td>${t.kart_number ? "#" + t.kart_number : t.kart_id}</td>
      <td>${t.rule_id || "-"}</td>
      <td>${t.status}</td>
      <td>${new Date(t.created_at).toLocaleString()}</td>
      <td>${t.completed_at ? new Date(t.completed_at).toLocaleString() : "-"}</td>
      <td>
        ${
          t.status === "open"
            ? `<button class="btn btn-sm" data-action="maint-complete" data-id="${t.id}">Cerrar</button>`
            : `<button class="btn btn-sm" data-action="maint-reopen" data-id="${t.id}">Reabrir</button>`
        }
        <button class="btn btn-sm" data-action="maint-delete" data-id="${t.id}">Eliminar</button>
      </td>
    </tr>`
    )
    .join("");

  qsa("button[data-action='maint-complete']", tbody).forEach(btn => {
    btn.addEventListener("click", () => completeMaintenanceTask(btn.dataset.id));
  });

  qsa("button[data-action='maint-reopen']", tbody).forEach(btn => {
    btn.addEventListener("click", () => reopenMaintenanceTask(btn.dataset.id));
  });

  qsa("button[data-action='maint-delete']", tbody).forEach(btn => {
    btn.addEventListener("click", () => deleteMaintenanceTask(btn.dataset.id));
  });
}

async function completeMaintenanceTask(id) {
  if (!confirm("¿Cerrar tarea?")) return;
  await apiSend(`/maintenance/tasks/${id}/complete`, "PUT");
  loadMaintenanceTasks();
  loadMaintenanceOverview();
}

async function reopenMaintenanceTask(id) {
  if (!confirm("¿Reabrir tarea?")) return;
  await apiSend(`/maintenance/tasks/${id}/reopen`, "PUT");
  loadMaintenanceTasks();
  loadMaintenanceOverview();
}

async function deleteMaintenanceTask(id) {
  if (!confirm("¿Eliminar tarea?")) return;
  await apiSend(`/maintenance/tasks/${id}`, "DELETE");
  loadMaintenanceTasks();
  loadMaintenanceOverview();
}

async function fillMaintenanceKartSelect() {
  const sel = qs("#maint-task-kart");
  if (!sel) return;

  const list = await apiGet("/karts", []);
  sel.innerHTML =
    `<option value="">-- Selecciona un kart --</option>` +
    list.map(k => `<option value="${k.id}">#${k.number}</option>`).join("");
}

async function fillMaintenanceKartFilter() {
  const sel = qs("#maint-kart-filter");
  if (!sel) return;

  const prev = sel.value || "";
  const list = await apiGet("/karts", []);
  sel.innerHTML =
    `<option value="">Todos</option>` +
    list.map(k => `<option value="${k.id}">#${k.number}</option>`).join("");

  // Mantener selección si existe
  if (prev) sel.value = prev;

  renderMaintenanceOverview();
}

function setupMaintenanceUI() {
  qs("#btn-maint-refresh")?.addEventListener("click", () => {
    loadMaintenanceOverview();
    loadMaintenanceTasks();
  });

  qs("#maint-status-filter")?.addEventListener("change", loadMaintenanceTasks);
  qs("#maint-kart-filter")?.addEventListener("change", () => {
    renderMaintenanceOverview();
    loadMaintenanceTasks();
  });
  qs("#maint-search")?.addEventListener("input", renderMaintenanceOverview);

  const form = qs("#form-maint-task");
  if (form) {
    form.addEventListener("submit", async e => {
      e.preventDefault();

      const kartId = qs("#maint-task-kart").value;
      if (!kartId) return alert("Selecciona un kart");

      const ruleVal = qs("#maint-task-rule").value;

      await apiSend("/maintenance/tasks", "POST", {
        kart_id: Number(kartId),
        rule_id: ruleVal ? Number(ruleVal) : null
      });

      form.reset();
      loadMaintenanceTasks();
      loadMaintenanceOverview();
    });
  }

  fillMaintenanceKartSelect();
  fillMaintenanceKartFilter();
}

// ====================================================
// MAINTENANCE RULES
// ====================================================

async function loadMaintenanceRules() {
  const list = await apiGet("/maintenance/rules", []);
  const tbody = qs("#rules-body");
  if (!tbody) return;

  tbody.innerHTML = list
    .map(
      r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.rule_type}</td>
      <td>${r.rule_value}</td>
      <td>${r.description || ""}</td>
      <td>
        <button data-edit="${r.id}" class="btn btn-sm">Editar</button>
        <button data-del="${r.id}" class="btn btn-sm">Eliminar</button>
      </td>
    </tr>`
    )
    .join("");

  qsa("button[data-del]", tbody).forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar regla?")) return;
      await apiSend(`/maintenance/rules/${btn.dataset.del}`, "DELETE");
      loadMaintenanceRules();
    });
  });

  qsa("button[data-edit]", tbody).forEach(btn => {
    btn.addEventListener("click", () => editRule(btn.dataset.edit));
  });
}

async function editRule(id) {
  const r = await apiGet(`/maintenance/rules/${id}`, null);
  if (!r) return alert("Regla no encontrada");

  const newType = prompt("Tipo (hours/laps/days):", r.rule_type);
  const newValue = prompt("Valor:", r.rule_value);
  const newDesc = prompt("Descripción:", r.description || "");

  if (!newType || !newValue) return;

  await apiSend(`/maintenance/rules/${id}`, "PUT", {
    rule_type: newType,
    rule_value: Number(newValue),
    description: newDesc,
  });

  loadMaintenanceRules();
}

qs("#rule-form")?.addEventListener("submit", async e => {
  e.preventDefault();

  await apiSend("/maintenance/rules", "POST", {
    rule_type: qs("#rule-type").value,
    rule_value: Number(qs("#rule-value").value),
    description: qs("#rule-desc").value
  });

  e.target.reset();
  loadMaintenanceRules();
});

// ====================================================
// MAINTENANCE JOBS
// ====================================================

async function fillJobsKartSelect() {
  const sel = qs("#job-kart");
  if (!sel) return;

  const list = await apiGet("/karts", []);
  sel.innerHTML =
    `<option value="">-- Selecciona un kart --</option>` +
    list.map(k => `<option value="${k.id}">#${k.number}</option>`).join("");
}

async function loadMaintenanceJobs() {
  const tbody = qs("#jobs-body");
  if (!tbody) return;

  const jobs = await apiGet("/maintenance/jobs", []);
  if (!jobs.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sin trabajos</td></tr>`;
    return;
  }

  tbody.innerHTML = jobs
    .map(
      j => `
    <tr>
      <td>${j.id}</td>
      <td>${j.kart_number ? "#" + j.kart_number : j.kart_id}</td>
      <td>${j.title}</td>
      <td>${j.status}</td>
      <td>${new Date(j.opened_at).toLocaleString()}</td>
      <td>${j.closed_at ? new Date(j.closed_at).toLocaleString() : "-"}</td>
      <td>${j.status !== "done" ? `<button class="btn btn-sm" data-id="${j.id}" data-action="job-close">Cerrar</button>` : ""}</td>
    </tr>`
    )
    .join("");

  qsa("button[data-action='job-close']", tbody).forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Cerrar trabajo?")) return;
      await apiSend(`/maintenance/jobs/${btn.dataset.id}/close`, "PUT");
      loadMaintenanceJobs();
      loadMaintenanceTasks();
      loadMaintenanceOverview();
    });
  });
}

function setupJobsUI() {
  qs("#job-form")?.addEventListener("submit", async e => {
    e.preventDefault();

    const kartId = qs("#job-kart").value;
    if (!kartId) return alert("Selecciona un kart");

    await apiSend("/maintenance/jobs", "POST", {
      kart_id: Number(kartId),
      title: qs("#job-title").value,
      description: qs("#job-desc").value
    });

    e.target.reset();
    loadMaintenanceJobs();
  });

  fillJobsKartSelect();
}

// ====================================================
// HISTORY MODAL
// ====================================================

function openHistoryModal() {
  qs("#historyModal").style.display = "block";
}

function closeHistoryModal() {
  qs("#historyModal").style.display = "none";
}

function renderSummary(container, summary) {
  if (!summary) {
    container.innerHTML = "<p>Sin historial registrado</p>";
    return;
  }

  container.innerHTML = `
    <p>Total sesiones: 1</p>
    <p>Total vueltas: ${summary.total_laps}</p>
    <p>Mejor vuelta: ${formatMs(summary.best_lap)}</p>
    <p>Promedio: ${formatMs(summary.avg_lap)}</p>
    <p>Consistencia: ${summary.consistency.toFixed(1)}%</p>
    <p>Tiempo total: ${formatMs(summary.total_time)}</p>
  `;
}


function renderSessions(el, list) {
  el.innerHTML = `
    <tr>
      <th>Sesión</th>
      <th>Tipo</th>
      <th>Vueltas</th>
      <th>Mejor</th>
      <th>Media</th>
      <th>Consistencia</th>
    </tr>
    ${list
      .map(
        s => `
      <tr>
        <td>${s.session_name}</td>
        <td>${s.session_type}</td>
        <td>${s.total_laps}</td>
        <td>${s.best_lap}</td>
        <td>${Number(s.avg_lap).toFixed(2)}</td>
        <td>${Number(s.consistency_score).toFixed(2)}%</td>
      </tr>`
      )
      .join("")}
  `;
}

function renderLaps(el, list) {
  el.innerHTML = `
    <tr>
      <th>Sesión</th>
      <th>Vuelta</th>
      <th>Tiempo</th>
      <th>Piloto</th>
    </tr>
    ${list
      .map(
        l => `
      <tr>
        <td>${l.session_name}</td>
        <td>${l.lap_number}</td>
        <td>${formatMs(l.lap_time_ms)}</td>
        <td>${l.driver_name || "-"}</td>
      </tr>`
      )
      .join("")}
  `;
}

async function viewDriverHistory(id, name) {
  qs("#historyTitle").textContent = `Historial de ${name}`;
  openHistoryModal();

  const summary = await apiGet(`/drivers/${id}/history/summary`, {});
  const sessions = await apiGet(`/drivers/${id}/history/sessions`, []);
  const laps = await apiGet(`/drivers/${id}/history`, []);

  renderSummary(qs("#historySummary"), summary);
  renderSessions(qs("#historySessions"), sessions);
  renderLaps(qs("#historyLaps"), laps);
}

async function viewKartHistory(id, number) {
  qs("#historyTitle").textContent = `Historial del Kart ${number}`;
  openHistoryModal();

  // 🔹 IMPORTANTE: ahora usamos el NÚMERO del kart (no el id interno)
  const data = await apiGet(`/karts/number/${number}/history`, null);

  if (!data) {
    qs("#historySummary").innerHTML = "<p>Error cargando historial</p>";
    return;
  }

  const { summary, sessions, laps } = data;

  renderSummary(qs("#historySummary"), summary);
  renderSessions(qs("#historySessions"), sessions);
  renderLaps(qs("#historyLaps"), laps);
}


function openLevelsModal() {
  const modal = document.querySelector("#levelsModal");
  console.log("MODAL:", modal);

  if (!modal) {
    alert("❌ Modal levelsModal NO existe en el DOM");
    return;
  }

  modal.style.display = "block";
  loadLevels();
}
// ====================================================
// SESIONES + PARRILLA (VERSIÓN FINAL)
// ====================================================

// ----------------------------------------------------
// CARGAR PARRILLA REAL DESDE BACKEND
// ----------------------------------------------------
async function loadSessionGrid(sessionId) {
  try {
    const list = await apiGet(`/sessions/${sessionId}/participants`, []);

    if (!Array.isArray(list)) {
      tempGrid = [];
      renderTempGrid();
      return;
    }

    // 🔹 backend → estado único (tempGrid)
    tempGrid = list.map(p => ({
      participant_id: p.participant_id,
      driver_id: p.driver_id,
      kart_id: Number.isInteger(p.kart_id) ? p.kart_id : null,
      transponder: p.transponder ?? null
    }));

    renderTempGrid();
  } catch (err) {
    console.error("❌ loadSessionGrid:", err);
    tempGrid = [];
    renderTempGrid();
  }
}


// ----------------------------------------------------
// CREAR SESIÓN (FORM SUBMIT) – RECARGA FORZADA
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const form = qs("#form-session");
  if (!form) return;

  form.addEventListener("submit", async e => {
    e.preventDefault();

    // ⛔ Evitar doble submit REAL
    if (form.dataset.saving === "1") return;
    form.dataset.saving = "1";

    const payload = {
      name: qs("#session-name")?.value || "Sesión",
      type: qs("#session-type")?.value || "practice",
      lap_limit: Number(qs("#session-lap-limit")?.value) || null,
      time_limit_seconds: Number(qs("#session-time-limit")?.value) || null,
      max_drivers: null
    };

    try {
      // Crear sesión
      await apiSend("/sessions", "POST", payload);
      console.log("✅ Sesión creada");
    } catch (err) {
      console.error("❌ Error creando sesión:", err);
      alert("❌ Error creando la sesión");
      form.dataset.saving = "0";
      return;
    }

    // ✅ MENSAJE + RECARGA TOTAL (SIN ESTADO)
    alert("✅ Sesión creada correctamente");

    // 🔄 RECARGA FORZADA (NO HAY RETORNO)
   window.location.href = window.location.pathname + "#sessions";

  });
});



// ----------------------------------------------------
// EDITAR SESIÓN (CARGAR DATOS + PARRILLA REAL)
// ----------------------------------------------------
async function editSession(sessionId) {
  try {
    await ensureCachesLoaded();

    const session = await apiGet(`/sessions/${sessionId}`);
    if (!session) return;

    // ---- 1) RELLENAR FORMULARIO ----
    qs("#session-id").value = session.id;
    qs("#session-name").value = session.name || "";
    qs("#session-type").value = session.type || "practice";

    if (qs("#session-lap-limit")) {
      qs("#session-lap-limit").value = session.lap_limit || "";
    }

    if (qs("#session-time-limit")) {
      qs("#session-time-limit").value =
        session.time_limit_seconds || "";
    }

    // ---- 2) CARGAR PARRILLA REAL (clave) ----
    await loadSessionGrid(session.id);

    // ---- 3) 🔹 MUY IMPORTANTE: ir a la sección correcta ----
    document.querySelector(
      '.nav-button[data-section="section-sessions"]'
    )?.click();

    console.log("✅ Sesión cargada correctamente:", sessionId);
  } catch (err) {
    console.error("❌ editSession:", err);
    alert("No se pudo cargar la sesión");
  }
}






// ====================================================
// INIT DASHBOARD (VERSIÓN LIMPIA Y CORRECTA)
// ====================================================
function initDashboard() {
  
  if (hash) {
    console.log("⛔ initDashboard bloqueado por hash:", hash);
    return;
  }

  // ⬇️ TODO EL CÓDIGO QUE YA TENÍAS SIGUE AQUÍ


  // ----------------------------
  // SETUP (una sola vez)
  // ----------------------------
  setupDriverForm(); 
  setupKartForm();
  setupTeamForm();
  setupSessionForm();
  setupTimingPointForm();
  setupTranspondersForm();
  setupParticipantsUI();
  setupPenaltiesUI();
  setupRaceControlUI();
  setupRankingsUI();
  setupMaintenanceUI();
  setupJobsUI();
  setupSessionSearch();
  setupDriversFilters();
  setupDriversSorting();
  setupDriversCSV();


  // ----------------------------
  // CARGA INICIAL DE DATOS
  // ----------------------------
  updateOverview();

  loadDrivers();
  loadDailyRanking();
  loadKarts();
  loadTeams();
  loadSessions();
  loadTimingPoints();
  loadTransponders();
  loadPenalties();
  loadRankingsSection();
  loadMaintenanceOverview();
  loadMaintenanceTasks();
  loadMaintenanceJobs();
  loadMaintenanceRules();
}

// AL FINAL DEL ARCHIVO FRONTEND
window.editDriver = fillDriverForm;
document.addEventListener("DOMContentLoaded", () => {
  loadDrivers();
  setupDriverLevelFilter();
});
document.addEventListener("DOMContentLoaded", () => {
  loadDrivers();
  setupDriverLevelFilter();
  loadDriverLevels();
  loadDriverLevelFilter();
  bindLevelsButton();
});




// ====================================================
// CARGAR LISTADO DE SESIONES
// ====================================================
// ====================================================
// CARGAR LISTADO DE SESIONES
// ====================================================
async function loadSessions() {
  const tbody = qs("#sessions-table-body");
  if (!tbody) return;

  let sessions = [];

  try {
    sessions = await apiGet("/sessions", []);
  } catch (err) {
    console.error("Error cargando sesiones", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="muted">No se pudieron cargar las sesiones</td>
      </tr>
    `;
    return;
  }

  if (!sessions.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="muted">No hay sesiones</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sessions.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${s.name || "-"}</td>
      <td>${s.type || "-"}</td>
      <td>${s.status || "-"}</td>
      <td>${s.laps || "-"}</td>
      <td>${s.time_limit || "-"}</td>
      <td>${s.transponder || "-"}</td>
      <td>
        <button class="btn btn-sm" onclick="editSession(${s.id})">
          ✏️ Editar
        </button>

        <button class="btn btn-sm danger" onclick="deleteSession(${s.id})">
          🗑️
        </button>
      </td>
    </tr>
  `).join("");
}
async function refreshSessionUI(sessionId) {
  if (!sessionId) return;

  // 1. Refrescar formulario
  const session = await apiGet(`/sessions/${sessionId}`);

  qs("#session-name").value = session.name || "";
  qs("#session-type").value = session.type || "practice";
  qs("#session-lap-limit").value = session.lap_limit || "";
  qs("#session-time-limit").value = session.time_limit_seconds || "";

  // 2. Refrescar parrilla
  await loadSessionGrid(sessionId);

  // 3. Refrescar listado de sesiones
  loadSessions();

  console.log("🔄 UI de sesión refrescada completamente:", sessionId);
}

// ====================================================
// BORRAR PARTICIPANTE DE UNA SESIÓN (X ROJA)
// ====================================================
async function removeParticipant(e, participantId) {
  // 🔒 Evitar submit del formulario o burbujeo
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Confirmación usuario
  if (!confirm("¿Eliminar piloto de la sesión?")) return;

  // Obtener sesión activa
  const sessionId = Number(qs("#session-id")?.value || 0);
  if (!sessionId) {
    alert("No hay sesión activa");
    return;
  }

  try {
    // ❌ Eliminar participante en backend
    await apiSend(
      `/sessions/${sessionId}/participants/${participantId}`,
      "DELETE"
    );

    console.log("✅ Participante eliminado:", participantId);

    // 🔄 Recargar parrilla REAL desde backend
    await loadSessionGrid(sessionId);

    console.log("🧹 Parrilla sincronizada tras eliminación");

  } catch (err) {
    console.error("❌ Error eliminando participante:", err);
    alert("Error eliminando participante");
  }
}

function goToSection(sectionId) {
  // quitar active
  document.querySelectorAll(".section").forEach(s =>
    s.classList.remove("active")
  );
  document.querySelectorAll(".nav-button").forEach(b =>
    b.classList.remove("active")
  );

  // activar sección
  document.querySelector(`#section-${sectionId}`)?.classList.add("active");
  document.querySelector(
    `.nav-button[data-section="section-${sectionId}"]`
  )?.classList.add("active");
}

 function getUsedKartIds() {
  return tempGrid
    .map(g => g.kart_id)
    .filter(id => Number.isInteger(id));
}

document.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("import-btn")) return;

  const sessionId = e.target.dataset.sessionId;
  const championshipId = e.target.dataset.championshipId;

  if (!sessionId || !championshipId) {
    alert("Faltan datos de sesión o campeonato");
    return;
  }

  e.target.disabled = true;
  e.target.textContent = "⏳ Importando...";

  try {
    const res = await fetch(
      `/api/championships/${championshipId}/import-session/${sessionId}`,
      { method: "POST" }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Error desconocido");
    }

    e.target.textContent = "✅ Importado";
    e.target.classList.add("imported");

    alert(`Importación correcta (${data.imported} pilotos)`);

  } catch (err) {
    console.error(err);
    e.target.disabled = false;
    e.target.textContent = "🏁 Importar al campeonato";
    alert("❌ " + err.message);
  }
});
