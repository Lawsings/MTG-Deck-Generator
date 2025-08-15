// src/api/scryfall.js
import { getJSON } from "./fetcher.js";
const USE_MOCK = false;

export async function search(q, opts = {}){
  if (USE_MOCK) return { data: [], has_more: false };
  const params = new URLSearchParams({ q, unique: opts.unique || "cards", order: opts.order || "random" }).toString();
  return getJSON("https://api.scryfall.com/cards/search?" + params, { cacheKey: "search:"+params });
}

export async function random(q){
  if (USE_MOCK) return { name:"Mock Commander", type_line:"Legendary Creature", legalities:{ commander:"legal" } };
  const url = "https://api.scryfall.com/cards/random?q=" + encodeURIComponent(q);
  return getJSON(url, { cacheKey: "random:"+q, ttl: 0 }); // pas de TTL pour vrai random
}

export async function namedExact(n){
  if (USE_MOCK) return { name:n, type_line:"Legendary Creature", legalities:{ commander:"legal" } };
  const url = "https://api.scryfall.com/cards/named?exact=" + encodeURIComponent(n);
  return getJSON(url, { cacheKey: "named:"+n });
}
