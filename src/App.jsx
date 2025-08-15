import React, { useEffect, useMemo, useRef, useState } from "react";

// UI (passes 1→8)
import ThemeToggle from "./components/controls/ThemeToggle";
import ManaCost from "./components/cards/ManaCost";
import CardModal from "./components/cards/CardModal";
import FileDrop from "./components/collection/FileDrop";
import CommanderAutocomplete from "./components/controls/CommanderAutocomplete";
import ColorIdentityPicker from "./components/controls/ColorIdentityPicker";
import MechanicPicker from "./components/controls/MechanicPicker";
import Sliders from "./components/controls/Sliders";
import TargetsEditor from "./components/controls/TargetsEditor";
import GenerateButton from "./components/controls/GenerateButton";
import LoadingModal from "./components/misc/LoadingModal";
import Toast from "./components/misc/Toast";

// Résultats
import CommanderBlock from "./components/result/CommanderBlock";
import BalanceIndicators from "./components/result/BalanceIndicators";
import NonlandGroups from "./components/result/NonlandGroups";
import LandsGrid from "./components/result/LandsGrid";
import StatsBlock from "./components/result/StatsBlock";

import { RefreshCcw } from "lucide-react";

// Hooks
import useCommanderResolution from "./hooks/useCommanderResolution";

// Utils cartes
import {
  identityToQuery,
  isCommanderLegal,
  getCI,
  priceEUR,
  bundleCard,
  roleOf,
} from "./utils/cards";

// Manabase (staples + basiques)
import { buildManabase } from "./utils/manabase";

// API Scryfall (avec cache/retry via fetcher)
import { search as sfSearch, random as sfRandom } from "./api/scryfall";

// Collection utils
import { parseCollectionFile } from "./utils/collection";

// Storage (persistance locale)
import { saveState, loadState } from "./utils/storage";

// Exports (TXT / CSV Moxfield / CSV Archidekt)
import { toText, toMoxfieldCSV, toArchidektCSV, downloadFile } from "./utils/exports";

// =========================
// Constantes légères
// =========================
const MECHANIC_TAGS = ["blink", "treasure", "sacrifice", "lifegain", "tokens", "reanimation"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  // Boot state (persistance)
  const boot = loadState();

  // Thème
  const [theme, setTheme] = useState(() => boot.theme ?? "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  // États principaux
  const [commanderMode, setCommanderMode] = useState(boot.commanderMode ?? "select"); // "select" | "random"
  const [chosenCommander, setChosenCommander] = useState(boot.chosenCommander ?? "");
  const [desiredCI, setDesiredCI] = useState(boot.desiredCI ?? "");
  const [mechanics, setMechanics] = useState(boot.mechanics ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sliders / options
  const [edhrecWeight, setEdhrecWeight] = useState(boot.edhrecWeight ?? 60);
  const [ownedWeight, setOwnedWeight] = useState(boot.ownedWeight ?? 40);
  const [deckBudget, setDeckBudget] = useState(boot.deckBudget ?? 200);
  const [targetLands, setTargetLands] = useState(boot.targetLands ?? 36);
  const [targets, setTargets] = useState(boot.targets ?? { ramp: [8, 12], draw: [6, 10], removal: [6, 10], wraths: [2, 4] });

  // Progress (modale)
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  // Collection
  const [uploadedFiles, setUploadedFiles] = useState([]); // {name, size, map}
  const [ownedMap, setOwnedMap] = useState(new Map());

  // Résultat deck
  const [deck, setDeck] = useState({ commander: null, nonlands: [], lands: [] });
  const [balanceCounts, setBalanceCounts] = useState({ ramp: 0, draw: 0, removal: 0, wraths: 0 });

  // Modale carte
  const [openModal, setOpenModal] = useState(false);
  const [modalCard, setModalCard] = useState(null);

  // Toast
  const [toast, setToast] = useState({ open:false, msg:"" });
  function notifyError(msg){ setError(msg); setToast({ open:true, msg }); }

  // Résolution du commandant
  const selectedCommanderCard = useCommanderResolution(
    commanderMode,
    chosenCommander,
    setDesiredCI,
    setError
  );

  // Ref pour scroll vers le bloc commandant
  const commanderRef = useRef(null);

  // ===== Persistance automatique des réglages =====
  useEffect(()=> saveState({ theme }), [theme]);
  useEffect(()=> saveState({ commanderMode }), [commanderMode]);
  useEffect(()=> saveState({ chosenCommander }), [chosenCommander]);
  useEffect(()=> saveState({ desiredCI }), [desiredCI]);
  useEffect(()=> saveState({ mechanics }), [mechanics]);
  useEffect(()=> saveState({ edhrecWeight, ownedWeight, deckBudget, targetLands, targets }),
    [edhrecWeight, ownedWeight, deckBudget, targetLands, targets]);

  // ===== Collection handlers =====
  async function handleCollectionFiles(files) {
    const enriched = [];
    for (const f of files) {
      try {
        const map = await parseCollectionFile(f);
        enriched.push({ name: f.name, size: f.size, map });
      } catch (e) {
        console.error("parseCollectionFile", e);
      }
    }
    const nextFiles = [...uploadedFiles, ...enriched];
    setUploadedFiles(nextFiles);
    // fusion
    const merged = new Map();
    for (const file of nextFiles) {
      for (const [k, q] of file.map) merged.set(k, (merged.get(k) || 0) + q);
    }
    setOwnedMap(merged);
  }
  function removeFileByName(name) {
    const next = uploadedFiles.filter((f) => f.name !== name);
    setUploadedFiles(next);
    const merged = new Map();
    for (const file of next) {
      for (const [k, q] of file.map) merged.set(k, (merged.get(k) || 0) + q);
    }
    setOwnedMap(merged);
  }
  function clearCollection() {
    setUploadedFiles([]);
    setOwnedMap(new Map());
  }

  // ===== Progress helpers =====
  function startProgress() { setProgress(0); setProgressMsg("Initialisation…"); }
  function stepProgress(p, m) { setProgress(Math.max(0, Math.min(100, p))); if (m) setProgressMsg(m); }
  function endProgress() { setProgress(100); setProgressMsg("Finalisation…"); }

  // ===== Génération =====
  async function generateDeck() {
    setError("");
    setLoading(true);
    startProgress();
    try {
      let commander = selectedCommanderCard;
      if (commanderMode === "random" || !commander) {
        stepProgress(10, "Choix du commandant…");
        const q = `legal:commander (type:\\\"legendary creature\\\" or (type:planeswalker and o:\\\"can be your commander\\\") or type:background) ${identityToQuery(desiredCI)}`;
        const rnd = await sfRandom(q);
        commander = rnd;
        setChosenCommander(rnd?.name || "");
        setDesiredCI(getCI(rnd));
      }

      stepProgress(30, "Recherche du pool de cartes…");
      const baseQ = `-type:land legal:commander ${identityToQuery(getCI(commander))}`;
      const res = await sfSearch(`${baseQ} order:edhrec unique:prints`);
      const poolRaw = (res?.data || []).filter(isCommanderLegal);

      // Scoring (EDHREC / Owned / Budget)
      const owned = ownedMap || new Map();
      function scoreOf(c) {
        const edh = 1 - Math.min(100000, Number(c.edhrec_rank || 100000)) / 100000; // 0..1
        const have = owned.get((c.name || "").toLowerCase()) > 0 ? 1 : 0;            // 0/1
        const price = Number(c?.prices?.eur) || Number(c?.prices?.eur_foil) || 0;
        const budgetOk = deckBudget <= 0 ? 1 : (price <= deckBudget ? 1 : 0.3);
        return (edhrecWeight/100)*edh + (ownedWeight/100)*have + 0.2*budgetOk;
      }

      stepProgress(45, "Tri du pool…");
      const pool = [...poolRaw].sort((a,b)=> scoreOf(b)-scoreOf(a));

      // Équilibrage par rôles (atteindre minima)
      const want = { ramp:targets.ramp[0], draw:targets.draw[0], removal:targets.removal[0], wraths:targets.wraths[0] };
      const have = { ramp:0, draw:0, removal:0, wraths:0 };

      const pick = [];
      const seen = new Set();
      const keyOf = (c) => (c.name||"")+":"+(c.mana_cost||"");

      stepProgress(60, "Équilibrage vers les cibles…");
      for (const c of pool) {
        if (pick.length >= 30) break;
        const r = roleOf(c);
        if (r !== "other" && have[r] < want[r]) {
          const k = keyOf(c);
          if (seen.has(k)) continue;
          pick.push(c); seen.add(k); have[r]++;
        }
      }

      // Compléter jusqu'à 30
      stepProgress(72, "Complément de sélection…");
      for (const c of pool) {
        if (pick.length >= 30) break;
        const k = keyOf(c);
        if (seen.has(k)) continue;
        const price = Number(c?.prices?.eur) || Number(c?.prices?.eur_foil) || 0;
        if (deckBudget > 0 && price > deckBudget*1.5) continue;
        pick.push(c); seen.add(k);
      }

      const nonlands = pick.map(bundleCard);

      // Compteurs pour les indicateurs
      const counts = { ramp:0, draw:0, removal:0, wraths:0 };
      for (const c of nonlands) {
        const r = roleOf(c);
        if (counts[r] != null) counts[r] += 1;
      }
      setBalanceCounts(counts);

      // Manabase (staples + basiques) selon l'identité de couleur et le slider
      stepProgress(85, "Génération des terrains…");
      const lands = buildManabase(getCI(commander), targetLands);

      setDeck({ commander: bundleCard(commander), nonlands, lands });

      // Scroll vers le commandant (utile mobile)
      setTimeout(() => { commanderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
      endProgress();
    } catch (e) {
      console.error(e);
      notifyError(String(e.message || e));
    } finally {
      await sleep(300);
      setLoading(false);
    }
  }

  // ===== UI helpers =====
  const commanderDisplay = useMemo(() => {
    if (!deck?.commander) return null;
    const c = deck.commander;
    return (
      <div className="grid md:grid-cols-2 gap-4">
        {c.image && (
          <img src={c.image} alt={c.name} className="w-full rounded-xl object-cover" />
        )}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">{c.name}</h3>
          {c.mana_cost && (
            <div className="text-sm"><ManaCost cost={c.mana_cost} /></div>
          )}
          {c.oracle_en && (
            <div className="text-sm whitespace-pre-wrap opacity-90">{c.oracle_en}</div>
          )}
          <div className="text-sm opacity-80">Prix estimé : {priceEUR(c).toFixed(2)}€</div>
        </div>
      </div>
    );
  }, [deck]);

  // ===== Render =====
  return (
    <div className="min-h-screen p-4 md:p-6" style={{ color: "var(--text)", background: "var(--bg0)" }}>
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Commander Craft</h1>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={()=>navigator.clipboard.writeText(toText(deck))}>Copier</button>
          <button className="btn-primary" onClick={()=>downloadFile("deck.txt", toText(deck))}>TXT</button>
          <button className="btn-primary" onClick={()=>downloadFile("deck_moxfield.csv", toMoxfieldCSV(deck), "text/csv")}>Moxfield CSV</button>
          <button className="btn-primary" onClick={()=>downloadFile("deck_archidekt.csv", toArchidektCSV(deck), "text/csv")}>Archidekt CSV</button>
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
        </div>
      </header>

      {/* Zone paramètres */}
      <section className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="panel p-4 rounded-xl border">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Commandant</h2>
              <div className="flex items-center gap-3 text-sm opacity-80">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="cmode" value="select" checked={commanderMode === "select"} onChange={() => setCommanderMode("select")} />
                  Choisir
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="cmode" value="random" checked={commanderMode === "random"} onChange={() => setCommanderMode("random")} />
                  Aléatoire
                </label>
              </div>
            </div>

            {commanderMode === "select" && (
              <CommanderAutocomplete value={chosenCommander} onSelect={(name) => setChosenCommander(name)} />
            )}

            <div className="mt-4">
              <label className="block mb-1 text-sm muted">Couleurs du commandant (optionnel)</label>
              <ColorIdentityPicker value={desiredCI} onChange={setDesiredCI} />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <GenerateButton loading={loading} onClick={generateDeck} />
              {loading && <RefreshCcw className="h-4 w-4 animate-spin opacity-80" />}
            </div>

            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
          </div>

          <div className="panel p-4 rounded-xl border">
            <h3 className="font-semibold mb-3">Mécaniques</h3>
            <MechanicPicker tags={MECHANIC_TAGS} value={mechanics} max={3} onChange={setMechanics} />
          </div>

          <div className="panel p-4 rounded-xl border">
            <h3 className="font-semibold mb-3">Réglages</h3>
            <Sliders
              edhrecWeight={edhrecWeight} onEdhrec={setEdhrecWeight}
              ownedWeight={ownedWeight} onOwned={setOwnedWeight}
              deckBudget={deckBudget} onBudget={setDeckBudget}
              targetLands={targetLands} onLands={setTargetLands}
            />
          </div>

          <div className="panel p-4 rounded-xl border">
            <h3 className="font-semibold mb-3">Cibles d’équilibrage</h3>
            <TargetsEditor targets={targets} onChange={setTargets} />
          </div>
        </div>

        {/* Colonne latérale */}
        <aside className="space-y-4">
          <div className="panel p-4 rounded-xl border">
            <h3 className="font-semibold mb-2">Astuces</h3>
            <ul className="text-sm list-disc pl-5 opacity-90">
              <li>Choisis un commandant ou laisse le mode aléatoire.</li>
              <li>Ajoute ta collection pour favoriser les cartes que tu possèdes.</li>
              <li>Règle budget et mécaniques pour adapter la sélection.</li>
            </ul>
          </div>

          <div className="panel p-4 rounded-xl border">
            <h3 className="font-semibold mb-3">Collection personnelle</h3>
            <FileDrop onFiles={handleCollectionFiles} />
            {uploadedFiles.length > 0 && (
              <div className="mt-3 space-y-2">
                {uploadedFiles.map((f) => (
                  <div key={f.name} className="flex items-center justify-between text-sm">
                    <span className="opacity-90">{f.name}</span>
                    <button className="text-xs underline opacity-80" onClick={() => removeFileByName(f.name)}>Supprimer</button>
                  </div>
                ))}
                <button className="text-xs underline opacity-80" onClick={clearCollection}>Vider la collection</button>
              </div>
            )}
          </div>
        </aside>
      </section>

      {/* Résultats */}
      <section className="mt-8 space-y-6">
        {deck?.commander && (
          <div className="panel p-4 rounded-xl border">
            <h2 className="font-semibold mb-3">Commandant sélectionné</h2>
            <CommanderBlock ref={commanderRef} commander={deck.commander} />
          </div>
        )}

        {(deck?.nonlands?.length || deck?.lands?.length) ? (
          <div className="panel p-4 rounded-xl border">
            <h2 className="font-semibold mb-3">Statistiques du deck</h2>
            <StatsBlock deck={deck} ownedMap={ownedMap} />
            <div className="mt-4">
              <BalanceIndicators counts={balanceCounts} targets={targets} />
            </div>
          </div>
        ) : null}

        {deck?.nonlands?.length > 0 && (
          <div className="panel p-4 rounded-xl border">
            <h2 className="font-semibold mb-3">Sorts non-terrains</h2>
            <NonlandGroups cards={deck.nonlands} onOpen={(c)=>{ setModalCard(c); setOpenModal(true); }} />
          </div>
        )}

        {deck?.lands?.length > 0 && (
          <div className="panel p-4 rounded-xl border">
            <h2 className="font-semibold mb-3">Terrains ({deck.lands.length})</h2>
            <LandsGrid lands={deck.lands} />
          </div>
        )}
      </section>

      {/* Modales & Toast */}
      <CardModal open={openModal} card={modalCard} owned={false} onClose={() => setOpenModal(false)} />
      <LoadingModal open={loading} progress={progress} message={progressMsg} />
      <Toast open={toast.open} message={toast.msg} onClose={()=> setToast({ open:false, msg:"" })} />
    </div>
  );
}
