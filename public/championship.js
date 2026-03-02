const API_BASE="http://localhost:4000/api";
const params=new URLSearchParams(window.location.search);
const champId=params.get("championshipId");
const urlRoundId=params.get("roundId");


// ===== CACHE GLOBAL =====
let cacheDrivers=null;
let cacheLevels=null;
let cacheKarts=null;

const $=id=>document.getElementById(id);

function goBackToRounds(){
  if(champId){
    window.location=`championship_manage.html?championshipId=${champId}`;
  }else{
    window.location="championship_list.html";
  }
}


// ===== API =====
async function apiGet(path){
  const r=await fetch(`${API_BASE}${path}`);
  if(!r.ok) throw new Error(`GET ${path}`);
  return r.json();
}

async function apiSend(path,method,body){
  const r=await fetch(`${API_BASE}${path}`,{
    method,
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  if(!r.ok) throw new Error(await r.text());
  return r.json();
}

// ===== NORMALIZADOR =====
function normKey(v){
  return String(v||"")
    .trim().toLowerCase()
    .replace(/[\s\-_]+/g,"");
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded",()=>{
  if($("enrollRoundSelect")) initEnrollPage();
});

async function initEnrollPage(){

  bindDriverSearch();

  await loadEnrollRounds();
  await loadLevels();      // ⭐ ahora solo una vez
  await refreshAll();

  $("enrollRoundSelect")?.addEventListener("change",refreshAll);
  $("enrollCategorySelect")?.addEventListener("change",refreshAll);
  $("enrollDriverSelect")?.addEventListener("change",loadEnrollKarts);
}

// ===== LOAD BASE DATA =====
async function loadLevels(){
  if(!cacheLevels){
    cacheLevels=await apiGet("/driver-levels");
  }

  const sel=$("enrollCategorySelect");
  if(!sel) return;

  sel.innerHTML=`<option value="">-- Tanda libre --</option>`;
  cacheLevels.forEach(l=>{
    sel.innerHTML+=`<option value="${l.code}">${l.name}</option>`;
  });
}

async function getDrivers(){
  if(!cacheDrivers){
    cacheDrivers=await apiGet("/drivers");
  }
  return cacheDrivers;
}

async function getKarts(){
  if(!cacheKarts){
    cacheKarts=await apiGet("/karts");
  }
  return cacheKarts;
}

// ===== ROUNDS =====
async function loadEnrollRounds(){

  const rounds=await apiGet(`/championships/${champId}/rounds`);
  const sel=$("enrollRoundSelect");
  if(!sel) return;

  sel.innerHTML="";
  rounds.forEach(r=>{
    sel.innerHTML+=`<option value="${r.id}">${r.name}</option>`;
  });

  // ⭐ Si viene roundId en la URL, lo dejamos seleccionado
  if(urlRoundId){
    sel.value = urlRoundId;
  }
}


// ===== REFRESH =====
async function refreshAll(){

  await loadEnrolledTable();
  await loadEnrollDrivers();
  await loadEnrollKarts();
}

// ===== DRIVERS =====
async function loadEnrollDrivers(){

  const roundId=$("enrollRoundSelect")?.value;
  const categoryCode=$("enrollCategorySelect")?.value||"";
  const driverSelect=$("enrollDriverSelect");
  if(!driverSelect) return;

  const drivers=await getDrivers();

  let already=[];

  if(categoryCode && roundId){
    const rows=await apiGet(
      `/championships/${champId}/rounds/${roundId}/participants?cat=${encodeURIComponent(categoryCode)}`
    );
    already=rows.map(r=>String(r.racecontrol_driver_id));
  }

  driverSelect.innerHTML=`<option value="">-- Selecciona piloto --</option>`;

  const codeN=normKey(categoryCode);

  drivers.forEach(d=>{

    const skillN=normKey(d.skill??d.skill_name??"");

    if(categoryCode && skillN!==codeN) return;
    if(already.includes(String(d.id))) return;

    const opt=document.createElement("option");
    opt.value=d.id;
    opt.textContent=d.name;
    driverSelect.appendChild(opt);

  });

  applyDriverSearchFilter();
}

// ===== KARTS =====
async function loadEnrollKarts(){

  const roundId=$("enrollRoundSelect")?.value;
  const cat=$("enrollCategorySelect")?.value||"";
  const sel=$("enrollKartSelect");
  if(!sel) return;

  const all=await getKarts();

  sel.innerHTML=`<option value="">-- Sin kart --</option>`;

  if(!cat){
    all.forEach(k=>{
      sel.innerHTML+=`<option value="${k.id}">Kart ${k.number}</option>`;
    });
    return;
  }

  let used=[];
  if(roundId){
    const rows=await apiGet(
      `/championships/${champId}/rounds/${roundId}/participants?cat=${encodeURIComponent(cat)}`
    );
    used=rows.map(r=>Number(r.kart_id)).filter(Boolean);
  }

  all.forEach(k=>{
    if(!used.includes(Number(k.id))){
      sel.innerHTML+=`<option value="${k.id}">Kart ${k.number}</option>`;
    }
  });
}

// ===== ENROLL =====
async function enrollDriverToRoundCategory(){

  const roundId=$("enrollRoundSelect")?.value;
  const cat=$("enrollCategorySelect")?.value||"";

  const driverId=Number($("enrollDriverSelect")?.value);
  if(!roundId) return alert("Selecciona prueba");
  if(!driverId) return alert("Selecciona piloto");

  const kartId=$("enrollKartSelect")?.value
    ?Number($("enrollKartSelect").value)
    :null;

  await apiSend(
    `/championships/${champId}/rounds/${roundId}/enroll`,
    "POST",
    {
      category:cat||"LIBRE",
      racecontrol_driver_id:driverId,
      kart_id:kartId
    }
  );

  alert("Piloto inscrito");
  await refreshAll();
}

// ===== TABLA =====
async function loadEnrolledTable(){

  const roundId=$("enrollRoundSelect")?.value;
  const cat=$("enrollCategorySelect")?.value||"";
  const tbody=$("enrolledBody");
  if(!tbody) return;

  if(!roundId){
    tbody.innerHTML=`<tr><td colspan="6">Selecciona prueba</td></tr>`;
    return;
  }

  const rows=await apiGet(
    cat
    ?`/championships/${champId}/rounds/${roundId}/participants?cat=${encodeURIComponent(cat)}`
    :`/championships/${champId}/rounds/${roundId}/participants`
  );

  if(!rows.length){
    tbody.innerHTML=`<tr><td colspan="6">No hay inscritos</td></tr>`;
    return;
  }

  tbody.innerHTML="";

  rows.forEach(p=>{

    tbody.innerHTML+=`
<tr>
<td>${p.name}</td>
<td>${p.category}</td>
<td>${p.weight??"—"} kg</td>
<td>${p.kart_transponder??p.driver_transponder??"—"}</td>
<td>${p.kart_number?`Kart ${p.kart_number}`:"—"}</td>

<td>
<button class="orange" onclick="openDriverModal(${p.racecontrol_driver_id})">✏️</button>
<button class="ghost" onclick="openKartModal(${p.id},'${p.category}')">🔄</button>
<button class="red" onclick="deleteEnrollment(${p.id})">🗑</button>
</td>
</tr>`;
  });
}

// ===== DELETE =====
async function deleteEnrollment(id){
  if(!confirm("¿Borrar piloto?")) return;
  await apiSend(`/championships/${champId}/rounds/enroll/${id}`,"DELETE");
  await refreshAll();
}

// ===== BUSCADOR =====
function bindDriverSearch(){
  $("driverSearch")?.addEventListener("input",applyDriverSearchFilter);
}

function applyDriverSearchFilter(){

  const q=$("driverSearch")?.value?.toLowerCase()||"";
  const sel=$("enrollDriverSelect");
  if(!sel) return;

  [...sel.options].forEach(o=>{
    if(!o.value) return;
    o.style.display=o.textContent.toLowerCase().includes(q)?"":"none";
  });
}

window.createSessionAndSync = async function(){

  const roundId = $("enrollRoundSelect")?.value;
  if(!roundId) return alert("Selecciona prueba");

  // Si quieres permitir que el usuario elija el nombre visible en la UI,
  // puedes añadir un input y leerlo aquí.
  const visibleName = "Libres";

  const r = await apiSend(
    `/championships/${champId}/rounds/${roundId}/sessions/create-and-sync`,
    "POST",
    {
      category: "LIBRE",
      visibleName,        // ✅ requerido por backend
      event_name: visibleName
    }
  );

  alert("Sesión creada ✔");
};















