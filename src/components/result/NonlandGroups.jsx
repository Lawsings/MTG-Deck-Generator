import React from "react";
import { primaryTypeLabel } from "../../utils/cards";
import ManaCost from "../cards/ManaCost";

export default function NonlandGroups({ cards, onOpen }){
  const groups = new Map();
  for(const c of cards||[]){
    const k = primaryTypeLabel(c.type_line);
    if(!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const ordered = Array.from(groups.entries());
  return (
    <div className="space-y-5">
      {ordered.map(([label, arr]) => (
        <div key={label}>
          <h4 className="font-semibold mb-2">{label} ({arr.length})</h4>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {arr.map((c)=> (
              <button key={c.name + c.mana_cost} className="text-left rounded-lg p-3 border hover:opacity-90" style={{ background: "var(--bg2)", borderColor: "var(--border)" }} onClick={()=> onOpen?.(c)}>
                <div className="font-medium mb-1 truncate">{c.name}</div>
                {c.mana_cost && <div className="text-xs"><ManaCost cost={c.mana_cost}/></div>}
                <div className="text-[11px] opacity-80 truncate">{c.type_line}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
