const API = (window.API_BASE || `${location.origin}/api`);
const qs = (s, r=document)=>r.querySelector(s);
const qsa = (s, r=document)=>Array.from(r.querySelectorAll(s));

async function apiGet(path, fallback=null){
  try{
    const res = await fetch(`${API}${path}`);
    if(!res.ok) throw new Error(`${res.status} ${path}`);
    return await res.json();
  }catch(e){
    console.error("GET", path, e);
    return fallback;
  }
}

async function apiSend(path, method="POST", body=null){
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {"Content-Type":"application/json"},
    body: body ? JSON.stringify(body) : null
  });
  if(!res.ok) throw new Error(await res.text());
  return await res.json();
}

function fmtDate(v){
  if(!v) return "-";
  try{ return new Date(v).toLocaleString(); }catch{ return "-"; }
}