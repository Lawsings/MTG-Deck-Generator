// src/hooks/useCommanderResolution.js
import { useEffect, useState } from "react";
import { getCI } from "../utils/cards";
import { resolveCommanderByAnyName } from "../utils/resolveCommander";

export default function useCommanderResolution(mode, chosen, setCI, setError){
  const [card,setCard]=useState(null);

  useEffect(()=>{
    let ok=true;
    (async()=>{
      if(mode!=="select"||!chosen){ setCard(null); return; }
      try{
        const c = await resolveCommanderByAnyName(chosen);
        if(!ok) return;
        setCard(c);
        setCI(getCI(c));
      }catch(e){
        if(ok){ setCard(null); setError(String(e.message||e)); }
      }
    })();
    return ()=>{ ok=false; };
  },[mode, chosen, setCI, setError]);

  return card;
}
