// src/api/scryfall.js
const USE_MOCK = false;

export async function search(q, opts = {}) {
  if (USE_MOCK) return { data: [], has_more: false };
  const params = new URLSearchParams({
    q,
    unique: opts.unique || "cards",
    order: opts.order || "random"
  });
  const r = await fetch("https://api.scryfall.com/cards/search?" + params.toString());
  if (!r.ok) throw new Error("Scryfall " + r.status);
  return r.json();
}

export async function random(q) {
  if (USE_MOCK) {
    return {
      name: "Mock Commander",
      type_line: "Legendary Creature",
      legalities: { commander: "legal" }
    };
  }
  const r = await fetch("https://api.scryfall.com/cards/random?q=" + encodeURIComponent(q));
  if (!r.ok) throw new Error("Scryfall " + r.status);
  return r.json();
}

export async function namedExact(n) {
  if (USE_MOCK) {
    return {
      name: n,
      type_line: "Legendary Creature",
      legalities: { commander: "legal" }
    };
  }
  const r = await fetch("https://api.scryfall.com/cards/named?exact=" + encodeURIComponent(n));
  if (!r.ok) throw new Error("Nom introuvable: " + n);
  return r.json();
}
