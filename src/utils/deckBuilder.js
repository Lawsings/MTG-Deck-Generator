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

// ----- Cibles par TYPE principal (bornes min/max) -----
const TYPE_TARGETS = {
  creature:     { min: 20, max: 30 },
  artifact:     { min: 6,  max: 12 },
  enchantment:  { min: 4,  max: 10 },
  instant:      { min: 6,  max: 12 },
  sorcery:      { min: 6,  max: 10 },
  planeswalker: { min: 0,  max: 3  },
  battle:       { min: 0,  max: 2  },
  other:        { min: 0,  max: 4  },
};

// Cap spécifique sur les mana rocks (artefacts qui produisent du mana)
const ROCK_CAP = 10;

// ---------- Helpers pool & scoring ----------

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

function synergyBonus(card, mechSet) {
  if (!mechSet.size) return 0;
  const t = (card.oracle_text || "").toLowerCase();
  let hits = 0;
  for (const mech of mechSet) {
    const list = MECH_KEYWORDS[mech] || [];
    for (const kw of list) { if (t.includes(kw)) { hits++; break; } }
  }
  return Math.min(0.4, hits * 0.1);
}

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

// Type principal pour contrôle de distribution
function typeOf(card) {
  const tl = (card?.type_line || "").toLowerCase();
  if (tl.includes("creature"))      return "creature";
  if (tl.includes("instant"))       return "instant";
  if (tl.includes("sorcery"))       return "sorcery";
  if (tl.includes("artifact"))      return "artifact";
  if (tl.includes("enchantment"))   return "enchantment";
  if (tl.includes("planeswalker"))  return "planeswalker";
  if (tl.includes("battle"))        return "battle";
  if (tl.includes("land"))          return "land"; // par sécurité (on filtre ailleurs)
  return "other";
}

// Mana rock (artefact qui a “add {” dans son texte)
function isManaRock(card) {
  const tl = (card?.type_line || "").toLowerCase();
  if (!tl.includes("artifact")) return false;
  const t = (card?.oracle_text || "").toLowerCase();
  return /add\s*\{/.test(t); // détecte “Add {C}”, “Add {B}{B}”, etc.
}

// Courbe
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

  const spellsPool = (spellsPoolRaw || []).filter(isCommanderLegal).sort((a, b) => scoreOf(b) - scoreOf(a));
  const landsPool  = (landsPoolRaw  || []).filter(isCommanderLegal).sort((a, b) => scoreOf(b) - scoreOf(a));

  // 3) Nombre de terrains et de sorts visés
  const TL = clamp(Number(targetLands) || 36, 32, 40); // bornes défensives
  const spellsTarget = 99 - TL;

  // 4) Sélection des sorts : rôles + type caps + courbe + singleton
  progress(45, "Sélection des sorts…");
  const wantRole = {
    ramp: targets.ramp?.[0] ?? 8,
    draw: targets.draw?.[0] ?? 6,
    removal: targets.removal?.[0] ?? 6,
    wraths: targets.wraths?.[0] ?? 2,
  };
  const haveRole = { ramp: 0, draw: 0, removal: 0, wraths: 0 };

  const typeHave = {
    creature: 0, artifact: 0, enchantment: 0, instant: 0, sorcery: 0, planeswalker: 0, battle: 0, other: 0,
  };

  const curveTarget = { low: 12, mid: 10, high: 8 };
  const curveHave = { low: 0,  mid: 0,  high: 0  };

  let rocksHave = 0;

  const pick = [];
  const takenNames = new Set();
  const nameOf = (c) => (c?.name || "").trim();

  const canAdd = (c, { strict = false } = {}) => {
    const n = nameOf(c); if (!n || takenNames.has(n)) return false;

    // Budget guards (plus stricts quand strict=true)
    const price = priceEUR(c);
    if (deckBudget > 0) {
      if (strict && price > deckBudget * 2) return false;
      if (!strict && price > deckBudget * 1.5) return false;
    }

    // Type constraints
    const t = typeOf(c);
    if (t === "land") return false; // sécurité
    const tgt = TYPE_TARGETS[t] || TYPE_TARGETS.other;

    // Cap rocks
    if (t === "artifact" && isManaRock(c) && rocksHave >= ROCK_CAP) return false;

    // Si strict (phase minima), on empêche de dépasser le max du type
    if (strict && typeHave[t] >= tgt.max) return false;

    return true;
  };

  const addCard = (c) => {
    const n = nameOf(c);
    const t = typeOf(c);
    pick.push(c);
    takenNames.add(n);
    typeHave[t] = (typeHave[t] || 0) + 1;
    if (t === "artifact" && isManaRock(c)) rocksHave++;
    const b = curveBucket(Number(c.cmc) || 0);
    curveHave[b] = (curveHave[b] || 0) + 1;
  };

  // 4.1 Minima par rôle (strict)
  for (const c of spellsPool) {
    if (pick.length >= spellsTarget) break;
    const r = roleOf(c);
    if (r !== "other" && haveRole[r] < wantRole[r] && canAdd(c, { strict: true })) {
      addCard(c);
      haveRole[r]++;
    }
  }

  // 4.2 Minima par TYPE (assurer au moins les minimums de TYPE_TARGETS)
  const typeOrder = ["creature","instant","sorcery","artifact","enchantment","planeswalker","battle","other"];
  for (const t of typeOrder) {
    const minT = TYPE_TARGETS[t].min;
    if (pick.length >= spellsTarget) break;
    if (minT <= 0) continue;

    for (const c of spellsPool) {
      if (pick.length >= spellsTarget) break;
      if (typeOf(c) !== t) continue;
      if (!canAdd(c, { strict: true })) continue;
      addCard(c);
      if (typeHave[t] >= minT) break;
    }
  }

  // 4.3 Compléter jusqu’à spellsTarget en respectant les caps de type & la courbe
  for (const c of spellsPool) {
    if (pick.length >= spellsTarget) break;
    if (!canAdd(c, { strict: false })) continue;

    // Préférence pour les types sous leur minimum/max
    const t = typeOf(c);
    const tgt = TYPE_TARGETS[t] || TYPE_TARGETS.other;
    // Si ce type est déjà à son max et qu’un autre type est sous son min → on saute
    const someTypeUnderMin = typeOrder.some((tt) => typeHave[tt] < TYPE_TARGETS[tt].min);
    if (typeHave[t] >= tgt.max && someTypeUnderMin) continue;

    // Courbe : si ce bucket dépasse largement la cible, on laisse la place aux buckets en retard
    const b = curveBucket(Number(c.cmc) || 0);
    if (curveHave[b] >= curveTarget[b]) {
      if ((curveHave.low < curveTarget.low) || (curveHave.mid < curveTarget.mid) || (curveHave.high < curveTarget.high)) {
        continue;
      }
    }

    addCard(c);
  }

  // 4.4 Top-up final si manque encore (low → mid → high) en respectant caps
  if (pick.length < spellsTarget) {
    const remainder = spellsPool.filter((c) => {
      const n = nameOf(c);
      if (!n || takenNames.has(n)) return false;
      // budget doux
      const price = priceEUR(c);
      if (deckBudget > 0 && price > deckBudget * 1.2) return false;
      // respect basique des caps
      const t = typeOf(c); const tgt = TYPE_TARGETS[t] || TYPE_TARGETS.other;
      if (typeHave[t] >= tgt.max) return false;
      if (t === "artifact" && isManaRock(c) && rocksHave >= ROCK_CAP) return false;
      return true;
    });

    const low  = remainder.filter((c) => (Number(c.cmc) || 0) <= 2);
    const mid  = remainder.filter((c) => (Number(c.cmc) || 0) >= 3 && (Number(c.cmc) || 0) <= 4);
    const high = remainder.filter((c) => (Number(c.cmc) || 0) >= 5);
    const prioritized = [...low, ...mid, ...high];

    for (const c of prioritized) {
      if (pick.length >= spellsTarget) break;
      if (!canAdd(c, { strict: false })) continue;
      addCard(c);
    }
  }

  // 5) Mise en forme des sorts + compteurs rôles
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
  // par sécurité, si on est en-dessous (peu probable), on tente encore de compléter en sorts
  if (nonlands.length < spellsTarget) {
    const taken = new Set(nonlands.map((c) => (c.name || "").trim()));
    for (const c of spellsPool) {
      if (nonlands.length >= spellsTarget) break;
      const n = (c.name || "").trim();
      if (!n || taken.has(n)) continue;
      // respecter caps de type
      const t = typeOf(c);
      const tgt = TYPE_TARGETS[t] || TYPE_TARGETS.other;
      const current = nonlands.filter((x) => typeOf(x) === t).length;
      if (current >= tgt.max) continue;
      nonlands.push(bundleCard(c));
      taken.add(n);
    }
  }

  // 8) Done
  progress(100, "Terminé !");
  await sleep(60);

  return {
    deck: {
      commander: bundleCard(commanderCard),
      nonlands,
      lands,
    },
    counts,
  };
}
