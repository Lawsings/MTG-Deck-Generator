// src/utils/deckBuilder.js
import { search as sfSearch, random as sfRandom, namedExact as sfNamedExact } from "../api/scryfall";
import {
  identityToQuery,
  isCommanderLegal,
  getCI,
  bundleCard,
  roleOf,
  priceEUR,
} from "./cards";
import { buildManabase } from "./manabase";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Génère un deck Commander.
 * @param {Object} opts
 *  - commanderMode: "select" | "random"
 *  - chosenCommander: string
 *  - desiredCI: string (ex "WRG")
 *  - mechanics: string[]
 *  - edhrecWeight: number (0..100)
 *  - ownedWeight: number (0..100)
 *  - deckBudget: number (€/carte)
 *  - targetLands: number
 *  - targets: { ramp:[min,max], draw:[min,max], removal:[min,max], wraths:[min,max] }
 *  - ownedMap: Map<string, number>
 *  - progress: (p:number, msg?:string)=>void
 *
 * @returns {Promise<{ deck:{ commander:any, nonlands:any[], lands:any[] }, counts:any }>}
 */
export async function generate(opts) {
  const {
    commanderMode = "select",
    chosenCommander = "",
    desiredCI = "",
    mechanics = [],
    edhrecWeight = 60,
    ownedWeight = 40,
    deckBudget = 200,
    targetLands = 36,
    targets = { ramp: [8, 12], draw: [6, 10], removal: [6, 10], wraths: [2, 4] },
    ownedMap = new Map(),
    progress = () => {},
  } = opts || {};

  progress(5, "Recherche du commandant…");

  // 1) Résoudre le commandant
  let commanderCard;
  if (commanderMode === "select" && chosenCommander) {
    commanderCard = await sfNamedExact(chosenCommander);
  } else {
    let q = `legal:commander (type:\\\"legendary creature\\\" or (type:planeswalker and o:\\\"can be your commander\\\") or type:background)`;
    if (desiredCI && desiredCI.length > 0) {
      q += ` ${identityToQuery(desiredCI)}`; // id<=WUBRG si fourni
    }
    commanderCard = await sfRandom(q);
  }
  if (!commanderCard || !isCommanderLegal(commanderCard)) {
    throw new Error("Aucun commandant valide trouvé.");
  }

  const commanderCI = getCI(commanderCard);

  // 2) Construire le pool de cartes non-terrains
  progress(20, "Création du pool de cartes…");
  const baseFilter = identityToQuery(commanderCI); // "" si incolore
  const baseQ = `-type:land legal:commander ${baseFilter}`.trim();
  const res = await sfSearch(`${baseQ} order:edhrec unique:prints`);
  const poolRaw = (res?.data || []).filter(isCommanderLegal);

  // 3) Scoring et filtrage (EDHREC / Owned / Budget / Mécaniques)
  progress(35, "Filtrage par poids et mécaniques…");
  const mechSet = new Set((mechanics || []).map((m) => String(m || "").toLowerCase()));

  function scoreOf(c) {
    const edhRank = Number(c.edhrec_rank || 100000);
    const edh = 1 - Math.min(100000, edhRank) / 100000; // 0..1
    const have = ownedMap.get((c.name || "").toLowerCase()) > 0 ? 1 : 0; // 0/1
    const price = priceEUR(c);
    const budgetOk = deckBudget <= 0 ? 1 : price <= deckBudget ? 1 : 0.3;
    return (edhrecWeight / 100) * edh + (ownedWeight / 100) * have + 0.2 * budgetOk;
  }

  function passMechanics(c) {
    if (!mechSet.size) return true;
    const t = (c.oracle_text || "").toLowerCase();
    for (const m of mechSet) if (t.includes(m)) return true;
    return false;
  }

  const pool = poolRaw.filter(passMechanics).sort((a, b) => scoreOf(b) - scoreOf(a));

  // 4) Équilibrage par rôles → atteindre minima, puis compléter
  progress(55, "Équilibrage ramp/draw/removal/wraths…");

  const want = {
    ramp: targets.ramp?.[0] ?? 8,
    draw: targets.draw?.[0] ?? 6,
    removal: targets.removal?.[0] ?? 6,
    wraths: targets.wraths?.[0] ?? 2,
  };
  const have = { ramp: 0, draw: 0, removal: 0, wraths: 0 };
  const pick = [];
  const seen = new Set();
  const keyOf = (c) => (c.name || "") + ":" + (c.mana_cost || "");

  // 4.1 Satisfaire les minima
  for (const c of pool) {
    if (pick.length >= 30) break;
    const r = roleOf(c);
    if (r !== "other" && have[r] < want[r]) {
      const k = keyOf(c);
      if (seen.has(k)) continue;
      // Filtre budget strict pour éviter les outliers très chers
      const price = priceEUR(c);
      if (deckBudget > 0 && price > deckBudget * 2) continue;
      pick.push(c);
      seen.add(k);
      have[r]++;
    }
  }

  // 4.2 Compléter jusqu'à 30
  for (const c of pool) {
    if (pick.length >= 30) break;
    const k = keyOf(c);
    if (seen.has(k)) continue;
    const price = priceEUR(c);
    if (deckBudget > 0 && price > deckBudget * 1.5) continue;
    pick.push(c);
    seen.add(k);
  }

  // 5) Bundle + compteurs d’indicateurs
  progress(72, "Mise en forme et statistiques…");
  const nonlands = pick.map(bundleCard);
  const counts = { ramp: 0, draw: 0, removal: 0, wraths: 0 };
  for (const c of nonlands) {
    const r = roleOf(c);
    if (counts[r] != null) counts[r] += 1;
  }

  // 6) Manabase (staples + basiques) sensible au budget
  progress(85, "Construction de la base de terrains…");
  const lands = await buildManabase(commanderCI, Number(targetLands) || 36, Number(deckBudget) || 0);

  // 7) Done
  progress(100, "Terminé !");
  await sleep(100); // petite pause pour l’UX

  return {
    deck: { commander: bundleCard(commanderCard), nonlands, lands },
    counts,
  };
}
