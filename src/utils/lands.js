// src/utils/lands.js
const BASICS = {
  W: { name: "Plains", type_line: "Basic Land — Plains" },
  U: { name: "Island", type_line: "Basic Land — Island" },
  B: { name: "Swamp", type_line: "Basic Land — Swamp" },
  R: { name: "Mountain", type_line: "Basic Land — Mountain" },
  G: { name: "Forest", type_line: "Basic Land — Forest" },
};

function ciToWeights(ci) {
  const colors = (ci || "").toUpperCase().split("").filter(x => "WUBRG".includes(x));
  if (colors.length === 0) return { C: 1 }; // incolore → aucun basic
  const w = {};
  const eq = 1 / colors.length;
  for (const c of colors) w[c] = eq;
  return w;
}

export function suggestBasicLands(ci, totalLands) {
  const n = Math.max(0, Math.floor(totalLands));
  const w = ciToWeights(ci);
  const entries = Object.entries(w).filter(([c]) => BASICS[c]);
  if (entries.length === 0) return []; // ex: incolore, on laisse vide ici

  // distribution arrondie
  let remain = n;
  const res = [];
  for (let i = 0; i < entries.length; i++) {
    const [c, weight] = entries[i];
    const count = i === entries.length - 1 ? remain : Math.round(n * weight);
    remain -= count;
    for (let k = 0; k < count; k++) {
      res.push(BASICS[c]);
    }
  }
  return res;
}
