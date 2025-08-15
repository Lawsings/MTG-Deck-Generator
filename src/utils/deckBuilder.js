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

// ---------- Helpers pool ----------

// récupère plusieurs pages pour grossir le pool
async function fetchAllPages(q, { pages = 1, unique = "cards", order = "edhrec" } = {}) {
  let res = await sfSearch(`${q} unique:${unique} order:${order}`);
  let out = Array.isArray(res?.data) ? res.data.slice() : [];
  let left = pages - 1;
  while (left > 0 && res?.has_more && res?.next_page) {
    const r = await fetch(res.next_page);
    if (!r.ok) break;
    res = await r.json();
    out = out.concat(res?.data || []);
    left--;
  }
  return out;
}

// score synergie mécaniques
function synergyBonus(card, mechSet) {
  if (!mechSet.size) return 0;
  const t = (card.oracle_text || "").toLowerCase();
  let hits = 0;
  for (const mech of mechSet) {
    const list = MECH_KEYWORDS[mech] || [];
    for (const kw of list) {
      if (t.includes(kw)) { hits++; break; }
    }
  }
  return Math.min(0.4, hits * 0.1); // 0..0.4
}

// score global
function scorer({ edhrecWeight, ownedWeight, deckBudget, ownedMap, mechSet }) {
  return (c) => {
    const edhRank = Number(c.edhrec_rank || 100000);
    const edh = 1 - Math.min(100000, edhRank) / 100000; // 0..1
    const have = ownedMap.get((c.name || "").toLowerCase()) > 0 ? 1 : 0; // 0/1
    const price = priceEUR(c);
    const budgetOk = deckBudget <= 0 ? 1 : price <= deckBudget ? 1 : 0.3;
    const syn = synergyBonus(c, mechSet); // 0..0.4
    return (edhrecWeight / 100) * edh + (ownedWeight / 100) * have + 0.2 * budgetOk + syn;
  };
}

// bucket courbe
const curveBucket = (cmc) => (cmc <= 2 ? "low" : cmc <= 4 ? "mid" : "high");

// ---------- MAIN ----------
export async function generate(opts) {
  const {
    commanderMode = "select",
    chosenCommander = "",
    desiredCI = "",
    mechanics = [],
    edhrecWeight = 60,
    ownedWeight = 40,
    deckBudget = 0,
    targetLands = 36,
    targets = { ramp: [8, 12], draw: [6, 10], removal: [6, 10], wraths: [2, 4] },
    ownedMap = new Map(),
    progress = () => {},
  } = opts || {};

  // 0) Préparation
  const mechSet = new Set((mechanics || []).map((m) => String(m || "").toLowerCase()));
  const scoreOf = scorer({ edhrecWeight, ownedWeight, deckBudget, ownedMap, mechSet });

  progress(5, "Recherche du commandant…");

  // 1) Résoudre le commandant
  let commanderCard;
  if (commanderMode === "select" && chosenCommander) {
    commanderCard = await sfNamedExact(chosenCommander);
  } else {
    let q = `legal:commander game:paper -is:funny (type:"legendary creature" or (type:planeswalker and o:"can be your commander") or type:background)`;
    if (desiredCI && desiredCI.length > 0) q += ` ${identityToQuery(desiredCI)}`;
    commanderCard = await sfRandom(q);
  }
  if (!commanderCard || !isCommanderLegal(commanderCard)) {
    throw new Error("Aucun commandant valide trouvé.");
  }

  const commanderCI = getCI(commanderCard);

  // 2) Construire les pools
  progress(20, "Création du pool de cartes…");
  const filterCI = identityToQuery(commanderCI);
  const base = `legal:commander game:paper -is:funny ${filterCI}`.trim();

  // sorts non-terrains (2 pages), lands non-basics (1 page) si besoin
  const spellsQ = `${base} -type:land -type:background`;
  const landsQ  = `${base} type:land -type:basic`;

  const [spellsPoolRaw, landsPoolRaw] = await Promise.all([
    fetchAllPages(spellsQ, { pages: 2, unique: "cards", order: "edhrec" }),
    fetchAllPages(landsQ,  { pages: 1, unique: "cards", order: "edhrec" }),
  ]);

  // filtrage légalité + tri score
  const spellsPool = (spellsPoolRaw || []).filter(isCommanderLegal).sort((a, b) => scoreOf(b) - scoreOf(a));
  const landsPool  = (landsPoolRaw  || []).filter(isCommanderLegal).sort((a, b) => scoreOf(b) - scoreOf(a));

  // 3) Nombre de terrains et de sorts visés
  const TL = clamp(Number(targetLands) || 36, 32, 40);     // terrains visés (bornés)
  const spellsTarget = 99 - TL;                            // sorts non-terrains visés

  // 4) Sélection des sorts : minima par rôle + courbe + singleton strict
  progress(45, "Sélection des sorts…");
  const want = {
    ramp: targets.ramp?.[0] ?? 8,
    draw: targets.draw?.[0] ?? 6,
    removal: targets.removal?.[0] ?? 6,
    wraths: targets.wraths?.[0] ?? 2,
  };
  const have = { ramp: 0, draw: 0, removal: 0, wraths: 0 };

  const curveTarget = { low: 12, mid: 10, high: 8 };
  const curveHave = { low: 0, mid: 0, high: 0 };

  const pick = [];
  const takenNames = new Set(); // SINGLETON STRICT par nom
  const nameOf = (c) => (c?.name || "").trim();

  // 4.1 Minima par rôle
  for (const c of spellsPool) {
    if (pick.length >= spellsTarget) break;
    const r = roleOf(c);
    if (r !== "other" && have[r] < want[r]) {
      const n = nameOf(c);
      if (!n || takenNames.has(n)) continue;

      // Budget hard pour minima (éviter outliers)
      const price = priceEUR(c);
      if (deckBudget > 0 && price > deckBudget * 2) continue;

      pick.push(c);
      takenNames.add(n);
      have[r]++;

      const b = curveBucket(Number(c.cmc) || 0);
      curveHave[b] = (curveHave[b] || 0) + 1;
    }
  }

  // 4.2 Compléter jusqu’à spellsTarget (préférence courbe + léger budget)
  for (const c of spellsPool) {
    if (pick.length >= spellsTarget) break;
    const n = nameOf(c);
    if (!n || takenNames.has(n)) continue;

    const price = priceEUR(c);
    if (deckBudget > 0 && price > deckBudget * 1.5) continue;

    const b = curveBucket(Number(c.cmc) || 0);
    if (curveHave[b] >= curveTarget[b]) {
      if ((curveHave.low < curveTarget.low) || (curveHave.mid < curveTarget.mid) || (curveHave.high < curveTarget.high)) {
        continue; // combler d’abord les buckets en retard
      }
    }

    pick.push(c);
    takenNames.add(n);
    curveHave[b] = (curveHave[b] || 0) + 1;
  }

  // 4.3 Top-up si, malgré tout, il manque encore des sorts (budget doux + low→mid→high)
  while (pick.length < spellsTarget) {
    const remainder = spellsPool.filter((c) => {
      const n = nameOf(c);
      if (!n || takenNames.has(n)) return false;
      const price = priceEUR(c);
      if (deckBudget > 0 && price > deckBudget * 1.2) return false;
      return true;
    });
    if (!remainder.length) break;

    const low  = remainder.filter((c) => (Number(c.cmc) || 0) <= 2);
    const mid  = remainder.filter((c) => (Number(c.cmc) || 0) >= 3 && (Number(c.cmc) || 0) <= 4);
    const high = remainder.filter((c) => (Number(c.cmc) || 0) >= 5);
    const prioritized = [...low, ...mid, ...high];

    for (const c of prioritized) {
      if (pick.length >= spellsTarget) break;
      const n = nameOf(c);
      if (!n || takenNames.has(n)) continue;
      pick.push(c);
      takenNames.add(n);
    }
    if (prioritized.length === 0) break;
  }

  // 5) Mise en forme des sorts + compteurs
  progress(65, "Mise en forme des sorts…");
  const nonlands = pick.map(bundleCard);
  const counts = { ramp: 0, draw: 0, removal: 0, wraths: 0 };
  for (const c of nonlands) {
    const r = roleOf(c);
    if (counts[r] != null) counts[r] += 1;
  }

  // 6) Manabase EXACTE (terrains) — buildManabase retourne exactement TL lands (≤8 non-basiques)
  progress(80, "Construction de la base de terrains…");
  const lands = await buildManabase(commanderCI, TL, Number(deckBudget) || 0);

  // 7) Validation finale: 1 commandant + (nonlands + lands) == 99
  progress(95, "Validation du deck…");
  let nonlandsFinal = [...nonlands];
  const landsFinal = [...lands];

  // Si, pour une raison quelconque, on est en dessous, on tente un dernier top-up en sorts (singleton)
  if (nonlandsFinal.length < spellsTarget) {
    const rest = spellsPool.filter((c) => !takenNames.has(nameOf(c)));
    for (const c of rest) {
      if (nonlandsFinal.length >= spellsTarget) break;
      const n = nameOf(c);
      if (!n || takenNames.has(n)) continue;
      nonlandsFinal.push(bundleCard(c));
      takenNames.add(n);
    }
  }

  // 8) Done
  progress(100, "Terminé !");
  await sleep(60);

  return {
    deck: {
      commander: bundleCard(commanderCard),
      nonlands: nonlandsFinal,
      lands: landsFinal,
    },
    counts,
  };
}
