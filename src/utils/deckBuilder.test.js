diff --git a//dev/null b/src/utils/deckBuilder.test.js
index 0000000000000000000000000000000000000000..581ab13d341f2a9589f2ad33621ccb447103b91a 100644
--- a//dev/null
+++ b/src/utils/deckBuilder.test.js
@@ -0,0 +1,49 @@
+import assert from "assert";
+import { finalizeDeck } from "./finalizeDeck.js";
+
+function stubSpell(name) {
+  return {
+    name,
+    mana_cost: "{1}",
+    cmc: 1,
+    type_line: "Instant",
+    oracle_text: "",
+    prices: { eur: "0" },
+  };
+}
+
+async function run() {
+  // Cas nominal : compléter les sorts puis les terrains basiques
+  const baseNonlands = [stubSpell("Spell1")];
+  const pool = [stubSpell("Spell2"), stubSpell("Spell3")];
+  const result = await finalizeDeck({
+    nonlands: baseNonlands,
+    lands: [],
+    pool,
+    commanderCI: "UG",
+    targetLands: 97,
+    deckBudget: 0,
+  });
+  assert.strictEqual(result.nonlands.length, 2);
+  assert.strictEqual(result.lands.length, 97);
+
+  // Cas d'erreur : pas assez de sorts disponibles
+  let error = false;
+  try {
+    await finalizeDeck({
+      nonlands: baseNonlands,
+      lands: [],
+      pool: [],
+      commanderCI: "UG",
+      targetLands: 97,
+      deckBudget: 0,
+    });
+  } catch (e) {
+    error = true;
+  }
+  assert.ok(error, "Une erreur aurait dû être levée");
+
+  console.log("deckBuilder tests passed");
+}
+
+run();
