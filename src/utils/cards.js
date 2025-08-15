// src/utils/cards.js

// -------- Color Identity → Scryfall query --------
export function identityToQuery(ci) {
  // Garde uniquement W/U/B/R/G en MAJ
  const s = (ci || "").toUpperCase().replace(/[^WUBRG]/g, "");
  if (!s) return "";                 // pas de filtre si vide
  return `id<=${s}`;                 // syntaxe Scryfall correcte
}

// -------- Roles (ramp/draw/removal/wraths/other) --------
export function roleOf(card) {
  const t = (card?.oracle_text || "").toLowerCase();
  if (/destroy all .*creature|wrath|damnation|farewell|supreme verdict/.test(t)) return "wraths";
  if (/destroy target|exile target|counter target/.test(t)) return "removal";
  if (/draw .* card/.test(t)) return "draw";
  if (/add [wubrgc]/.test(t) || /search your library.*land/.test(t)) return "ramp";
  return "other";
}

// -------- Types utilitaires --------
export function getTypes(card) {
  if (!card || !card.type_line) return [];
  return card.type_line
    .split("—")[0]
    .split(" ")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function isLand(card) {
  return getTypes(card).includes("land");
}

export function isNonLandSpell(card) {
  return !isLand(card);
}

// Libellé de groupe principal pour l’UI (NonlandGroups)
export function primaryTypeLabel(typeLine = "") {
  const l = typeLine.toLowerCase();
  if (l.includes("creature")) return "Créatures";
  if (l.includes("instant")) return "Éphémères";
  if (l.includes("sorcery")) return "Rituels";
  if (l.includes("artifact")) return "Artefacts";
  if (l.includes("enchantment")) return "Enchantements";
  if (l.includes("planeswalker")) return "Planeswalkers";
  if (l.includes("battle")) return "Batailles";
  if (l.includes("land")) return "Terrains";
  return "Autres";
}

// -------- Commander helpers --------
export function isCommanderLegal(card) {
  // On vérifie la légalité commander; fallback permissif si champ absent
  const leg = card?.legalities?.commander;
  return leg === "legal" || leg === "restricted" || leg == null;
}

export function getCI(card) {
  // Retourne l'identité couleur sous forme "WUBRG" (sans séparateurs)
  const arr = Array.isArray(card?.color_identity) ? card.color_identity : [];
  return arr.join("").toUpperCase();
}

// -------- Prix --------
export function priceEUR(card) {
  const p = card?.prices || {};
  const n = Number(p.eur) || Number(p.eur_foil) || 0;
  return isFinite(n) ? n : 0;
}

// -------- Mini “bundle” pour affichage uniforme --------
export function bundleCard(card) {
  // image: on prend la meilleure dispo (faces incluses)
  let image = card?.image_uris?.large || card?.image_uris?.normal || null;
  if (!image && Array.isArray(card?.card_faces) && card.card_faces.length) {
    const f = card.card_faces[0];
    image = f?.image_uris?.large || f?.image_uris?.normal || null;
  }

  // texte oracle (anglais de référence)
  const oracle_en =
    card?.oracle_text ||
    (Array.isArray(card?.card_faces) ? card.card_faces.map(f => f.oracle_text).filter(Boolean).join("\n—\n") : "") ||
    "";

  return {
    name: card?.name || "",
    mana_cost: card?.mana_cost || (Array.isArray(card?.card_faces) ? (card.card_faces[0]?.mana_cost || "") : ""),
    type_line: card?.type_line || "",
    oracle_en,
    cmc: Number(card?.cmc) || 0,
    image,
    prices: card?.prices || {},
    color_identity: card?.color_identity || [],
  };
}

// -------- Divers utiles --------
export function tokenizeMana(manaCost) {
  if (!manaCost) return [];
  return manaCost.match(/\{.*?\}/g) || [];
}

export function matchesColorIdentity(card, ci) {
  if (!ci) return true;
  const target = (ci || "").toUpperCase().replace(/[^WUBRG]/g, "");
  const cardCI = (card?.color_identity || []).join("").toUpperCase();
  return [...target].every((c) => cardCI.includes(c));
}

// (optionnel) petit label humain pour debug
export function debugCardLine(card) {
  return `${card?.name || "?"} — ${card?.type_line || ""} [${getCI(card)}] €${priceEUR(card)}`;
}
