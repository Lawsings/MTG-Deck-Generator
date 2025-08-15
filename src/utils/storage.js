// src/utils/storage.js
const SKEY = "ccraft:v1";
export function saveState(partial){
  try{
    const prev = JSON.parse(localStorage.getItem(SKEY) || "{}");
    localStorage.setItem(SKEY, JSON.stringify({ ...prev, ...partial }));
  }catch{}
}
export function loadState(){
  try{ return JSON.parse(localStorage.getItem(SKEY) || "{}"); }catch{ return {}; }
}
