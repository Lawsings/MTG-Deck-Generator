// src/utils/exports.js

export function toText(deck){
  if(!deck) return "";
  const lines = [];
  if(deck.commander) lines.push(`Commander: ${deck.commander.name}`);
  lines.push("");
  if(deck.nonlands?.length){
    lines.push("Nonlands:");
    for(const c of deck.nonlands) lines.push(`1 ${c.name}`);
    lines.push("");
  }
  if(deck.lands?.length){
    lines.push("Lands:");
    const map = new Map();
    for(const c of deck.lands){
      const k = c.name;
      map.set(k, (map.get(k)||0)+1);
    }
    for(const [name,qty] of map) lines.push(`${qty} ${name}`);
  }
  return lines.join("\n");
}

// Moxfield CSV: columns: Count,Name,Set,Collector Number,Alter,Condition,Language,Foil
export function toMoxfieldCSV(deck){
  const rows = [["Count","Name","Set","Collector Number","Alter","Condition","Language","Foil"]];
  const push = (name, qty=1) => rows.push([String(qty), name, "", "", "", "Near Mint", "English", "No"]);
  if(deck?.commander) push(deck.commander.name, 1);
  for(const c of deck?.nonlands||[]) push(c.name, 1);
  const map = new Map();
  for(const c of deck?.lands||[]) map.set(c.name, (map.get(c.name)||0)+1);
  for(const [name,qty] of map) push(name, qty);
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
}

// Archidekt CSV: columns: Quantity,Card Name,Set Code,Collector Number,Language,Foil
export function toArchidektCSV(deck){
  const rows = [["Quantity","Card Name","Set Code","Collector Number","Language","Foil"]];
  const push = (name, qty=1) => rows.push([String(qty), name, "", "", "en", "false"]);
  if(deck?.commander) push(deck.commander.name, 1);
  for(const c of deck?.nonlands||[]) push(c.name, 1);
  const map = new Map();
  for(const c of deck?.lands||[]) map.set(c.name, (map.get(c.name)||0)+1);
  for(const [name,qty] of map) push(name, qty);
  return rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
}

export function downloadFile(filename, content, mime="text/plain;charset=utf-8"){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
