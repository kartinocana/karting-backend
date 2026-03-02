console.log("🚀 admin-levels.js CARGADO");

// =====================================================
// Cargar niveles en SELECT del FORMULARIO de piloto
// (#driver-skill)
// =====================================================
window.loadDriverLevels = async function () {
  const select = document.querySelector("#driver-skill");
  if (!select) return;

  try {
    const res = await fetch(`${API}/driver-levels`);
    const levels = await res.json();

    select.innerHTML =
      `<option value="">-</option>` +
      levels.map(l =>
        `<option value="${l.code}">${l.name}</option>`
      ).join("");

    console.log("🎯 Niveles cargados en SELECT (formulario):", levels);
  } catch (err) {
    console.error("❌ Error cargando niveles (formulario)", err);
  }
};

// =====================================================
// Cargar niveles en SELECT del FILTRO
// (#filter-driver-level)
// =====================================================
window.loadDriverLevelFilter = async function () {
  const select = document.querySelector("#filter-driver-level");
  if (!select) return;

  try {
    const res = await fetch(`${API}/driver-levels`);
    const levels = await res.json();

    select.innerHTML =
      `<option value="">Todos</option>` +
      levels.map(l =>
        `<option value="${l.code}">${l.name}</option>`
      ).join("");

    console.log("🎯 Niveles cargados en SELECT (filtro):", levels);
  } catch (err) {
    console.error("❌ Error cargando niveles (filtro)", err);
  }
};

// =====================================================
// Bind botón ⚙️ Niveles
// =====================================================
window.bindLevelsButton = function () {
  const btn = document.querySelector("#btn-manage-levels");
  if (!btn) return;

  if (btn.dataset.bound) return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", () => {
    console.log("🟢 CLICK EN NIVELES");
    openLevelsModal();
  });
};

// =====================================================
// Abrir / cerrar modal de niveles
// =====================================================
function openLevelsModal() {
  const modal = document.querySelector("#levelsModal");
  if (!modal) return;

  modal.style.display = "block";
  loadLevels();
}

window.closeLevelsModal = function () {
  const modal = document.querySelector("#levelsModal");
  if (modal) modal.style.display = "none";
};

// =====================================================
// Cargar niveles en la tabla del MODAL
// =====================================================
async function loadLevels() {
  const tbody = document.querySelector("#levels-body");
  if (!tbody) return;

  try {
    const res = await fetch(`${API}/driver-levels`);
    const levels = await res.json();

    tbody.innerHTML = levels.map(l => `
      <tr>
        <td>${l.code}</td>
        <td>${l.name}</td>
        <td>
          <span style="
            display:inline-block;
            width:16px;
            height:16px;
            background:${l.color};
            border-radius:4px;
            margin-right:6px;
            vertical-align:middle;
          "></span>
          ${l.color || "-"}
        </td>
        <td>
          <button class="btn btn-sm btn-danger"
                  onclick="deleteLevel(${l.id})">
            Eliminar
          </button>
        </td>
      </tr>
    `).join("");
  } catch (err) {
    console.error("❌ Error cargando niveles (modal)", err);
  }
}

// =====================================================
// Crear nivel
// =====================================================
window.createLevel = async function () {
  const codeEl = document.querySelector("#level-code");
  const nameEl = document.querySelector("#level-name");
  const colorEl = document.querySelector("#level-color");

  const code = codeEl?.value.trim();
  const name = nameEl?.value.trim();
  const color = colorEl?.value || null;

  if (!code || !name) {
    alert("Código y nombre obligatorios");
    return;
  }

  try {
    await fetch(`${API}/driver-levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, name, color })
    });

    if (codeEl) codeEl.value = "";
    if (nameEl) nameEl.value = "";

    loadLevels();
    loadDriverLevels();
    loadDriverLevelFilter();

    console.log("✅ Nivel creado:", code);
  } catch (err) {
    console.error("❌ Error creando nivel", err);
  }
};

// =====================================================
// Eliminar nivel
// =====================================================
window.deleteLevel = async function (id) {
  if (!confirm("¿Eliminar nivel?")) return;

  try {
    await fetch(`${API}/driver-levels/${id}`, {
      method: "DELETE"
    });

    loadLevels();
    loadDriverLevels();
    loadDriverLevelFilter();

    console.log("🗑️ Nivel eliminado:", id);
  } catch (err) {
    console.error("❌ Error eliminando nivel", err);
  }
};

