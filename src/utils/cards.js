// src/utils/cards.js
import { namedExact as sfNamedExact } from "../api/scryfall";

export const ciMask = (s) => s.split("").filter(Boolean).sort().join("");
export const identityToQuery = (ci) => `ci<=${(ci || "").toLowerCase()}`;

export const nameOf = (c) => c?.name?.trim?.() || "";
export const oracle = (c) => (c?.oracle_text || "").toLowerCase();
export const isCommanderLegal = (c) => c?.legalities?.commander === "legal";
export const getCI = (c) => ciMask((c?.color_identity || []).join(""));
export const unionCI = (a, b) =>
  ciMask(
    Array.from(new Set([...(a || "").split(""), ...(b || "").split("")])).join(
      ""
    )
  );

export const priceEUR = (c) => {
  const e = Number(c?.prices?.eur);
  const f = Number(c?.prices?.eur_foil);
  return isNaN(e) ? (isNaN(f) ? 0 : f) : e;
};

export const edhrecScore = (c) => {
  const r = Number(c?.edhrec_rank) || 0;
  const cap = 100000;
  return r ? Math.max(0, 1 - Math.min(r, cap) / cap) : 0;
};

export const distinctBy = (keyFn) => (arr) => {
  const s = new Set();
  return arr.filter((x) => {
    const k = keyFn(x);
    if (s.has(k)) return false;
    s.add(k);
    return true;
  });
};
export const distinctByOracle = distinctBy((c) => c?.oracle_id || c?.id || nameOf(c));
export const distinctByName = distinctBy((c) => nameOf(c));

export const primaryTypeLabel = (tl) => {
  const t = (tl || "").toLowerCase();
  if (t.includes("creature")) return "Créatures";
  if (t.includes("artifact")) return "Artefacts";
  if (t.includes("enchantment")) return "Enchantements";
  if (t.includes("instant")) return "Éphémères";
  if (t.includes("sorcery")) return "Rituels";
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("battle")) return "Batailles";
  if (t.includes("land")) return "Terrains";
  return "Autres";
};

// Mise à plat pour l’affichage (images/texte/cost)
export function bundleCard(c) {
  const f = c?.card_faces || [];
  const faceImg = (i) =>
    f[i]?.image_uris?.normal ||
    f[i]?.image_uris?.large ||
    f[i]?.image_uris?.small ||
    "";
  const oracleText = c?.oracle_text || f.map((x) => x.oracle_text).filter(Boolean).join("\n");
  const manaCost = c?.mana_cost || f.map((x) => x.mana_cost).filter(Boolean).join(" / ");
  return {
    name: nameOf(c),
    type_line: c?.type_line || f[0]?.type_line || "",
    image: c?.image_uris?.normal || c?.image_uris?.large || faceImg(0) || faceImg(1) || "",
    small: c?.image_uris?.small || f[0]?.image_uris?.small || f[1]?.image_uris?.small || "",
    oracle_en: oracleText,
    mana_cost: manaCost,
    cmc: typeof c?.cmc === "number" ? c.cmc : Number(c?.cmc) || 0,
    prices: c?.prices || {},
    scryfall_uri: c?.scryfall_uri || c?.related_uris?.gatherer || "",
  };
}

// Option pratique : équivalent à l’ancien sf.namedExact + mise en forme
export async function bundleByName(name) {
  const c = await sfNamedExact(name);
  return bundleCard(c);
}

// Classification simple de rôles par texte oracle (approx)
export function roleOf(card){
  const t = (card?.oracle_text || "").toLowerCase();
  if (/destroy all .*creature|wrath|damnation|farewell|supreme verdict/.test(t)) return "wraths";
  if (/destroy target|exile target|counter target/.test(t)) return "removal";
  if (/draw .* card/.test(t)) return "draw";
  if (/add [wubrgc]/.test(t) || /search your library.*land/.test(t)). return "ramp";
  return "other";
}
