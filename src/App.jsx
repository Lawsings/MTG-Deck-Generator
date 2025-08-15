import React, { useEffect, useMemo, useState } from "react";

// UI (extraits passes 1→4)
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
import { RefreshCcw, Sparkles } from "lucide-react";

// Hooks
import useCommanderResolution from "./hooks/useCommanderResolution";

// Utils cartes
import {
  identityToQuery,
  isCommanderLegal,
  getCI,
  priceEUR,
  primaryTypeLabel,
  bundleCard,
} from "./utils/cards";

// API Scryfall
import { search as sfSearch, random as sfRandom } from "./api/scryfall";

// Collection utils
import { parseCollectionFile } from "./utils/collection";

// =========================
// Constantes légères
// =========================
const MECHANIC_TAGS = ["blink", "treasure", "sacrifice", "lifegain", "tokens", "reanimation"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  // Thème
  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" ? localStorage.getItem("theme") || "dark" : "dark"));
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  // États principaux
  const [commanderMode, setCommanderMode] = useState("select"); // "select" | "random"
  const [chosenCommander, setChosenCommander] = useState("");
  const [desiredCI, setDesiredCI] = useState("");
  const [mechanics, setMechanics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Sliders / options
  const [edhrecWeight, setEdhrecWeight] = useState(60);
  const [ownedWeight, setOwnedWeight] = useState(40);
  const [deckBudget, setDeckBudget] = useState(200);
  const [targetLands, setTargetLands] = useState(36);
  const [targets, setTargets] = useState({ ramp: [8, 12], draw: [6, 10], removal: [6, 10], wraths: [2, 4] });

  // Progress (modale)
  const [progress, setProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");

  // Collection
  const [uploadedFiles, setUploadedFiles] = useState([]); // {name, size, map}
  const [ownedMap, setOwnedMap] = useState(new Map());

  // Résultat deck
  const [deck, setDeck] = useState({ commander: null, nonlands: [], lands: [] });

  // Modale carte
  const [openModal, setOpenModal] = useState(false);
  const [modalCard, setModalCard] = useState(null);

  // Résolution du commandant
  const selectedCommanderCard = useCommanderResolution(
    commanderMode,
    chosenCommander,
    setDesiredCI,
    setError
  );

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

  // ===== Génération (démo) =====
  async function generateDeck() {
    setError("");
    setLoading(true);
    startProgress();
    try {
      let commander = selectedCommanderCard;
      if (commanderMode === "random" || !commander) {
        stepProgress(10, "Choix du commandant…");
        const q = `legal:commander (type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background) ${identityToQuery(desiredCI)}`;
        const rnd = await sfRandom(q);
        commander = rnd;
        setChosenCommander(rnd?.name || "");
        setDesiredCI(getCI(rnd));
      }

      stepProgress(30, "Recherche du pool de cartes…");
      const baseQ = `-type:land legal:commander ${identityToQuery(getCI(commander))}`;
      const res = await sfSearch(`${baseQ} order:edhrec unique:prints`);
      const pool = (res?.data || []).slice(0, 120).filter(isCommanderLegal);

      stepProgress(55, "Filtrage par mécaniques et budget…");
      const mechSet = new Set((mechanics || []).map((s) => s.toLowerCase()));
      const filtered = pool.filter((c) => {
        if (deckBudget > 0 && priceEUR(c) > deckBudget) return false;
        if (mechSet.size) {
          const text = (c.oracle_text || "").toLowerCase();
          let ok = false;
          for (const m of mechSet) { if (text.includes(m)) { ok = true; break; } }
          if (!ok) return false;
        }
        return true;
      });

      stepProgress(75, "Sélection et équilibrage de base…");
      // Démo : on prend 30 sorts ; l’équilibrage fin par cibles sera en Passe 5
      const chosen = filtered.slice(0, 30);
      const nonlands = chosen.map((c) => bundleCard(c));
      const lands = []; // TODO: utiliser targetLands et targets en Passe 5

      setDeck({ commander: bundleCard(commander), nonlands, lands });
      endProgress();
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
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

  function openCard(c) { setModalCard(c); setOpenModal(true); }

  // ===== Render =====
  return (
    <div className="min-h-screen p-4 md:p-6" style={{ color: "var(--text)", background: "var(--bg0)" }}>
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Commander Craft</h1>
        <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
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
            {commanderDisplay}
          </div>
        )}

        {deck?.nonlands?.length > 0 && (
          <div className="panel p-4 rounded-xl border">
            <h2 className="font-semibold mb-3">Sorts non-terrains</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deck.nonlands.map((c) => (
                <button key={c.name + c.mana_cost} className="text-left rounded-lg p-3 border hover:opacity-90" style={{ background: "var(--bg2)", borderColor: "var(--border)" }} onClick={() => { setModalCard(c); setOpenModal(true); }}>
                  <div className="font-medium mb-1 truncate">{c.name}</div>
                  {c.mana_cost && <div className="text-xs"><ManaCost cost={c.mana_cost} /></div>}
                  <div className="text-[11px] opacity-80 truncate">{c.type_line}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Modales */}
      <CardModal open={openModal} card={modalCard} owned={false} onClose={() => setOpenModal(false)} />
      <LoadingModal open={loading} progress={progress} message={progressMsg} />
    </div>
  );
}
