diff --git a//dev/null b/src/utils/finalizeDeck.js
index 0000000000000000000000000000000000000000..247b316005fde9a7ec10d8807004712b0f0369cd 100644
--- a//dev/null
+++ b/src/utils/finalizeDeck.js
@@ -0,0 +1,79 @@
+import { bundleCard, priceEUR } from "./cards.js";
+
+/**
+ * Finalise un deck en complétant les sorts manquants puis les terrains basiques.
+ * Les terrains sont ajoutés pour atteindre uniquement `targetLands`.
+ * @param {Object} params
+ *  - nonlands: any[] cartes non-terrains déjà sélectionnées
+ *  - lands: any[] terrains déjà sélectionnés
+ *  - pool: any[] pool de cartes disponibles pour piocher des sorts supplémentaires
+ *  - commanderCI: string identité couleur du commandant
+ *  - targetLands: number nombre total de terrains souhaité
+ *  - deckBudget: number budget €/carte pour filtrer le pool
+ * @returns {Promise<{nonlands:any[], lands:any[]}>}
+ */
+export async function finalizeDeck({
+  nonlands = [],
+  lands = [],
+  pool = [],
+  commanderCI = "",
+  targetLands = 36,
+  deckBudget = 0,
+}) {
+  const nonlandTarget = 99 - targetLands;
+  let nonlandsFinal = [...nonlands].slice(0, nonlandTarget);
+  let landsFinal = [...lands].slice(0, targetLands);
+
+  const keyOf = (c) => (c.name || "") + ":" + (c.mana_cost || "");
+  const alreadyPicked = new Set(nonlandsFinal.map(keyOf));
+
+  // Compléter avec des sorts issus du pool (priorité low → mid → high CMC)
+  let deficitSpells = nonlandTarget - nonlandsFinal.length;
+  if (deficitSpells > 0) {
+    const remainder = [];
+    for (const c of pool) {
+      const k = keyOf(c);
+      if (alreadyPicked.has(k)) continue;
+      const price = priceEUR(c);
+      if (deckBudget > 0 && price > deckBudget * 1.2) continue;
+      remainder.push(c);
+    }
+    const low = remainder.filter((c) => (Number(c.cmc) || 0) <= 2);
+    const mid = remainder.filter(
+      (c) => (Number(c.cmc) || 0) >= 3 && (Number(c.cmc) || 0) <= 4
+    );
+    const high = remainder.filter((c) => (Number(c.cmc) || 0) >= 5);
+    const prioritized = [...low, ...mid, ...high];
+    for (const c of prioritized) {
+      if (deficitSpells <= 0) break;
+      const k = keyOf(c);
+      if (alreadyPicked.has(k)) continue;
+      nonlandsFinal.push(bundleCard(c));
+      alreadyPicked.add(k);
+      deficitSpells = nonlandTarget - nonlandsFinal.length;
+    }
+  }
+
+  // Ajout de terrains basiques seulement jusqu'à targetLands
+  if (landsFinal.length < targetLands) {
+    const { suggestBasicLands } = await import("./lands.js");
+    const basicsNeeded = targetLands - landsFinal.length;
+    const basics = suggestBasicLands(commanderCI, basicsNeeded).map((b) => ({
+      name: b.name,
+      type_line: b.type_line || "Land",
+      cmc: 0,
+      oracle_en: "",
+    }));
+    landsFinal = [...landsFinal, ...basics].slice(0, targetLands);
+  } else if (landsFinal.length > targetLands) {
+    landsFinal = landsFinal.slice(0, targetLands);
+  }
+
+  if (nonlandsFinal.length < nonlandTarget) {
+    throw new Error(
+      `Nombre de sorts insuffisant: ${nonlandTarget - nonlandsFinal.length} manquants.`
+    );
+  }
+
+  return { nonlands: nonlandsFinal, lands: landsFinal };
+}
