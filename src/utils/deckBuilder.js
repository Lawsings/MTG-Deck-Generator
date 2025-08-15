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
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

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
    // Filtres qualité pool
    let q = `legal:commander game:paper -is:funny (type:"legendary creature" or (type:planeswalker and o:"can be your commander") or type:background)`;
    if (desiredCI && desiredCI.length > 0) q += ` ${identityToQuery(desiredCI)}`;
    commanderCard = await sfRandom(q);
  }
  if (!commanderCard || !isCommanderLegal(commanderCard)) {
    throw new Error("Aucun commandant valide trouvé.");
  }
  const commanderCI = getCI(commanderCard);

  // 2) Pool non-terrains
  progress(20, "Création du pool de cartes…");
  const baseFilter = identityToQuery(commanderCI); // "" si incolore
  const baseQ = `-type:land legal:commander game:paper -is:funny ${baseFilter}`.trim();
  const res = await sfSearch(`${baseQ} order:edhrec unique:prints`);
  const poolRaw = (res?.data || []).filter(isCommanderLegal);

  // 3) Scoring & synergie
  progress(35, "Filtrage par poids et mécaniques…");
  const mechSet = new Set((mechanics || []).map((m) => String(m || "").toLowerCase()));
  const synergyBonus = (c) => {
    if (!mechSet.size) return 0;
    const t = (c.oracle_text || "").toLowerCase();
    let hits = 0;
    for (const mech of mechSet) {
      const list = MECH_KEYWORDS[mech] || [];
      for (const kw of list) { if (t.includes(kw)) { hits++; break; } }
    }
    return Math.min(0.4, hits * 0.1);
  };
  const scoreOf = (c) => {
    const edhRank = Number(c.edhrec_rank || 100000);
    const edh = 1 - Math.min(100000, edhRank) / 100000;
    const have = ownedMap.get((c.name || "").toLowerCase()) > 0 ? 1 : 0;
    const price = priceEUR(c);
    const budgetOk = deckBudget <= 0 ? 1 : price <= deckBudget ? 1 : 0.3;
    const syn = synergyBonus(c);
    return (edhrecWeight / 100) * edh + (ownedWeight / 100) * have + 0.2 * budgetOk + syn;
  };
  const pool = poolRaw.sort((a, b) => scoreOf(b) - scoreOf(a));

  // 4) Équilibrage par rôles + courbe
  progress(55, "Équilibrage ramp/draw/removal/wraths…");
  const want = {
    ramp: targets.ramp?.[0] ?? 8,
    draw: targets.draw?.[0] ?? 6,
    removal: targets.removal?.[0] ?? 6,
    wraths: targets.wraths?.[0] ?? 2,
  };
  const have = { ramp: 0, draw: 0, removal: 0, wraths: 0 };

  const curveTarget = { low: 12, mid: 10, high: 8 };
  const curveHave = { low: 0, mid: 0, high: 0 };
  const curveBucket = (cmc) => (cmc <= 2 ? "low" : cmc <= 4 ? "mid" : "high");

  const pick = [];
  const seen = new Set();
  const keyOf = (c) => (c.name || "") + ":" + (c.mana_cost || "");

  // Minima par rôle
  for (const c of pool) {
    if (pick.length >= 30) break;
    const r = roleOf(c);
    if (r !== "other" && have[r] < want[r]) {
      const k = keyOf(c);
      if (seen.has(k)) continue;
      const price = priceEUR(c);
      if (deckBudget > 0 && price > deckBudget * 2) continue;
      pick.push(c); seen.add(k); have[r]++;
      const b = curveBucket(Number(c.cmc) || 0); curveHave[b] = (curveHave[b] || 0) + 1;
    }
  }
  // Complément avec préférence courbe
  for (const c of pool) {
    if (pick.length >= 30) break;
    const k = keyOf(c);
    if (seen.has(k)) continue;
    const price = priceEUR(c);
    if (deckBudget > 0 && price > deckBudget * 1.5) continue;
    const b = curveBucket(Number(c.cmc) || 0);
    if (curveHave[b] >= curveTarget[b]) {
      if ((curveHave.low < curveTarget.low) || (curveHave.mid < curveTarget.mid) || (curveHave.high < curveTarget.high)) {
        continue;
      }
    }
    pick.push(c); seen.add(k); curveHave[b] = (curveHave[b] || 0) + 1;
  }

  // 5) Bundle + stats
  progress(72, "Mise en forme et statistiques…");
  const nonlands = pick.map(bundleCard);
  const counts = { ramp: 0, draw: 0, removal: 0, wraths: 0 };
  for (const c of nonlands) { const r = roleOf(c); if (counts[r] != null) counts[r] += 1; }

  // 6) Manabase exacte (terrains)
  progress(85, "Construction de la base de terrains…");
  // 🔒 CLAMP fort ici — impossible d’avoir 94 terrains si on borne à [32..40].
  const TL = clamp(Number(targetLands) || 36, 32, 40);
  const lands = await buildManabase(commanderCI, TL, Number(deckBudget) || 0); // retourne exactement TL lands

  // 7) Ajuster à 99: on complète *uniquement* en sorts
  let nonlandsFinal = [...nonlands];
  const landsFinal = [...lands];
  const desiredNonlands = Math.max(0, 99 - landsFinal.length);

  if (nonlandsFinal.length < desiredNonlands) {
    const alreadyPicked = new Set(nonlandsFinal.map(c => (c.name || "") + ":" + (c.mana_cost || "")));
    const remainder = [];
    for (const c of pool) {
      const k = (c.name || "") + ":" + (c.mana_cost || "");
      if (alreadyPicked.has(k)) continue;
      const price = priceEUR(c);
      if (deckBudget > 0 && price > deckBudget * 1.2) continue;
      remainder.push(c);
    }
    const low  = remainder.filter(c => (Number(c.cmc) || 0) <= 2);
    const mid  = remainder.filter(c => (Number(c.cmc) || 0) >= 3 && (Number(c.cmc) || 0) <= 4);
    const high = remainder.filter(c => (Number(c.cmc) || 0) >= 5);
    const prioritized = [...low, ...mid, ...high];

    for (const c of prioritized) {
      if (nonlandsFinal.length >= desiredNonlands) break;
      const k = (c.name || "") + ":" + (c.mana_cost || "");
      if (alreadyPicked.has(k)) continue;
      nonlandsFinal.push(bundleCard(c));
      alreadyPicked.add(k);
    }
  }

  // 8) Done
  progress(100, "Terminé !");
  await sleep(100);
  return {
    deck: { commander: bundleCard(commanderCard), nonlands: nonlandsFinal, lands: landsFinal },
    counts,
  };
}
