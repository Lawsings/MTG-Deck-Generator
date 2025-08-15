import React, { useEffect, useMemo, useRef, useState } from "react";

// UI
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

// Utils cartes (pour affichage / prix)
import {
  identityToQuery,   // utilisé par App pour afficher/filtrer dans l’UI si besoin
  isCommanderLegal,
  getCI,
  priceEUR,
  bundleCard,
  roleOf,
} from "./utils/cards";

// Exports (TXT / CSV Moxfield / CSV Archidekt)
import { toText, toMoxfieldCSV, toArchidektCSV, downloadFile } from "./utils/exports";

// Storage (persistance locale)
import { saveState, loadState } from "./utils/storage";

// Génération externalisée
import { generate as buildDeck } from "./utils/deckBuilder";

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

  // Résolution du commandant (pour mode "select")
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

  // ===== Génération (via deckBuilder.generate) =====
  async function generateDeck() {
    setError("");
    setLoading(true);
    setProgress(0);
    setProgressMsg("Initialisation…");

    try {
      const { deck: built, counts } = await buildDeck({
        commanderMode,
        chosenCommander,
        desiredCI,
        mechanics,
        edhrecWeight,
        ownedWeight,
        deckBudget,
        targetLands,
        targets,
        ownedMap,
        progress: (p, msg) => { setProgress(p); if (msg) setProgressMsg(msg); }
      });

      setDeck(built);
      setBalanceCounts(counts);

      // Scroll vers le commandant (utile mobile)
      setTimeout(() => { commanderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
      setProgress(100);
      setProgressMsg("Finalisation…");
    } catch (e) {
      console.error(e);
      notifyError(String(e.message || e));
    } finally {
      await sleep(300);
      setLoading(false);
    }
  }

  // ===== UI helpers (aperçu commandant dans la page) =====
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
