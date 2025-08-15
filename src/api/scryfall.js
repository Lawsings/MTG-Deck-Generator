// src/api/scryfall.js
const USE_MOCK = false; // passe à true si tu veux éditer sans réseau

export async function search(q, opts = {}) {
  if (USE_MOCK) return { data: [], has_more: false };
  const params = new URLSearchParams({
    q,
    unique: opts.unique || "cards",
    order: opts.order || "random",
  });
  const r = await fetch(`https://api.scryfall.com/cards/search?${params}`);
  if (!r.ok) throw new Error(`Scryfall ${r.status}`);
  return r.json();
}

export async function random(q) {
  if (USE_MOCK)
    return {
      name: "Mock Commander",
      type_line: "Legendary Creature",
      legalities: { commander: "legal" },
    };
  const r = await fetch(
    `https://api.scryfall.com/cards/random?q=${encodeURIComponent(q)}`
  );
  if (!r.ok) throw new Error(`Scryfall ${r.status}`);
  return r.json();
}

// ✅ L’export qui manquait
export async function namedExact(n) {
  if (USE_MOCK)
    return {
      name: n,
      type_line: "Legendary Creature",
      legalities: { commander: "legal" },
    };
  const r = await fetch(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(n)}`
  );
  if (!r.ok) throw new Error(`Nom introuvable: ${n}`);
  return r.json();
}

// Optionnel : résolution FR/EN d’un nom
export async function resolveCommanderByAnyName(name) {
  try {
    const en = await namedExact(name);
    if (en?.legalities?.commander === "legal") return en;
  } catch {}
  const term =
    `legal:commander name:"${name}" ` +
    `(type:legendary or o:"can be your commander")`;
  const fr = await search(`${term} lang:fr unique:prints order:released`).catch(
    () => null
  );
  const any = fr?.data?.[0];
  if (any) {
    const oid = any.oracle_id;
    const enOfSame = await search(
      `oracleid:${oid} lang:en order:released unique:prints`
    ).catch(() => null);
    const best = enOfSame?.data?.[0] || any;
    if (best?.legalities?.commander === "legal") return best;
  }
  const ge
