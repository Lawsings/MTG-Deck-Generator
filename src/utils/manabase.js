// src/utils/manabase.js
import { suggestBasicLands } from "./lands";

// Petits helpers
const CI = (ci) => (ci || "").toUpperCase().split("").filter(c => "WUBRG".includes(c));
const has = (ci, ...need) => {
  const set = new Set(CI(ci));
  return need.every(n => set.has(n));
};

// Catalogue minimal de staples (sans fetch)
// On n'ajoute que des terrains légaux en EDH qui fixent bien les couleurs.
// NB: On ne met pas de prix ici; si tu veux filtrer par budget, fais-le en amont.
const STAPLES = [
  { name:"Command Tower", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Path of Ancestry", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Exotic Orchard", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Terramorphic Expanse", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Evolving Wilds", type_line:"Land", cond: ci => CI(ci).length >= 2 },

  // Bicolores communes (filtrées par couleurs)
  { name:"Azorius Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"W","U") },
  { name:"Dimir Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"U","B") },
  { name:"Rakdos Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"B","R") },
  { name:"Gruul Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"R","G") },
  { name:"Selesnya Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"G","W") },
  { name:"Orzhov Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"W","B") },
  { name:"Izzet Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"U","R") },
  { name:"Golgari Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"B","G") },
  { name:"Boros Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"W","R") },
  { name:"Simic Guildgate", type_line:"Land — Gate", cond: ci => has(ci,"U","G") },

  // Monocolores utiles
  { name:"Kabira Crossroads", type_line:"Land", cond: ci => has(ci,"W") },
  { name:"Halimar Depths", type_line:"Land", cond: ci => has(ci,"U") },
  { name:"Bojuka Bog", type_line:"Land", cond: ci => has(ci,"B") },
  { name:"Teetering Peaks", type_line:"Land", cond: ci => has(ci,"R") },
  { name:"Tranquil Thicket", type_line:"Land", cond: ci => has(ci,"G") },

  // Incolore ok partout
  { name:"Rogue's Passage", type_line:"Land", cond: ci => CI(ci).length >= 2 },
];

// Répartition simple des couleurs pour les basiques
function weights(ci){
  const colors = CI(ci);
  if (!colors.length) return {};
  const w = {}; const eq = 1 / colors.length;
  for (const c of colors) w[c] = eq;
  return w;
}

export function buildManabase(ci, totalLands){
  const N = Math.max(0, Math.floor(totalLands||36));

  // 1) Propose des staples compatibles (max ~40% des terrains)
  const maxStaples = Math.floor(N * 0.4);
  const staples = STAPLES.filter(s => s.cond(ci)).slice(0, maxStaples);

  // 2) Complète avec des basiques selon la CI
  const basicsNeeded = Math.max(0, N - staples.length);
  const basics = suggestBasicLands(ci, basicsNeeded);

  // Formate comme les autres cartes (bundle-like minimal)
  const norm = (c) => ({ name: c.name, type_line: c.type_line, cmc: 0, oracle_en: "" });

  return [
    ...staples.map(norm),
    ...basics.map(norm),
  ];
}
