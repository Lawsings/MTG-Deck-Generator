import React from "react";

export default function Sliders({ edhrecWeight, onEdhrec, ownedWeight, onOwned, deckBudget, onBudget, targetLands, onLands }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm mb-1">Poids EDHREC : {edhrecWeight}%</label>
        <input type="range" min="0" max="100" value={edhrecWeight} onChange={(e)=>onEdhrec(Number(e.target.value))} className="range" />
      </div>
      <div>
        <label className="block text-sm mb-1">Poids Collection : {ownedWeight}%</label>
        <input type="range" min="0" max="100" value={ownedWeight} onChange={(e)=>onOwned(Number(e.target.value))} className="range" />
      </div>
      <div>
        <label className="block text-sm mb-1">Budget max (est.) : {deckBudget}€</label>
        <input type="range" min="0" max="500" step="5" value={deckBudget} onChange={(e)=>onBudget(Number(e.target.value))} className="range" />
      </div>
      <div>
        <label className="block text-sm mb-1">Nombre de terrains : {targetLands}</label>
        <input type="range" min="30" max="40" value={targetLands} onChange={(e)=>onLands(Number(e.target.value))} className="range" />
      </div>
    </div>
  );
}
