import React from "react";
import { Sparkles } from "lucide-react";

export default function GenerateButton({ loading, onClick }){
  return (
    <button className="btn-primary inline-flex items-center gap-2" onClick={onClick} disabled={loading}>
      <Sparkles className="h-4 w-4"/>
      {loading ? "Génération…" : "Générer un deck"}
    </button>
  );
}
