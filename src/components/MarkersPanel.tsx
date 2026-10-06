import { useStore, set, updateMarker, MARKER_COUNT } from "../store";
import { FreqInput, Section, Select } from "./inputs";
import { search, nearestIndex, type SearchMode } from "../lib/analysis";
import { FORMAT_BY_ID, groupDelay, traceValues } from "../lib/formats";
import { restartIfRunning, recompute } from "../controller";
import { traceData } from "../display";

const SEARCH: [SearchMode | "-", string][] = [["-", "No tracking"], ["max", "Max"], ["min", "Min"], ["peak_left", "Peak ◀"], ["peak_right", "Peak ▶"], ["valley_left", "Valley ◀"], ["valley_right", "Valley ▶"]];

export function MarkersPanel() {
  const s = useStore();
  const m = s.markers[s.activeMarker];
  const d = s.data;

  const doSearch = (mode: SearchMode) => {
    const t = s.traces[m.trace] ?? s.traces[0];
    const td = traceData(s, t);
    if (!td.length) return;
    const fmt = FORMAT_BY_ID[t.format].circular ? "logmag" : t.format;
    const i = search(traceValues(td, t.channel, fmt), mode, nearestIndex(td, m.f));
    updateMarker(s.activeMarker, { f: td[i].f, enabled: true });
  };

  const op = (kind: "start" | "stop" | "center" | "span" | "edelay") => {
    const f = m.f;
    if (!f) return;
    if (kind === "start") set({ start: Math.min(f, s.stop - 1) });
    else if (kind === "stop") set({ stop: Math.max(f, s.start + 1) });
    else if (kind === "center") { const sp = s.stop - s.start; set({ start: Math.max(10e3, f - sp / 2), stop: f + sp / 2 }); }
    else if (kind === "span") {
      // Span = distance to the delta reference marker (or keep centre and use ±|f − centre|)
      const ref = s.deltaRef != null ? s.markers[s.deltaRef].f : (s.start + s.stop) / 2;
      const a = Math.min(f, ref), b = Math.max(f, ref);
      if (b - a > 0) set({ start: a, stop: b });
    } else if (kind === "edelay") {
      const t = s.traces[m.trace] ?? s.traces[0];
      const gd = groupDelay(d, t.channel)[nearestIndex(d, f)];
      set({ correction: { ...s.correction, [t.channel === "s11" ? "s11Delay" : "s21Delay"]: (t.channel === "s11" ? s.correction.s11Delay : s.correction.s21Delay) + gd } });
      recompute();
      return;
    }
    restartIfRunning();
  };

  return (
    <div>
      <Section title="Markers">
        <div className="grid4">
          {Array.from({ length: MARKER_COUNT }, (_, i) => (
            <button key={i} className={"small" + (i === s.activeMarker ? " on" : "")} style={{ opacity: s.markers[i].enabled ? 1 : 0.55 }}
              onClick={() => { set({ activeMarker: i }); if (!s.markers[i].enabled) updateMarker(i, { enabled: true }); }}>
              {s.deltaRef === i ? "Δ" : "M"}{i + 1}
            </button>
          ))}
        </div>
      </Section>
      <Section title={`Marker ${s.activeMarker + 1}`}>
        <div className="row">
          <label>Enabled</label>
          <input type="checkbox" checked={m.enabled} onChange={(e) => updateMarker(s.activeMarker, { enabled: e.target.checked })} aria-label="Marker enabled" />
        </div>
        <div className="row"><label>Frequency</label><FreqInput value={m.f} onChange={(v) => updateMarker(s.activeMarker, { f: v, tracking: null, enabled: true })} ariaLabel="Marker frequency" /></div>
        <div className="row">
          <label>Search on</label>
          <Select value={m.trace} ariaLabel="Marker trace" options={s.traces.map((t, i) => [i, `TR${i + 1} ${t.channel.toUpperCase()} ${FORMAT_BY_ID[t.format].label}`] as [number, string])} onChange={(v) => updateMarker(s.activeMarker, { trace: v })} />
        </div>
        <div className="row">
          <label>Tracking</label>
          <Select value={m.tracking ?? "-"} ariaLabel="Tracking" options={SEARCH} onChange={(v) => { updateMarker(s.activeMarker, { tracking: v === "-" ? null : v }); setTimeout(recompute, 0); }} />
        </div>
        <div className="row">
          <label>Search</label>
          <button className="small" onClick={() => doSearch("max")}>Max</button>
          <button className="small" onClick={() => doSearch("min")}>Min</button>
          <button className="small" onClick={() => doSearch("peak_left")}>◀ Peak</button>
          <button className="small" onClick={() => doSearch("peak_right")}>Peak ▶</button>
          <button className="small" onClick={() => doSearch("valley_left")}>◀ Valley</button>
          <button className="small" onClick={() => doSearch("valley_right")}>Valley ▶</button>
        </div>
        <div className="row">
          <label>Step</label>
          <button className="small" onClick={() => { const i = nearestIndex(d, m.f); if (d[i - 1]) updateMarker(s.activeMarker, { f: d[i - 1].f, tracking: null }); }}>◀ point</button>
          <button className="small" onClick={() => { const i = nearestIndex(d, m.f); if (d[i + 1]) updateMarker(s.activeMarker, { f: d[i + 1].f, tracking: null }); }}>point ▶</button>
        </div>
      </Section>
      <Section title="Operations">
        <div className="grid3">
          <button className="small" onClick={() => op("start")}>→ Start</button>
          <button className="small" onClick={() => op("stop")}>→ Stop</button>
          <button className="small" onClick={() => op("center")}>→ Center</button>
          <button className="small" onClick={() => op("span")} title="Span between this marker and the delta reference (or the centre)">→ Span</button>
          <button className="small" onClick={() => op("edelay")} title="Add the group delay at the marker to the electrical delay">→ E-delay</button>
        </div>
      </Section>
      <Section title="Delta">
        <div className="row">
          <button className={"small" + (s.deltaRef === s.activeMarker ? " on" : "")} onClick={() => set({ deltaRef: s.deltaRef === s.activeMarker ? null : s.activeMarker })}>
            {s.deltaRef === s.activeMarker ? "Clear reference" : `Use M${s.activeMarker + 1} as Δ reference`}
          </button>
          <button className="small danger" onClick={() => set({ markers: s.markers.map((x) => ({ ...x, enabled: false })), deltaRef: null })}>All off</button>
        </div>
      </Section>
    </div>
  );
}
