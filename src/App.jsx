import React, { useEffect, useMemo, useRef, useState } from "react";

// UI components (extraits aux passes 1 & 2)
import ThemeToggle from "./components/controls/ThemeToggle";
import ColorIdentityPicker from "./components/controls/ColorIdentityPicker";
import ManaCost from "./components/cards/ManaCost";
import CardModal from "./components/cards/CardModal";
import FileDrop from "./components/collection/FileDrop";
import CommanderAutocomplete from "./components/controls/CommanderAutocomplete";
import { RefreshCcw, Shuffle, Copy, Download, Upload, Settings2, Info, Sparkles, Trash2 } from "lucide-react";

// Hooks
import useCommanderResolution from "./hooks/useCommanderResolution";

// Utils cartes (passe 3)
import {
  identityToQuery,
  nameOf,
  oracle,
  isCommanderLegal,
  getCI,
  unionCI,
  priceEUR,
  edhrecScore,
  distinctByName,
  primaryTypeLabel,
  bundleCard,
} from "./utils/cards";

// API Scryfall
import { search as sfSearch, random as sfRandom } from "./api/scryfall";

// Collection utils
import { parseCollectionFile } from "./utils/collection";

// -----------------------------
// Constantes UI/Metier légères
// -----------------------------
const COLORS = ["W", "U", "B", "R", "G", "C"]; // utilisé pour CI / filtres simples

const MECHANIC_TAGS = [
  "blink",
  "treasure",
  "sacrifice",
  "lifegain",
  "tokens",
  "reanimation",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------
// Composant principal
// -----------------------------
export default function App() {
  // Thème
  const [theme, setTheme] = useState(() => {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("theme") || "dark";
    }
    return "dark";
  });
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch {}
  }, [theme]);

  // États principaux
  const [commanderMode, setCommanderMode] = useState("select"); // "select" | "random"
  const [chosenCommander, setChosenCommander] = useState("");
  const [desiredCI, setDesiredCI] = useState("");
  const [mechanics, setMechanics] = useState([]); // tags
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Collection utilisateur
  const [uploadedFiles, setUploadedFiles] = useState([]); // {name, size, map}
  const [ownedMap, setOwnedMap] = useState(new Map()); // Map(nameLower -> qty)

  // Résultat deck (très simplifié ici)
  const [deck, setDeck] = useState({
    commander: null,
    nonlands: [],
    lands: [],
  });

  // Modale carte
  const [openModal, setOpenModal] = useState(false);
  const [modalCard, setModalCard] = useState(null);

  // Résolution du commandant sélectionné (passe 3 via hook)
  const selectedCommanderCard = useCommanderResolution(
    commanderMode,
    chosenCommander,
    setDesiredCI,
    setError
  );

  // -----------------------------
  // Gestion collection (drag&drop)
  // -----------------------------
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
    // fusion des maps
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

  // -----------------------------
  // Génération : DEMO minimaliste
  // -----------------------------
  async function generateDeck() {
    setError("");
    setLoading(true);
    try {
      let commander = selectedCommanderCard;
      if (commanderMode === "random" || !commander) {
        const q = `legal:commander (type:\"legendary creature\" or (type:planeswalker and o:\"can be your commander\") or type:background) ${identityToQuery(desiredCI)}`;
        const rnd = await sfRandom(q);
        commander = rnd;
        setChosenCommander(rnd?.name || "");
        setDesiredCI(getCI(rnd));
      }

      // petite pool de sorts basée sur l'identité (DEMO: 20 cartes max)
      const baseQ = `-type:land legal:commander ${identityToQuery(getCI(commander))}`;
      const res = await sfSearch(`${baseQ} order:edhrec unique:prints`);
      const pool = (res?.data || []).slice(0, 20).filter(isCommanderLegal);

      const nonlands = pool.map((c) => bundleCard(c));
      const lands = []; // on garde simple pour cette version

      setDeck({ commander: bundleCard(commander), nonlands, lands });
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // UI Helpers
  // -----------------------------
  function openCard(c) {
    setModalCard(c);
    setOpenModal(true);
  }

  const commanderDisplay = useMemo(() => {
    if (!deck?.commander) return null;
    const c = deck.commander;
    return (
      <div className="grid md:grid-cols-2 gap-4">
        {c.image && (
          <img
            src={c.image}
            alt={c.name}
            className="w-full rounded-xl object-cover"
          />
        )}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">{c.name}</h3>
          {c.mana_cost && (
            <div className="text-sm">
              <ManaCost cost={c.mana_cost} />
            </div>
          )}
          {c.oracle_en && (
            <div className="text-sm whitespace-pre-wrap opacity-90">
              {c.oracle_en}
            </div>
          )}
          <div className="text-sm opacity-80">
            Prix estimé : {priceEUR(c).toFixed(2)}€
          </div>
        </div>
      </div>
    );
  }, [deck]);

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <div className="min-h-screen p-4 md:p-6" style={{ color: "var(--text)", background: "var(--bg0)" }}>
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Commander Craft</h1>
        <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
      </header>

      {/* Paramètres principaux */}
      <section className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="panel p-4 rounded-xl border" style={{ background: "var(--bg1)", borderColor: "var(--border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Commandant</h2>
              <div className="flex items-center gap-2 text-sm opacity-80">
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
              <CommanderAutocomplete
                value={chosenCommander}
                onSelect={(name) => setChosenCommander(name)}
              />
            )}

            <div className="mt-4">
              <button className="btn-primary inline-flex items-center gap-2" onClick={generateDeck} disabled={loading}>
                {loading ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "Génération…" : "Générer un deck"}
              </button>
            </div>

            {error && (
              <div className="mt-3 text-sm text-red-400">{error}</div>
            )}
          </div>

          {/* Collection personnelle */}
          <div className="panel p-4 rounded-xl border" style={{ background: "var(--bg1)", borderColor: "var(--border)" }}>
            <h2 className="font-semibold mb-3">Collection personnelle</h2>
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
        </div>

        {/* Résumé / Aide */}
        <aside className="space-y-4">
          <div className="panel p-4 rounded-xl border" style={{ background: "var(--bg1)", borderColor: "var(--border)" }}>
            <h3 className="font-semibold mb-2">Astuces</h3>
            <ul className="text-sm list-disc pl-5 opacity-90">
              <li>Choisis un commandant ou laisse le mode aléatoire.</li>
              <li>Ajoute ta collection pour favoriser les cartes que tu possèdes.</li>
              <li>Le générateur propose une sélection de base (démo).</li>
            </ul>
          </div>
        </aside>
      </section>

      {/* Résultats */}
      <section className="mt-8 space-y-6">
        {deck?.commander && (
          <div className="panel p-4 rounded-xl border" style={{ background: "var(--bg1)", borderColor: "var(--border)" }}>
            <h2 className="font-semibold mb-3">Commandant sélectionné</h2>
            {commanderDisplay}
          </div>
        )}

        {deck?.nonlands?.length > 0 && (
          <div className="panel p-4 rounded-xl border" style={{ background: "var(--bg1)", borderColor: "var(--border)" }}>
            <h2 className="font-semibold mb-3">Sorts non-terrains</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {deck.nonlands.map((c) => (
                <button key={c.name + c.mana_cost} className="text-left rounded-lg p-3 border hover:opacity-90" style={{ background: "var(--bg2)", borderColor: "var(--border)" }} onClick={() => openCard(c)}>
                  <div className="font-medium mb-1 truncate">{c.name}</div>
                  {c.mana_cost && (
                    <div className="text-xs"><ManaCost cost={c.mana_cost} /></div>
                  )}
                  <div className="text-[11px] opacity-80 truncate">{c.type_line}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Modale carte */}
      <CardModal open={openModal} card={modalCard} owned={false} onClose={() => setOpenModal(false)} />
    </div>
  );
}
