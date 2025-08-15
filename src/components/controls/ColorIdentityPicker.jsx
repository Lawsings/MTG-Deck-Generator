import { useMemo } from "react";

const COLORS = ["W","U","B","R","G"]; // on laisse C (incolore) à part si besoin
const LABEL = { W:"Blanc", U:"Bleu", B:"Noir", R:"Rouge", G:"Vert" };

function ciMask(s){ return s.split("").filter(Boolean).sort().join(""); }

export default function ColorIdentityPicker({ value, onChange }) {
  const selected = useMemo(() => new Set((value||"").toUpperCase().split("")), [value]);

  function toggle(c){
    const next = new Set(selected);
    if(next.has(c)) next.delete(c); else next.add(c);
    onChange(ciMask(Array.from(next).join("")));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => toggle(c)}
          className={`ci-btn ${selected.has(c) ? "selected" : ""}`}
          aria-pressed={selected.has(c)}
          title={LABEL[c]}
        >
          {c}
        </button>
      ))}
      {/* Bouton reset */}
      <button type="button" className="ci-btn" onClick={() => onChange("")} title="Aucune contrainte">
        ✕
      </button>
    </div>
  );
}
