import React from "react";

export default function LandsGrid({ lands }){
  const arr = lands||[];
  if(!arr.length) return <div className="text-sm opacity-70">Aucun terrain (démo). Nous lierons le calcul aux sliders à l’étape suivante.</div>;
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {arr.map((c)=> (
        <div key={c.name} className="rounded-lg p-3 border" style={{ background: "var(--bg2)", borderColor: "var(--border)" }}>
          <div className="font-medium mb-1 truncate">{c.name}</div>
          <div className="text-[11px] opacity-80 truncate">{c.type_line}</div>
        </div>
      ))}
    </div>
  );
}
