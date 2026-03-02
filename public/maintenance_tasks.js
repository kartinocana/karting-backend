let allTasks = [];
let allKarts = [];

function applyHashKart(){
  const m = location.hash.match(/kart=(\d+)/);
  if(m) qs("#f-kart").value = m[1];
}

function render(){
  const tbody = qs("#tbody");
  const status = qs("#f-status").value;
  const kartId = qs("#f-kart").value;
  const q = (qs("#f-q").value||"").toLowerCase().trim();

  let list = [...allTasks];
  if(status !== "all") list = list.filter(t => t.status === status);
  if(kartId) list = list.filter(t => String(t.kart_id) === String(kartId));
  if(q){
    list = list.filter(t =>
      String(t.id).includes(q) ||
      String(t.rule_id||"").includes(q) ||
      String(t.kart_number||t.kart_id||"").includes(q)
    );
  }
  list.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));

  if(!list.length){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(t=>`
    <tr>
      <td>${t.id}</td>
      <td>${t.kart_number ? "#"+t.kart_number : t.kart_id}</td>
      <td>${t.rule_id ?? "-"}</td>
      <td>${t.status}</td>
      <td>${fmtDate(t.created_at)}</td>
      <td>${t.completed_at ? fmtDate(t.completed_at) : "-"}</td>
      <td>
        <div class="row-actions">
          ${t.status==="open" ? `<button class="btn small" data-act="close" data-id="${t.id}">Cerrar</button>` : ""}
          <button class="btn small danger" data-act="del" data-id="${t.id}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join("");

  qsa("button[data-act='close']", tbody).forEach(b=>{
    b.addEventListener("click", async ()=>{
      if(!confirm("¿Cerrar tarea?")) return;
      await apiSend(`/maintenance/tasks/${b.dataset.id}/complete`, "PUT");
      await load();
    });
  });

  qsa("button[data-act='del']", tbody).forEach(b=>{
    b.addEventListener("click", async ()=>{
      if(!confirm("¿Eliminar tarea?")) return;
      await apiSend(`/maintenance/tasks/${b.dataset.id}`, "DELETE");
      await load();
    });
  });
}

async function load(){
  allKarts = await apiGet("/karts", []);
  allTasks = await apiGet("/maintenance/tasks", []);

  // selects
  const optK = `<option value="">Todos</option>` + allKarts.map(k=>`<option value="${k.id}">#${k.number}</option>`).join("");
  qs("#f-kart").innerHTML = optK;

  qs("#c-kart").innerHTML =
    `<option value="">Selecciona…</option>` +
    allKarts.map(k=>`<option value="${k.id}">#${k.number}</option>`).join("");

  applyHashKart();
  render();
}

async function createTask(){
  const kartId = qs("#c-kart").value;
  const rule = qs("#c-rule").value;

  if(!kartId) return alert("Selecciona un kart");
  await apiSend("/maintenance/tasks", "POST", {
    kart_id: Number(kartId),
    rule_id: rule ? Number(rule) : null
  });

  qs("#c-rule").value = "";
  await load();
}

document.addEventListener("DOMContentLoaded", ()=>{
  qs("#btn-refresh").addEventListener("click", load);
  qs("#btn-create").addEventListener("click", createTask);
  qs("#f-status").addEventListener("change", render);
  qs("#f-kart").addEventListener("change", render);
  qs("#f-q").addEventListener("input", render);

  load();
});