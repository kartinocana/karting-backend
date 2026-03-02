async function loadDashboard(){
  // ✅ Fuente correcta: ya trae ui_status + open_tasks/open_jobs + horas/intervalos
  const overview = await apiGet("/maintenance/karts/overview", []);
  const tasks = await apiGet("/maintenance/tasks?status=all", []);

  // ✅ Traemos karts “reales” para saber si están desactivados
  const allKarts = await apiGet("/karts", []);

  // Mapa id -> is_disabled (true/false)
  const disabledById = new Map(
    (allKarts || []).map(k => [Number(k.id), !!k.is_disabled])
  );

  // Inyectar is_disabled en cada kart del overview
  (overview || []).forEach(k => {
    k.is_disabled = disabledById.get(Number(k.id)) || false;
  });

  const ui = (k) => String((k.ui_status || k.maintenance_status || "ok")).toLowerCase();

  const overdueCount = overview.filter(k => ui(k) === "overdue").length;
  const reviewCount  = overview.filter(k => ui(k) === "review").length;
  const warnCount    = overview.filter(k => ui(k) === "warn").length;
  const okCount      = overview.length - overdueCount - reviewCount - warnCount;

  qs("#kpi-ok").textContent = okCount;
  qs("#kpi-warn").textContent = warnCount;
  qs("#kpi-overdue").textContent = overdueCount;
  qs("#kpi-review").textContent = reviewCount;
  qs("#kpi-open-tasks").textContent = (tasks||[]).filter(t=>t.status==="open").length;

  // Orden: overdue -> review -> warn -> ok
  const prio = s => (s==="overdue"?0 : s==="review"?1 : s==="warn"?2 : 3);

  const rows = [...overview].sort((a,b)=>{
    const sa = ui(a), sb = ui(b);
    const pa = prio(sa), pb = prio(sb);
    if (pa !== pb) return pa - pb;
    return Number(a.number) - Number(b.number);
  });

  const tbody = qs("#karts-body");
  if(!rows.length){
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Sin karts</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(k=>{
    const status = ui(k);
    const openTasks = Number(k.open_tasks || 0);
    const openJobs  = Number(k.open_jobs || 0);

    const remaining = (k.next_service_at != null && k.hours_used != null)
      ? (Number(k.next_service_at) - Number(k.hours_used))
      : null;

    // Badge UI
    let badge = "";
    if (status === "overdue") {
      badge = `<span class="badge danger">OVERDUE</span>`;
    } else if (status === "review") {
      const parts = [];
      if (openTasks > 0) parts.push(`${openTasks} tarea${openTasks===1?"":"s"}`);
      if (openJobs > 0) parts.push(`${openJobs} trabajo${openJobs===1?"":"s"}`);
      badge = `<span class="badge danger">REVISAR${parts.length ? ` (${parts.join(", ")})` : ""}</span>`;
    } else if (status === "warn") {
      badge = `<span class="badge warn">WARN</span>`;
    } else {
      badge = `<span class="badge ok">OK</span>`;
    }

    return `
      <tr>
        <td>#${k.number ?? k.id}</td>
        <td>${badge}</td>
        <td>${k.hours_used ?? "-"}</td>
        <td>${remaining == null ? "-" : remaining.toFixed(2)}</td>
        <td>${k.alert_margin ?? "-"}</td>
        <td style="display:flex; gap:6px; align-items:center; flex-wrap:nowrap;">
          <a class="btn small" href="maintenance_history.html#kart=${k.id}">Historial</a>
          <a class="btn small" href="maintenance_tasks.html#kart=${k.id}">Tareas</a>
          ${
            k.is_disabled
              ? `<button class="btn small"
                   style="background:#16a34a;border-color:#16a34a;"
                   onclick="enableKart(${k.id})">✅ Reactivar</button>`
              : ""
          }
        </td>
      </tr>
    `;
  }).join("");
}

document.addEventListener("DOMContentLoaded", ()=>{
  qs("#btn-refresh")?.addEventListener("click", loadDashboard);
  loadDashboard();
});

async function enableKart(kartId){
  if(!confirm("¿Reactivar este kart?")) return;

  await apiSend(`/karts/${kartId}/enable`, "PUT");

  // recarga tabla y KPIs
  await loadDashboard();
}