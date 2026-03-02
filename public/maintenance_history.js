let karts = [];
let tasks = [];
let jobs = [];
let alerts = [];
let activeTab = "tasks";

function getSelectedKartId(){
  return qs("#kart").value || "";
}

function applyHashKart(){
  const m = location.hash.match(/kart=(\d+)/);
  if(m) qs("#kart").value = m[1];
}

function setTab(tab){
  activeTab = tab;
  qsa(".tab").forEach(b=>b.classList.toggle("active", b.dataset.tab===tab));
  render();
}

function render(){
  const kartId = getSelectedKartId();
  const q = (qs("#q").value||"").toLowerCase().trim();

  const thead = qs("#thead");
  const tbody = qs("#tbody");

  const filterKart = (x)=> !kartId || String(x.kart_id)===String(kartId);
  const filterQ = (x)=>{
    if(!q) return true;
    return JSON.stringify(x).toLowerCase().includes(q);
  };

  if(activeTab==="tasks"){
    thead.innerHTML = `
      <tr><th>ID</th><th>Regla</th><th>Estado</th><th>Creada</th><th>Cerrada</th></tr>
    `;
    const list = tasks.filter(filterKart).filter(filterQ)
      .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));

    if(!list.length){ tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin datos</td></tr>`; return; }

    tbody.innerHTML = list.map(t=>`
      <tr>
        <td>${t.id}</td>
        <td>${t.rule_id ?? "-"}</td>
        <td>${t.status}</td>
        <td>${fmtDate(t.created_at)}</td>
        <td>${t.completed_at ? fmtDate(t.completed_at) : "-"}</td>
      </tr>
    `).join("");
    return;
  }

  if(activeTab==="jobs"){
    thead.innerHTML = `
      <tr><th>ID</th><th>Título</th><th>Estado</th><th>Creado</th><th>Cerrado</th></tr>
    `;
    const list = jobs.filter(filterKart).filter(filterQ)
      .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));

    if(!list.length){ tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin datos</td></tr>`; return; }

    tbody.innerHTML = list.map(j=>`
      <tr>
        <td>${j.id}</td>
        <td>${j.title ?? "-"}</td>
        <td>${j.status}</td>
        <td>${fmtDate(j.created_at)}</td>
        <td>${j.completed_at ? fmtDate(j.completed_at) : "-"}</td>
      </tr>
    `).join("");
    return;
  }

  // alerts
  thead.innerHTML = `
    <tr><th>ID</th><th>Tipo</th><th>Regla</th><th>Mensaje</th><th>Creada</th></tr>
  `;

  const list = alerts.filter(filterKart).filter(filterQ)
    .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));

  if(!list.length){ tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin datos</td></tr>`; return; }

  tbody.innerHTML = list.map(a=>`
    <tr>
      <td>${a.id}</td>
      <td>${a.type ?? "-"}</td>
      <td>${a.rule_id ?? "-"}</td>
      <td>${a.message ?? "-"}</td>
      <td>${fmtDate(a.created_at)}</td>
    </tr>
  `).join("");
}

async function load(){
  karts = await apiGet("/karts", []);
  tasks = await apiGet("/maintenance/tasks", []);
  jobs  = await apiGet("/maintenance/jobs", []);
  alerts = await apiGet("/maintenance/alerts/list", []); 
  // ↑ Si no tienes este endpoint, dime cuál usas para listar maintenance_alerts
  // (el /maintenance/alerts que tienes ahora devuelve warn/overdue de karts, no la tabla de alerts)

  qs("#kart").innerHTML =
    `<option value="">Todos</option>` +
    karts.map(k=>`<option value="${k.id}">#${k.number}</option>`).join("");

  applyHashKart();
  render();
}

document.addEventListener("DOMContentLoaded", ()=>{
  qs("#btn-refresh").addEventListener("click", load);
  qs("#kart").addEventListener("change", render);
  qs("#q").addEventListener("input", render);

  qsa(".tab").forEach(b=>b.addEventListener("click", ()=>setTab(b.dataset.tab)));

  load();
});