import React from "react";

function Bar({ label, value, min, max }){
  const clamped = Math.max(0, Math.min(100, Math.round(((value - min) / Math.max(1, (max - min))) * 100)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="opacity-70">{value}</span>
      </div>
      <div className="h-2 rounded-full border overflow-hidden" style={{borderColor:'var(--border)'}}>
        <div className="h-full" style={{ width: clamped + '%', background:'var(--text)' }} />
      </div>
      <div className="text-[11px] opacity-60">Cible : {min}–{max}</div>
    </div>
  );
}

export default function BalanceIndicators({ counts, targets }){
  const t = targets || { ramp:[8,12], draw:[6,10], removal:[6,10], wraths:[2,4] };
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Bar label="Ramp" value={counts.ramp||0} min={t.ramp[0]} max={t.ramp[1]} />
      <Bar label="Pioche" value={counts.draw||0} min={t.draw[0]} max={t.draw[1]} />
      <Bar label="Anti-permanents" value={counts.removal||0} min={t.removal[0]} max={t.removal[1]} />
      <Bar label="Wraths" value={counts.wraths||0} min={t.wraths[0]} max={t.wraths[1]} />
    </div>
  );
}
