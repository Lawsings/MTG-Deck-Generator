// src/utils/manabase.js
import { suggestBasicLands } from "./lands";
import { namedExact as sfNamedExact } from "../api/scryfall";

// Helpers couleurs
const CI = (ci) => (ci || "").toUpperCase().split("").filter(c => "WUBRG".includes(c));
const has = (ci, ...need) => {
  const set = new Set(CI(ci));
  return need.every(n => set.has(n));
};

// Catalogue de staples "safe" (légaux en EDH, fixent bien, pas trop exotiques)
const STAPLES = [
  { name:"Command Tower", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Path of Ancestry", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Exotic Orchard", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Terramorphic Expanse", type_line:"Land", cond: ci => CI(ci).length >= 2 },
  { name:"Evolving Wilds", type_line:"Land", cond: ci => CI(ci).length >= 2 },

  // Gates bi-colores (communs et très abordables en général)
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

  // Mono-couleurs utiles (souvent peu chères)
  { name:"Bojuka Bog", type_line:"Land", cond: ci => has(ci,"B") },
  { name:"Kabira Crossroads", type_line:"Land", cond: ci => has(ci,"W") },
  { name:"Halimar Depths", type_line:"Land", cond: ci => has(ci,"U") },
  { name:"Teetering Peaks", type_line:"Land", cond: ci => has(ci,"R") },
  { name:"Tranquil Thicket", type_line:"Land", cond: ci => has(ci,"G") },

  // Incolore passe-partout
  { name:"Rogue's Passage", type_line:"Land", cond: ci => CI(ci).length >= 2 },
];

function norm(cardOrLite){
  // Si on reçoit déjà un objet “lite” {name,type_line}, on le normalise direct
  if (!cardOrLite || !cardOrLite.name) return null;
  return {
    name: cardOrLite.name,
    type_line: cardOrLite.type_line || "Land",
    cmc: 0,
    oracle_en: "",
  };
}

function eurPriceOf(sfCard){
  const p = sfCard?.prices || {};
  const n = Number(p.eur) || Number(p.eur_foil) || 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Construit la manabase:
 * - essaie d'ajouter des non-basiques compatibles et ≤ budget (si deckBudget>0)
 * - limite les non-basiques à ~40% de la base
 * - complète avec des basiques selon identité de couleur
 *
 * @param {string} ci - "WUBRG" (ou vide)
 * @param {number} totalLands - ex 36
 * @param {number} deckBudget - budget €/carte (si 0 → ignore le prix)
 */
export async function buildManabase(ci, totalLands, deckBudget = 0){
  const N = Math.max(0, Math.floor(totalLands || 36));
  const maxStaples = Math.floor(N * 0.4);

  // 1) Filtrer les staples compatibles avec l'identité
  const candidates = STAPLES.filter(s => s.cond(ci)).slice(0, 50);

  let picks = [];
  if (deckBudget > 0) {
    // 2) Vérifier le prix des candidats via Scryfall (named exact)
    //    On prend les ≤ deckBudget, puis on coupe à maxStaples
    for (const s of candidates) {
      try {
        const sfCard = await sfNamedExact(s.name);
        const price = eurPriceOf(sfCard);
        if (price <= deckBudget) {
          picks.push(norm(s));
          if (picks.length >= maxStaples) break;
        }
      } catch {
        // en cas d'échec réseau, on ignore ce staple
      }
    }
  } else {
    // Pas de contrainte de prix → on prend les premiers jusqu'à la limite
    picks = candidates.slice(0, maxStaples).map(norm).filter(Boolean);
  }

  // 3) Compléter avec des basiques
  const basicsNeeded = Math.max(0, N - picks.length);
  const basics = suggestBasicLands(ci, basicsNeeded).map(norm).filter(Boolean);

  return [...picks, ...basics];
}
