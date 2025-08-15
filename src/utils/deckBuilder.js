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

// --- Lexique simple: mécanique -> mots à chercher dans oracle_text
const MECH_KEYWORDS = {
  blink: ["flicker", "exile target creature then return", "flickered", "enters the battlefield"],
  treasure: ["treasure", "create a treasure"],
  sacrifice: ["sacrifice ", "sacrifice a"],
  lifegain: ["you gain", "lifelink", "gain life"],
  tokens: ["create a 1/1", "create a token", "create x"],
  reanimation: ["return target creature card from your graveyard", "reanimate", "return from your graveyard"],
};

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
    // Ajout de game:paper et exclusion des cartes "funny"
    let q = `legal:commander game:paper -is:funny (type:"legendary creature" or (type:planeswalker and o:"can be your commander") or type:background)`;
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
  // Ajout de game:paper et -is:funny pour la qualité du pool
  const baseQ = `-type:land legal:commander game:paper -is:funny ${baseFilter}`.trim();
  const res = await sfSearch(`${baseQ} order:edhrec unique:prints`);
  let poolRaw = (res?.data || []).filter(isCommanderLegal);

  // Si le pool est trop réduit, relancer une recherche moins restrictive
  const MIN_POOL_SIZE = 70;
  if (poolRaw.length < MIN_POOL_SIZE) {
    progress(25, "Pool insuffisant, élargissement de la recherche…");
    const resFallback = await sfSearch(`${baseQ} order:edhrec`);
    const extra = (resFallback?.data || []).filter(isCommanderLegal);
    const seen = new Set(poolRaw.map(c => c.id));
    for (const c of extra) {
      if (!seen.has(c.id)) {
        poolRaw.push(c);
        seen.add(c.id);
      }
    }
  }

  // 3) Scoring et synergie (EDHREC / Owned / Budget / Mécaniques)
  progress(35, "Filtrage par poids et mécaniques…");
  const mechSet = new Set((mechanics || []).map((m) => String(m || "").toLowerCase()));

  function passMechanics(_c) {
    // Pas de filtre dur pour ne pas rater des cartes utiles : on score avec synergyBonus.
    return true;
  }

  // Bonus de synergie (0..0.4)
  function synergyBonus(c) {
    if (!mechSet.size) return 0;
    const t = (c.oracle_text || "").toLowerCase();
    let hits = 0;
    for (const mech of mechSet) {
      const list = MECH_KEYWORDS[mech] || [];
      for (const kw of list) {
        if (t.includes(kw)) { hits++; break; }
      }
    }
    return Math.min(0.4, hits * 0.1);
  }

  function scoreOf(c) {
    const edhRank = Number(c.edhrec_rank || 100000);
    const edh = 1 - Math.min(100000, edhRank) / 100000; // 0..1
    const have = ownedMap.get((c.name || "").toLowerCase()) > 0 ? 1 : 0; // 0/1
    const price = priceEUR(c);
    const budgetOk = deckBudget <= 0 ? 1 : price <= deckBudget ? 1 : 0.3;
    const syn = synergyBonus(c); // 0..0.4
    return (edhrecWeight / 100) * edh + (ownedWeight / 100) * have + 0.2 * budgetOk + syn;
  }

  const pool = poolRaw.filter(passMechanics).sort((a, b) => scoreOf(b) - scoreOf(a));

  // 4) Équilibrage par rôles + courbe de mana
  progress(55, "Équilibrage ramp/draw/removal/wraths…");

  const want = {
    ramp: targets.ramp?.[0] ?? 8,
    draw: targets.draw?.[0] ?? 6,
    removal: targets.removal?.[0] ?? 6,
    wraths: targets.wraths?.[0] ?? 2,
  };
  const have = { ramp: 0, draw: 0, removal: 0, wraths: 0 };

  // --- Cible de courbe ---
  const curveTarget = { low: 12, mid: 10, high: 8 };
  const curveHave = { low: 0, mid: 0, high: 0 };
  function curveBucket(cmc) {
    if (cmc <= 2) return "low";
    if (cmc <= 4) return "mid";
    return "high";
  }

  const pick = [];
  const seen = new Set();
  const keyOf = (c) => (c.name || "") + ":" + (c.mana_cost || "");

  // 4.1 Satisfaire les minima rôle par rôle
  for (const c of pool) {
    if (pick.length >= 30) break;
    const r = roleOf(c);
    if (r !== "other" && have[r] < want[r]) {
      const k = keyOf(c);
      if (seen.has(k)) continue;

      // Budget guard strict pour les minima (éviter outliers)
      const price = priceEUR(c);
      if (deckBudget > 0 && price > deckBudget * 2) continue;

      pick.push(c);
      seen.add(k);
      have[r]++;

      const b = curveBucket(Number(c.cmc) || 0);
      curveHave[b] = (curveHave[b] || 0) + 1;
    }
  }

  // 4.2 Compléter jusqu'à 30 avec préférence pour combler la courbe
  for (const c of pool) {
    if (pick.length >= 30) break;
    const k = keyOf(c);
    if (seen.has(k)) continue;

    const price = priceEUR(c);
    if (deckBudget > 0 && price > deckBudget * 1.5) continue;

    const b = curveBucket(Number(c.cmc) || 0);
    // Si ce bucket est déjà au-dessus de sa cible ET qu'un autre est en retard, on préfère l'autre
    if (curveHave[b] >= curveTarget[b]) {
      if ((curveHave.low < curveTarget.low) || (curveHave.mid < curveTarget.mid) || (curveHave.high < curveTarget.high)) {
        continue;
      }
    }

    pick.push(c);
    seen.add(k);
    curveHave[b] = (curveHave[b] || 0) + 1;
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

  // 7) Compléter jusqu’à 99 cartes (hors commandant)
  let nonlandsFinal = [...nonlands];
  let landsFinal = [...lands];

  // Utilitaires
  const needCount = () => 99 - (nonlandsFinal.length + landsFinal.length);
  const alreadyPicked = new Set(nonlandsFinal.map(c => (c.name || "") + ":" + (c.mana_cost || "")));

  // 7.1 Compléter avec des sorts low/mid CMC depuis le pool restant (sous budget)
  let deficit = needCount();
  if (deficit > 0) {
    const remainder = [];
    for (const c of pool) {
      const k = (c.name || "") + ":" + (c.mana_cost || "");
      if (alreadyPicked.has(k)) continue;
      // garde-fou budget doux
      const price = priceEUR(c);
      if (deckBudget > 0 && price > deckBudget * 1.2) continue;
      remainder.push(c);
    }
    // priorité aux low → mid → high
    const low = remainder.filter(c => (Number(c.cmc) || 0) <= 2);
    const mid = remainder.filter(c => (Number(c.cmc) || 0) >= 3 && (Number(c.cmc) || 0) <= 4);
    const high = remainder.filter(c => (Number(c.cmc) || 0) >= 5);
    const prioritized = [...low, ...mid, ...high];

    for (const c of prioritized) {
      if (deficit <= 0) break;
      const k = (c.name || "") + ":" + (c.mana_cost || "");
      if (alreadyPicked.has(k)) continue;
      nonlandsFinal.push(bundleCard(c));
      alreadyPicked.add(k);
      deficit = needCount();
    }
  }

  // 7.2 S’il manque encore, ajouter des basiques
  if (needCount() > 0) {
    // import dynamique pour éviter un import circulaire ou alourdir le bundle
    const { suggestBasicLands } = await import("./lands");
    const basicsNeeded = needCount();
    const basics = suggestBasicLands(commanderCI, basicsNeeded).map(b => ({
      name: b.name,
      type_line: b.type_line || "Land",
      cmc: 0,
      oracle_en: "",
    }));
    landsFinal = [...landsFinal, ...basics].slice(0, 99 - nonlandsFinal.length); // clamp au cas où
  }

  // 8) Done
  progress(100, "Terminé !");
  await sleep(100); // petite pause pour l’UX

  return {
    deck: { commander: bundleCard(commanderCard), nonlands: nonlandsFinal, lands: landsFinal },
    counts,
  };
}
