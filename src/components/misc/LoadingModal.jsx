import React from "react";

export default function LoadingModal({ open, progress = 0, message = "" }){
  if(!open) return null;
  const pct = Math.max(0, Math.min(100, Math.floor(progress)));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel p-6 max-w-sm w-full text-center">
        <div className="text-lg font-semibold mb-4">Génération du deck…</div>
        <div className="w-full h-3 rounded-full border overflow-hidden" style={{borderColor:'var(--border)'}}>
          <div style={{ width: pct + '%', background:'var(--text)' }} className="h-full" />
        </div>
        <div className="mt-2 text-sm">{pct}%</div>
        <div className="mt-1 text-xs muted">{message}</div>
      </div>
    </div>
  );
}
