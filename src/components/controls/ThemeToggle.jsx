import { Sun, Moon } from "lucide-react";

export default function ThemeToggle({ theme, onToggle }) {
  const isLight = theme === "light";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={isLight ? "Basculer en mode sombre" : "Basculer en mode clair"}
      onClick={onToggle}
      className="relative inline-flex h-9 w-16 items-center rounded-full border border-[var(--border)]"
      style={{ background: "var(--bg2)" }}
    >
      {/* Icônes gauche/droite */}
      <Moon
        className={`absolute left-2 h-4 w-4 transition-opacity duration-300 ${
          isLight ? "opacity-0" : "opacity-100"
        }`}
      />
      <Sun
        className={`absolute right-2 h-4 w-4 transition-opacity duration-300 ${
          isLight ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Curseur */}
      <span
        className={`pointer-events-none inline-block h-7 w-7 rounded-full shadow-sm transform transition-transform duration-300`}
        style={{
          background: "var(--panel-strong)",
          border: "1px solid var(--border)",
          transform: isLight ? "translateX(32px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}
