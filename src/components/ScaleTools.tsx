import { useEffect, type RefObject } from "react";
import { useStore, set, updateTrace, get } from "../store";
import { FORMAT_BY_ID } from "../lib/formats";
import type { Series } from "../display";
import type { TraceScale } from "../store";

/** Next value in the 1-2-5 sequence up (dir = 1) or down (dir = −1). */
export function stepScale(v: number, dir: 1 | -1): number {
  const e = Math.floor(Math.log10(v));
  const m = +(v / 10 ** e).toPrecision(6);
  const seq = [1, 2, 5, 10];
  if (dir > 0) { const n = seq.find((x) => x > m + 1e-9) ?? 10; return n * 10 ** e; }
  const n = [...seq].reverse().find((x) => x < m - 1e-9);
  return n ? n * 10 ** e : 5 * 10 ** (e - 1);
}

/** The scale currently on screen for a trace (the computed one when auto is on). */
function shown(series: Series[], ti: number): TraceScale | null {
  return series.find((s) => s.traceIndex === ti && s.primary)?.scale ?? null;
}

export function adjustScale(series: Series[], ti: number, kind: "zoomIn" | "zoomOut" | "up" | "down" | "auto") {
  const t = get().traces[ti];
  if (!t) return;
  if (kind === "auto") { updateTrace(ti, { scale: { ...t.scale, auto: !t.scale.auto } }); return; }
  const cur = shown(series, ti) ?? t.scale;
  let { perDiv, ref } = cur;
  const refPos = cur.refPos;
  if (kind === "zoomIn") perDiv = stepScale(perDiv, -1);
  else if (kind === "zoomOut") perDiv = stepScale(perDiv, 1);
  else ref += (kind === "up" ? -1 : 1) * perDiv; // "up" moves the trace up on screen
  updateTrace(ti, { scale: { auto: false, perDiv, ref, refPos } });
}

/** On-chart scale controls for the active rectangular trace, plus mouse-wheel zoom on the chart. */
export function ScaleTools({ series, target }: { series: Series[]; target: RefObject<HTMLDivElement | null> }) {
  const traces = useStore((s) => s.traces);
  const active = useStore((s) => s.activeTrace);
  const rect = traces.map((t, i) => ({ t, i })).filter(({ t }) => t.enabled && !FORMAT_BY_ID[t.format].circular);
  const cur = rect.find((x) => x.i === active) ?? rect[0];

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!cur || e.ctrlKey) return;
      e.preventDefault();
      const down = e.deltaY > 0;
      adjustScale(series, cur.i, e.shiftKey ? (down ? "down" : "up") : down ? "zoomOut" : "zoomIn");
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [series, cur, target]);

  if (!cur) return null;
  const { t, i } = cur;
  return (
    <div className="scale-tools" role="group" aria-label="Trace scale">
      <select aria-label="Trace to scale" value={i} onChange={(e) => set({ activeTrace: +e.target.value })} style={{ color: t.color }}>
        {rect.map(({ t: x, i: k }) => <option key={k} value={k}>TR{k + 1} {FORMAT_BY_ID[x.format].label}</option>)}
      </select>
      <button className="small" title="Zoom out (scale/div up) · wheel down" onClick={() => adjustScale(series, i, "zoomOut")}>−</button>
      <button className="small" title="Zoom in (scale/div down) · wheel up" onClick={() => adjustScale(series, i, "zoomIn")}>+</button>
      <button className="small" title="Move trace up · Shift+wheel" onClick={() => adjustScale(series, i, "up")}>▲</button>
      <button className="small" title="Move trace down · Shift+wheel" onClick={() => adjustScale(series, i, "down")}>▼</button>
      <button className={"small" + (t.scale.auto ? " on" : "")} title="Auto scale" onClick={() => adjustScale(series, i, "auto")}>Auto</button>
    </div>
  );
}
