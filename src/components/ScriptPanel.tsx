import { useState } from "react";
import { Section } from "./inputs";
import { useT } from "../i18n";
import { EXAMPLE_SCRIPT, SCRIPT_KEY, formatValue, runScript } from "../script";

const load = () => { try { return localStorage.getItem(SCRIPT_KEY) ?? EXAMPLE_SCRIPT; } catch { return EXAMPLE_SCRIPT; } };

export function ScriptPanel() {
  const t = useT();
  const [code, setCode] = useState(load);
  const [out, setOut] = useState<{ text: string; error?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  const change = (v: string) => {
    setCode(v);
    try { localStorage.setItem(SCRIPT_KEY, v); } catch { /* storage unavailable */ }
  };
  const run = async () => {
    setBusy(true);
    setOut([]);
    const push = (text: string, error = false) => setOut((o) => [...o, { text, error }]);
    const r = await runScript(code, window.webvna, (l) => push(l));
    if (r.ok) { if (r.value !== undefined) push("→ " + formatValue(r.value)); }
    else push(r.error ?? "Error", true);
    setBusy(false);
  };

  return (
    <div>
      <Section title="Script" right={<span className="row" style={{ margin: 0 }}>
        <button className="small" onClick={() => change(EXAMPLE_SCRIPT)}>{t("Example")}</button>
        <button className="primary small" disabled={busy} onClick={() => void run()}>{t("Run script")}</button>
      </span>}>
        <textarea className="script-editor" value={code} spellCheck={false} aria-label={t("Script")} onChange={(e) => change(e.target.value)} />
        <p className="hint">{t("The script runs here in your browser, as an async function with webvna and print() in scope. Nothing is uploaded. Only run code you trust: it can control the connected device. API: see \"Scripting API\" in the README, or type webvna in the browser console.")}</p>
        <div className="script-out" role="log" aria-live="polite" aria-label={t("Script output")}>
          {out.length === 0 ? <span className="hint">{t("Output appears here.")}</span> : out.map((l, i) => <div key={i} className={l.error ? "error" : ""}>{l.text}</div>)}
        </div>
      </Section>
    </div>
  );
}
