export async function parseCollectionFile(file){
  const text=await file.text(); const ext=(file.name.split('.').pop()||'').toLowerCase(); const rows=[];
  if(ext==="json"){ try{ const data=JSON.parse(text); if(Array.isArray(data)) for(const it of data){ if(it?.name) rows.push({name:String(it.name).trim(), qty:Number(it.quantity||it.qty||1)||1}); } }catch{} }
  else if(["csv","tsv","tab"].includes(ext)){
    const lines=text.split(/\r?\n/).filter(Boolean); const [h0,...rest]=lines; const headers=h0.toLowerCase().split(/,|\t|;/).map(s=>s.trim()); const hasHeader=headers.includes('name'); const dataLines=hasHeader?rest:lines;
    for(const line of dataLines){ const cols=line.split(/,|\t|;/).map(s=>s.trim()); let name="", qty=1; if(hasHeader){ const obj=Object.fromEntries(cols.map((v,i)=>[headers[i]||`c${i}`,v])); name=obj.name||obj.card||""; qty=Number(obj.count||obj.qty||obj.quantity||1)||1; } else { const [a,b]=cols; if(/^\d+$/.test(a)){ qty=Number(a); name=b; } else if(/^\d+$/.test(b)){ qty=Number(b); name=a; } else { name=line.trim(); qty=1; } } if(name) rows.push({name,qty}); }
  }
  else {
    for(const line of text.split(/\r?\n/)){ const m=line.match(/^\s*(\d+)\s+(.+?)\s*$/); if(m) rows.push({name:m[2].trim(), qty:Number(m[1])}); else if(line.trim()) rows.push({name:line.trim(), qty:1}); }
  }
  const map=new Map(); for(const {name,qty} of rows){ const k=name.toLowerCase(); map.set(k,(map.get(k)||0)+qty); }
  return map;
}

export function mergeOwnedFiles(files){
  const merged=new Map();
  for(const file of files){ for(const [k,q] of file.map){ merged.set(k,(merged.get(k)||0)+q); } }
  return merged;
}
