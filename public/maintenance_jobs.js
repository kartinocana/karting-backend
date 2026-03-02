let jobs = [];
let karts = [];

function render(){
  const tbody = qs("#tbody");
  const status = qs("#f-status").value;

  let list = [...jobs];
  if(status !== "all") list = list.filter(j => j.status === status);
  list.sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));

  if(!list.length){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(j=>`
    <tr>
      <td>${j.id}</td>
      <td>${j.kart_number ? "#"+j.kart_number : j.kart_id}</td>
      <td>${j.title ?? "-"}</td>
      <td>${j.status}</td>
      <td>${fmtDate(j.created_at)}</td>
      <td>${j.completed_at ? fmtDate(j.completed_at) : "-"}</td>
      <td>
        <div class="row-actions">
          ${j.status==="open" ? `<button class="btn small" data-act="close" data-id="${j.id}">Cerrar</button>` : ""}
          <button class="btn small danger" data-act="del" data-id="${j.id}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join("");

  qsa("button[data-act='close']", tbody).forEach(b=>{
    b.addEventListener("click", async ()=>{
      if(!confirm("¿Cerrar trabajo?")) return;
      await apiSend(`/maintenance/jobs/${b.dataset.id}/complete`, "PUT");
      await load();
    });
  });

  qsa("button[data-act='del']", tbody).forEach(b=>{
    b.addEventListener("click", async ()=>{
      if(!confirm("¿Eliminar trabajo?")) return;
      await apiSend(`/maintenance/jobs/${b.dataset.id}`, "DELETE");
      await load();
    });
  });
}

async function load(){
  karts = await apiGet("/karts", []);
  jobs  = await apiGet("/maintenance/jobs", []);

  qs("#c-kart").innerHTML =
    `<option value="">Selecciona kart…</option>` +
    karts.map(k=>`<option value="${k.id}">#${k.number}</option>`).join("");

  render();
}

async function createJob(){
  const kartId = qs("#c-kart").value;
  const title = qs("#c-title").value.trim();
  const desc = qs("#c-desc").value.trim();

  if(!kartId) return alert("Selecciona kart");
  if(!title) return alert("Pon un título");

  await apiSend("/maintenance/jobs", "POST", {
    kart_id: Number(kartId),
    title,
    description: desc
  });

  qs("#c-title").value = "";
  qs("#c-desc").value = "";
  await load();
}

document.addEventListener("DOMContentLoaded", ()=>{
  qs("#btn-refresh").addEventListener("click", load);
  qs("#btn-refresh2").addEventListener("click", load);
  qs("#btn-create").addEventListener("click", createJob);
  qs("#f-status").addEventListener("change", render);
  load();
});