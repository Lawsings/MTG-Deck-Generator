import { useEffect, useRef, useState } from "react";
import { search as sfSearch } from "../../api/scryfall";

const distinctBy = (keyFn)=> (arr)=>{ const s=new Set(); return arr.filter(x=>{ const k=keyFn(x); if(s.has(k)) return false; s.add(k); return true;}); };
const distinctByOracle = distinctBy((c)=> c?.oracle_id||c?.id||c?.name||"");

async function searchCommandersAnyLang(q){
  const base = `legal:commander (type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background) name:${q}`;
  const [en, fr] = await Promise.all([
    sfSearch(`${base} unique:prints order:edhrec`),
    sfSearch(`${base} lang:fr unique:prints order:edhrec`)
  ]);
  const pool = distinctByOracle([...(en.data||[]), ...(fr.data||[])]).slice(0, 20);
  return pool.map(card=>({
    id: card.id, oracle_id: card.oracle_id,
    display: card.printed_name || card.name, canonical: card.name, type_line: card.type_line,
    image: card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || card.card_faces?.[1]?.image_uris?.small || "",
    raw: card,
  }));
}

export default function CommanderAutocomplete({ value, onSelect }){
  const [query,setQuery]=useState(value||"");
  const [sugs,setSugs]=useState([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const boxRef = useRef(null);

  useEffect(()=>{ function onDoc(e){ if(boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);} document.addEventListener('mousedown', onDoc); return ()=>document.removeEventListener('mousedown', onDoc); },[]);

  useEffect(()=>{
    const q=query.trim(); if(q.length<2){ setSugs([]); setOpen(false); return; }
    const run=async()=>{ setLoading(true); try{ const items=await searchCommandersAnyLang(q); setSugs(items); setOpen(true);}catch(e){ setSugs([]); setOpen(false);} finally{ setLoading(false);} };
    const t=setTimeout(run,220); return ()=>clearTimeout(t);
  },[query]);

  return (
    <div className="relative" ref={boxRef}>
      <label className="block mb-1 text-sm muted">Commandant (FR ou EN)</label>
      <input className="w-full input focus:outline-none focus:ring-2 focus:ring-white/50" placeholder="Ex: Etali, tempête primordiale / Etali, Primal Storm" value={query} onChange={e=>{setQuery(e.target.value); setOpen(true);}}/>
      {open && (
        <div className="absolute z-20 mt-2 w-full list shadow-2xl autocomplete-list">
          {loading && <div className="px-3 py-2 text-sm muted">Recherche…</div>}
          {!loading && sugs.length===0 && <div className="px-3 py-2 text-sm muted">Aucun commandant trouvé</div>}
          {!loading && sugs.map(s=> (
            <button key={s.id} className="w-full text-left px-3 py-2 list-item flex items-center gap-3" onClick={()=>{ onSelect(s.display); setQuery(s.display); setOpen(false); }}>
              {s.image ? (<img src={s.image} alt="" className="w-10 h-14 object-cover rounded"/>) : (<div className="w-10 h-14 glass-strong"/>) }
              <div>
                <div>{s.display}</div>
                <div className="text-[11px] muted">{s.type_line}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
