import React from "react";

export default function TargetsEditor({ targets, onChange }) {
  const t = targets || { ramp:[8,12], draw:[6,10], removal:[6,10], wraths:[2,4] };
  function setPair(key, which, val){
    const v = Math.max(0, Number(val) || 0);
    const next = { ...t, [key]: [...t[key]] };
    next[key][which] = v;
    onChange(next);
  }
  const Field = ({label, k}) => (
    <div className="field">
      <div className="text-sm mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <input type="number" className="input w-24" value={t[k][0]} min={0} onChange={(e)=>setPair(k,0,e.target.value)} />
        <span className="opacity-60">à</span>
        <input type="number" className="input w-24" value={t[k][1]} min={t[k][0]} onChange={(e)=>setPair(k,1,e.target.value)} />
      </div>
    </div>
  );
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label="Ramp" k="ramp" />
      <Field label="Pioche" k="draw" />
      <Field label="Anti-bêtes / anti-permanents" k="removal" />
      <Field label="Wraths" k="wraths" />
    </div>
  );
}
