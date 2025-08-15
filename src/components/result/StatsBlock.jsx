import React, { useMemo } from "react";

export default function StatsBlock({ deck, ownedMap }){
  const { counts, avgCmc, ownedCount, total } = useMemo(()=>{
    const nonlands = deck?.nonlands||[];
    const lands = deck?.lands||[];
    const all = [...nonlands, ...lands];
    const total = all.length;
    let cmcSum = 0; let own = 0;
    let ramp=0, draw=0, removal=0, wraths=0;
    for(const c of all){
      cmcSum += Number(c.cmc||0);
      const k = (c.name||"").toLowerCase();
      if(ownedMap && ownedMap.get(k)>0) own++;
      const text = (c.oracle_en||"").toLowerCase();
      if(/add [wubrgc]/.test(text) || /search your library.*land/.test(text)) ramp++;
      if(/draw .* card/.test(text)) draw++;
      if(/destroy target|exile target|counter target/.test(text)) removal++;
      if(/destroy all .*creature|wrath|damnation|farewell|supreme verdict/.test(text)) wraths++;
    }
    const avgCmc = total? (cmcSum/total) : 0;
    return { counts:{ramp,draw,removal,wraths}, avgCmc, ownedCount:own, total };
  }, [deck, ownedMap]);

  const ownedPct = total? Math.round((ownedCount/total)*100) : 0;

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="stat"><div className="stat-label">Cartes possédées</div><div className="stat-value">{ownedCount}/{total} ({ownedPct}%)</div></div>
      <div className="stat"><div className="stat-label">CMC moyenne</div><div className="stat-value">{avgCmc.toFixed(2)}</div></div>
      <div className="stat"><div className="stat-label">Sorts non-terrains</div><div className="stat-value">{(deck?.nonlands||[]).length}</div></div>
      <div className="stat"><div className="stat-label">Terrains</div><div className="stat-value">{(deck?.lands||[]).length}</div></div>
    </div>
  );
}
