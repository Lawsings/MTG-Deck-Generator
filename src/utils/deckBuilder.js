diff --git a/src/utils/deckBuilder.js b/src/utils/deckBuilder.js
index a38591e7357f7f2da0aa41e50862bac81f4642fe..0095d1e338a27c85e282599483c6000a4460f838 100644
--- a/src/utils/deckBuilder.js
+++ b/src/utils/deckBuilder.js
@@ -1,36 +1,37 @@
 // src/utils/deckBuilder.js
 import { search as sfSearch, random as sfRandom, namedExact as sfNamedExact } from "../api/scryfall";
 import {
   identityToQuery,
   isCommanderLegal,
   getCI,
   bundleCard,
   roleOf,
   priceEUR,
 } from "./cards";
 import { buildManabase } from "./manabase";
+import { finalizeDeck } from "./finalizeDeck.js";

 const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

 // --- Lexique simple: mécanique -> mots à chercher dans oracle_text
 const MECH_KEYWORDS = {
   blink: ["flicker", "exile target creature then return", "flickered", "enters the battlefield"],
   treasure: ["treasure", "create a treasure"],
   sacrifice: ["sacrifice ", "sacrifice a"],
   lifegain: ["you gain", "lifelink", "gain life"],
   tokens: ["create a 1/1", "create a token", "create x"],
   reanimation: ["return target creature card from your graveyard", "reanimate", "return from your graveyard"],
 };

 /**
  * Génère un deck Commander.
  * @param {Object} opts
  *  - commanderMode: "select" | "random"
  *  - chosenCommander: string
  *  - desiredCI: string (ex "WRG")
  *  - mechanics: string[]
  *  - edhrecWeight: number (0..100)
  *  - ownedWeight: number (0..100)
  *  - deckBudget: number (€/carte)
  *  - targetLands: number
  *  - targets: { ramp:[min,max], draw:[min,max], removal:[min,max], wraths:[min,max] }
diff --git a/src/utils/deckBuilder.js b/src/utils/deckBuilder.js
index a38591e7357f7f2da0aa41e50862bac81f4642fe..0095d1e338a27c85e282599483c6000a4460f838 100644
--- a/src/utils/deckBuilder.js
+++ b/src/utils/deckBuilder.js
@@ -173,86 +174,50 @@ export async function generate(opts) {

     const b = curveBucket(Number(c.cmc) || 0);
     // Si ce bucket est déjà au-dessus de sa cible ET qu'un autre est en retard, on préfère l'autre
     if (curveHave[b] >= curveTarget[b]) {
       if ((curveHave.low < curveTarget.low) || (curveHave.mid < curveTarget.mid) || (curveHave.high < curveTarget.high)) {
         continue;
       }
     }

     pick.push(c);
     seen.add(k);
     curveHave[b] = (curveHave[b] || 0) + 1;
   }

   // 5) Bundle + compteurs d’indicateurs
   progress(72, "Mise en forme et statistiques…");
   const nonlands = pick.map(bundleCard);
   const counts = { ramp: 0, draw: 0, removal: 0, wraths: 0 };
   for (const c of nonlands) {
     const r = roleOf(c);
     if (counts[r] != null) counts[r] += 1;
   }

   // 6) Manabase (staples + basiques) sensible au budget
   progress(85, "Construction de la base de terrains…");
-  const lands = await buildManabase(commanderCI, Number(targetLands) || 36, Number(deckBudget) || 0);
-
-  // 7) Compléter jusqu’à 99 cartes (hors commandant)
-  let nonlandsFinal = [...nonlands];
-  let landsFinal = [...lands];
-
-  // Utilitaires
-  const needCount = () => 99 - (nonlandsFinal.length + landsFinal.length);
-  const alreadyPicked = new Set(nonlandsFinal.map(c => (c.name || "") + ":" + (c.mana_cost || "")));
-
-  // 7.1 Compléter avec des sorts low/mid CMC depuis le pool restant (sous budget)
-  let deficit = needCount();
-  if (deficit > 0) {
-    const remainder = [];
-    for (const c of pool) {
-      const k = (c.name || "") + ":" + (c.mana_cost || "");
-      if (alreadyPicked.has(k)) continue;
-      // garde-fou budget doux
-      const price = priceEUR(c);
-      if (deckBudget > 0 && price > deckBudget * 1.2) continue;
-      remainder.push(c);
-    }
-    // priorité aux low → mid → high
-    const low = remainder.filter(c => (Number(c.cmc) || 0) <= 2);
-    const mid = remainder.filter(c => (Number(c.cmc) || 0) >= 3 && (Number(c.cmc) || 0) <= 4);
-    const high = remainder.filter(c => (Number(c.cmc) || 0) >= 5);
-    const prioritized = [...low, ...mid, ...high];
-
-    for (const c of prioritized) {
-      if (deficit <= 0) break;
-      const k = (c.name || "") + ":" + (c.mana_cost || "");
-      if (alreadyPicked.has(k)) continue;
-      nonlandsFinal.push(bundleCard(c));
-      alreadyPicked.add(k);
-      deficit = needCount();
-    }
-  }
-
-  // 7.2 S’il manque encore, ajouter des basiques
-  if (needCount() > 0) {
-    // import dynamique pour éviter un import circulaire ou alourdir le bundle
-    const { suggestBasicLands } = await import("./lands");
-    const basicsNeeded = needCount();
-    const basics = suggestBasicLands(commanderCI, basicsNeeded).map(b => ({
-      name: b.name,
-      type_line: b.type_line || "Land",
-      cmc: 0,
-      oracle_en: "",
-    }));
-    landsFinal = [...landsFinal, ...basics].slice(0, 99 - nonlandsFinal.length); // clamp au cas où
-  }
+  const lands = await buildManabase(
+    commanderCI,
+    Number(targetLands) || 36,
+    Number(deckBudget) || 0
+  );
+
+  // 7) Finalisation: compléter les sorts manquants puis les terrains basiques
+  const { nonlands: nonlandsFinal, lands: landsFinal } = await finalizeDeck({
+    nonlands,
+    lands,
+    pool,
+    commanderCI,
+    targetLands: Number(targetLands) || 36,
+    deckBudget: Number(deckBudget) || 0,
+  });

   // 8) Done
   progress(100, "Terminé !");
   await sleep(100); // petite pause pour l’UX

   return {
     deck: { commander: bundleCard(commanderCard), nonlands: nonlandsFinal, lands: landsFinal },
     counts,
   };
 }
