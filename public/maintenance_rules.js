let rules = [];

function render(){
  const tbody = qs("#tbody");
  if(!rules.length){
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin reglas</td></tr>`;
    return;
  }

  tbody.innerHTML = rules.map(r=>`
    <tr>
      <td>${r.id}</td>
      <td>${r.rule_type ?? r.type ?? "-"}</td>
      <td>${r.rule_value ?? r.value ?? "-"}</td>
      <td>${r.description ?? "-"}</td>
      <td>
        <div class="row-actions">
          <button class="btn small" data-act="edit" data-id="${r.id}">Editar</button>
          <button class="btn small danger" data-act="del" data-id="${r.id}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join("");

  qsa("button[data-act='edit']", tbody).forEach(b=>{
    b.addEventListener("click", ()=>editRule(b.dataset.id));
  });
  qsa("button[data-act='del']", tbody).forEach(b=>{
    b.addEventListener("click", ()=>deleteRule(b.dataset.id));
  });
}

async function load(){
  rules = await apiGet("/maintenance/rules", []);
  // orden por id asc
  rules.sort((a,b)=>a.id-b.id);
  render();
}

async function createRule(){
  const type = qs("#c-type").value;
  const value = qs("#c-value").value;
  const desc = qs("#c-desc").value.trim();

  if(!value) return alert("Pon un valor");
  if(!desc) return alert("Pon una descripción");

  await apiSend("/maintenance/rules", "POST", {
    rule_type: type,
    rule_value: Number(value),
    description: desc
  });

  qs("#c-value").value = "";
  qs("#c-desc").value = "";
  await load();
}

async function editRule(id){
  const r = rules.find(x=>String(x.id)===String(id));
  if(!r) return;

  const newType = prompt("Tipo (hours/days/laps):", (r.rule_type ?? r.type ?? "hours"));
  if(!newType) return;

  const newVal = prompt("Valor:", String(r.rule_value ?? r.value ?? ""));
  if(newVal === null) return;

  const newDesc = prompt("Descripción:", r.description ?? "");
  if(newDesc === null) return;

  await apiSend(`/maintenance/rules/${id}`, "PUT", {
    rule_type: newType,
    rule_value: Number(newVal),
    description: newDesc
  });

  await load();
}

async function deleteRule(id){
  if(!confirm("¿Eliminar regla?")) return;
  await apiSend(`/maintenance/rules/${id}`, "DELETE");
  await load();
}

document.addEventListener("DOMContentLoaded", ()=>{
  qs("#btn-refresh").addEventListener("click", load);
  qs("#btn-create").addEventListener("click", createRule);
  load();
});