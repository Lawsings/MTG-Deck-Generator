import React, { useEffect } from "react";

export default function Toast({ open, kind="error", message="", onClose }){
  useEffect(()=>{
    if(!open) return;
    const t = setTimeout(()=> onClose?.(), 3000);
    return ()=> clearTimeout(t);
  }, [open, onClose]);
  if(!open) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`rounded-lg border px-3 py-2 shadow-lg ${kind==="error" ? "text-red-200" : "text-green-200"}`} style={{ background:"rgba(0,0,0,0.75)", borderColor:"rgba(255,255,255,0.1)"}}>
        {message}
      </div>
    </div>
  );
}
