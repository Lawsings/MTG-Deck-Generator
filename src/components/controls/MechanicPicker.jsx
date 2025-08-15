import React, { useMemo } from "react";

export default function MechanicPicker({ tags = [], value = [], max = 3, onChange }) {
  const selected = useMemo(() => new Set(value), [value]);
  function toggle(tag) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag); else next.add(tag);
    const arr = Array.from(next);
    if (arr.length > max) return; // hard limit
    onChange(arr);
  }
  return (
    <div>
      <div className="text-sm muted mb-1">Mécaniques (max {max})</div>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => toggle(t)}
            className={`px-3 py-1 rounded-full border text-sm ${selected.has(t) ? 'selected-chip' : 'chip'}`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="text-xs muted mt-1">Sélectionnées : {value.join(', ') || 'Aucune'}</div>
    </div>
  );
}
