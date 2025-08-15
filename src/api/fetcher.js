// src/api/fetcher.js
const cache = new Map(); // key -> { t, data }
const TTL = 60_000;      // 60s

async function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

export async function getJSON(url, { cacheKey=url, ttl=TTL, retries=2 } = {}){
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && (now - hit.t) < ttl) return hit.data;

  let err;
  for (let i=0; i<=retries; i++){
    try{
      const r = await fetch(url, { headers: { "Accept":"application/json" } });
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      cache.set(cacheKey, { t: now, data });
      return data;
    }catch(e){
      err = e;
      if (i < retries) await sleep(200 * (i+1)); // backoff léger
    }
  }
  throw err;
}
