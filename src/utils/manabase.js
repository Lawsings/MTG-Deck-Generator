// src/utils/manabase.js
import { suggestBasicLands } from "./lands";
import { namedExact as sfNamedExact } from "../api/scryfall";

const CI = (ci) => (ci || "").toUpperCase().split("").filter(c => "WUBRG".includes(c));
const has = (ci, ...need) => {
  const set = new Set(CI(ci));
  return need.every(n => set.has(n));
};

// Staples simples et pas chers (on filtrera par budget)
const STAPLES = [
  { name:"Command Tower", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Path of Ancestry", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Exotic Orchard", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Terramorphic Expanse", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Evolving Wilds", type_line:"Land", cond: ci => CI(ci).length >= 2 },

  // Gates bi-color
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

  // Mono utiles
  { name:"Bojuka Bog", type_line:"Land", cond: ci => has(ci,"B") },
  { name:"Kabira Crossroads", type_line:"Land", cond: ci => has(ci,"W") },
  { name:"Halimar Depths", type_line:"Land", cond: ci => has(ci,"U") },
  { name:"Teetering Peaks", type_line:"Land", cond: ci => has(ci,"R") },
  { name:"Tranquil Thicket", type_line:"Land", cond: ci => has(ci,"G") },

  // Incolore utile
  { name:"Rogue's Passage", type_line:"Land", cond: ci => CI(ci).length >= 2 },
];

const norm = (cardOrLite) => {
  if (!cardOrLite || !cardOrLite.name) return null;
  return { name: cardOrLite.name, type_line: cardOrLite.type_line || "Land", cmc: 0, oracle_en: "" };
};
const eurPrice = (sfCard) => {
  const p = sfCard?.prices || {};
  const n = Number(p.eur) || Number(p.eur_foil) || 0;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Construit exactement `totalLands` terrains, avec ≤ 8 non-basiques, filtrés par budget si >0.
 */
export async function buildManabase(ci, totalLands, deckBudget = 0) {
  const N = Math.max(0, Math.floor(totalLands || 36));
  const maxNonBasics = Math.min(8, Math.floor(N * 0.4)); // ≤ 8

  // 1) Candidats compatibles
  const candidates = STAPLES.filter(s => s.cond(ci));

  // 2) Sélection des non-basiques
  const picks = [];
  if (deckBudget > 0) {
    for (const s of candidates) {
      if (picks.length >= maxNonBasics) break;
      try {
        const sf = await sfNamedExact(s.name);
        if (eurPrice(sf) <= deckBudget) picks.push(norm(s));
      } catch {/* ignore */}
    }
  } else {
    for (const s of candidates) {
      if (picks.length >= maxNonBasics) break;
      const n = norm(s); if (n) picks.push(n);
    }
  }

  // 3) Compléter avec des basiques pour atteindre EXACTEMENT N
  const basicsNeeded = Math.max(0, N - picks.length);
  const basics = suggestBasicLands(ci, basicsNeeded).map(norm).filter(Boolean);

  // Retourne exactement N items
  return [...picks, ...basics].slice(0, N);
}
