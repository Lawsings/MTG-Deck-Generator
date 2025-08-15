// src/utils/resolveCommander.js
import { search as sfSearch, namedExact as sfNamedExact } from "../api/scryfall";
import { isCommanderLegal } from "./cards";

export async function resolveCommanderByAnyName(name){
  // 1) tentative nom exact EN
  try { const en = await sfNamedExact(name); if(isCommanderLegal(en)) return en; } catch {}

  // 2) recherche par nom + FR → puis bascule sur l’édition EN du même oracle_id
  const term = `legal:commander name:\"${name}\" (type:legendary or o:\"can be your commander\")`;
  const fr = await sfSearch(`${term} lang:fr unique:prints order:released`).catch(()=>null);
  const any = fr?.data?.[0];
  if(any){
    const oid = any.oracle_id;
    const enOfSame = await sfSearch(`oracleid:${oid} lang:en order:released unique:prints`).catch(()=>null);
    const best = enOfSame?.data?.[0] || any;
    if(isCommanderLegal(best)) return best;
  }

  // 3) fallback générique
  const gen = await sfSearch(`legal:commander name:${name} (type:legendary or o:\"can be your commander\") order:edhrec`).catch(()=>null);
  const pick = gen?.data?.find(isCommanderLegal) || gen?.data?.[0];
  if(pick) return pick;

  throw new Error(`Impossible de résoudre le nom: ${name}`);
}
