// src/utils/cards.js

// --- Détermine le rôle d'une carte (ramp, draw, removal, etc.)
export function roleOf(card) {
  const t = (card?.oracle_text || "").toLowerCase();
  if (/destroy all .*creature|wrath|damnation|farewell|supreme verdict/.test(t)) return "wraths";
  if (/destroy target|exile target|counter target/.test(t)) return "removal";
  if (/draw .* card/.test(t)) return "draw";
  if (/add [wubrgc]/.test(t) || /search your library.*land/.test(t)) return "ramp";
  return "other";
}

// --- Récupère les types de la carte
export function getTypes(card) {
  if (!card || !card.type_line) return [];
  return card.type_line
    .split("—")[0]
    .split(" ")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

// --- Vérifie si la carte est un terrain
export function isLand(card) {
  return getTypes(card).includes("land");
}

// --- Vérifie si la carte est une créature
export function isCreature(card) {
  return getTypes(card).includes("creature");
}

// --- Vérifie si la carte est un planeswalker
export function isPlaneswalker(card) {
  return getTypes(card).includes("planeswalker");
}

// --- Vérifie si la carte est un sort non-terrain
export function isNonLandSpell(card) {
  return !isLand(card);
}

// --- Formatte le coût de mana en tableau de symboles
export function tokenizeMana(manaCost) {
  if (!manaCost) return [];
  return manaCost.match(/\{.*?\}/g) || [];
}

// --- Convertit l'identité couleur en requête Scryfall
export function identityToQuery(ci) {
  // Nettoie et normalise : garde uniquement W/U/B/R/G en MAJ
  const s = (ci || "")
    .toUpperCase()
    .replace(/[^WUBRG]/g, "");

  // Si pas de couleur -> pas de filtre
  if (!s) return "";

  // Scryfall utilise 'id' (color identity), pas 'ci'
  // Exemple: id<=WRG
  return `id<=${s}`;
}

// --- Vérifie si la carte correspond à une identité couleur donnée
export function matchesColorIdentity(card, ci) {
  if (!ci) return true;
  const cardCI = (card?.color_identity || []).join("").toUpperCase();
  const targetCI = ci.toUpperCase();
  return [...targetCI].every((c) => cardCI.includes(c));
}

// --- Filtre les cartes par rôle
export function filterByRole(cards, role) {
  return cards.filter((c) => roleOf(c) === role);
}
