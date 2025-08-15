import React, { forwardRef } from "react";
import ManaCost from "../cards/ManaCost";

const CommanderBlock = forwardRef(function CommanderBlock({ commander }, ref){
  if(!commander) return null;
  return (
    <div ref={ref} className="grid md:grid-cols-2 gap-4">
      {commander.image && (
        <img src={commander.image} alt={commander.name} className="w-full rounded-xl object-cover" />
      )}
      <div className="space-y-2">
        <h3 className="text-xl font-semibold">{commander.name}</h3>
        {commander.mana_cost && <div className="text-sm"><ManaCost cost={commander.mana_cost}/></div>}
        {commander.oracle_en && <div className="text-sm whitespace-pre-wrap opacity-90">{commander.oracle_en}</div>}
      </div>
    </div>
  );
});
export default CommanderBlock;
