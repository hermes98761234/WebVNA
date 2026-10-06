import { useEffect, useRef } from "react";
import { useStore, set } from "../store";
import { useT } from "../i18n";

export function LogPanel() {
  const log = useStore((s) => s.log);
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  return (
    <div className="box">
      <h3>{t("Log")} <button className="small" onClick={() => set({ log: [] })}>{t("Clear")}</button></h3>
      <div className="log" ref={ref} role="log" aria-live="polite">
        {log.map((e, i) => (
          <div key={i} className={e.level}>{new Date(e.t).toLocaleTimeString()} {e.msg}</div>
        ))}
      </div>
    </div>
  );
}
