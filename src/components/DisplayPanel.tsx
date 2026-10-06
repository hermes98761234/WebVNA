import { useStore, set, updateTrace, setTraceFormat, MEMORY_SLOTS, type MemorySlot } from "../store";
import { FORMATS, FORMAT_BY_ID } from "../lib/formats";
import { Check, Num, Section, Select, Field, SIInput } from "./inputs";
import { storeMemory, clearMemory } from "../controller";
import { rectSeries } from "../display";
import type { TdrMode, TdrWindow } from "../lib/tdr";

export function DisplayPanel() {
  const s = useStore();
  const t = s.traces[s.activeTrace];
  const fd = FORMAT_BY_ID[t.format];
  const autoNow = () => {
    const se = rectSeries(s).series.find((x) => x.traceIndex === s.activeTrace && x.primary);
    if (se) updateTrace(s.activeTrace, { scale: { ...se.scale, auto: false } });
  };

  return (
    <div>
      <Section title="Traces">
        {s.traces.map((tr, i) => (
          <div key={i} className="row trace-row" style={{ background: i === s.activeTrace ? "var(--panel2)" : undefined, borderRadius: 6, padding: "2px 4px" }}>
            <input type="checkbox" checked={tr.enabled} onChange={(e) => updateTrace(i, { enabled: e.target.checked })} aria-label={`Trace ${i + 1} on`} />
            <button className={"small" + (i === s.activeTrace ? " on" : "")} onClick={() => set({ activeTrace: i })}>TR{i + 1}</button>
            <Select value={tr.channel} options={[["s11", "S11"], ["s21", "S21"]]} onChange={(v) => updateTrace(i, { channel: v })} ariaLabel={`Trace ${i + 1} channel`} />
            <Select className="fmt" value={tr.format} options={FORMATS.map((f) => [f.id, f.label] as [typeof f.id, string])} onChange={(v) => setTraceFormat(i, v)} ariaLabel={`Trace ${i + 1} format`} />
            <input type="color" value={tr.color} onChange={(e) => updateTrace(i, { color: e.target.value })} aria-label={`Trace ${i + 1} colour`} />
          </div>
        ))}
      </Section>

      {!fd.circular && (
        <Section title={`Scale — TR${s.activeTrace + 1}`}>
          <div className="row">
            <Check checked={t.scale.auto} onChange={(v) => (v ? updateTrace(s.activeTrace, { scale: { ...t.scale, auto: true } }) : autoNow())}>Auto scale</Check>
            <button className="small" onClick={autoNow}>Auto once</button>
            <button className="small" onClick={() => setTraceFormat(s.activeTrace, t.format)}>Default</button>
          </div>
          <div className="grid3">
            <Field label={`Scale/div ${fd.unit}`}><SIInput value={t.scale.perDiv} onChange={(v) => v > 0 && updateTrace(s.activeTrace, { scale: { ...t.scale, perDiv: v, auto: false } })} ariaLabel="Scale per division" /></Field>
            <Field label={`Ref value ${fd.unit}`}><SIInput value={t.scale.ref} onChange={(v) => updateTrace(s.activeTrace, { scale: { ...t.scale, ref: v, auto: false } })} ariaLabel="Reference value" /></Field>
            <Field label="Ref position (div)"><Num value={t.scale.refPos} min={0} max={8} step={1} onChange={(v) => updateTrace(s.activeTrace, { scale: { ...t.scale, refPos: v, auto: false } })} ariaLabel="Reference position" /></Field>
          </div>
          <p className="hint">Double-click the chart to auto-scale all traces.</p>
        </Section>
      )}

      <Section title="Memory (stored traces)">
        <div className="grid4">
          {MEMORY_SLOTS.map((m) => (
            <div key={m} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button className="small" onClick={() => storeMemory(m)} title={`Store current data in memory ${m}`}>Store {m}</button>
              <button className="small" disabled={!s.memories[m]} onClick={() => clearMemory(m)}>Clear {m}</button>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <label>TR{s.activeTrace + 1} shows</label>
          <Select value={t.memory ?? "-"} ariaLabel="Memory overlay"
            options={[["-", "No memory"], ...MEMORY_SLOTS.filter((m) => s.memories[m]).map((m) => [m, `Memory ${m}`] as [string, string])]}
            onChange={(v) => updateTrace(s.activeTrace, { memory: v === "-" ? null : (v as MemorySlot), math: v === "-" ? "off" : t.math })} />
          <Select value={t.math} ariaLabel="Trace math" options={[["off", "Data + memory"], ["subtract", "Data / memory"]]}
            onChange={(v) => updateTrace(s.activeTrace, { math: t.memory ? v : "off" })} />
        </div>
      </Section>

      <Section title="Reference files">
        {s.refs.length === 0 && <p className="hint">Import .s1p/.s2p files on the Files tab to overlay them on the active trace.</p>}
        {s.refs.map((r, i) => (
          <div key={i} className="row">
            <input type="checkbox" checked={r.visible} onChange={(e) => set({ refs: s.refs.map((x, k) => (k === i ? { ...x, visible: e.target.checked } : x)) })} aria-label={`Show ${r.name}`} />
            <input type="color" value={r.color} onChange={(e) => set({ refs: s.refs.map((x, k) => (k === i ? { ...x, color: e.target.value } : x)) })} aria-label={`${r.name} colour`} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={r.name}>{r.name}</span>
            <button className="small danger" onClick={() => set({ refs: s.refs.filter((_, k) => k !== i) })}>✕</button>
          </div>
        ))}
      </Section>

      <Section title="Time domain (TDR / DTF)">
        <Check checked={s.tdr.enabled} onChange={(v) => set({ tdr: { ...s.tdr, enabled: v } })}>Transform rectangular traces to time domain</Check>
        <div className="grid2" style={{ marginTop: 6 }}>
          <Field label="Mode">
            <Select value={s.tdr.mode} ariaLabel="Transform mode" options={[["lowpass_impulse", "Low-pass impulse"], ["lowpass_step", "Low-pass step"], ["bandpass", "Band-pass"]] as [TdrMode, string][]}
              onChange={(v) => set({ tdr: { ...s.tdr, mode: v } })} />
          </Field>
          <Field label="Window">
            <Select value={s.tdr.window} ariaLabel="Window" options={[["minimum", "Minimum (rect)"], ["normal", "Normal (Kaiser 6)"], ["maximum", "Maximum (Kaiser 13)"]] as [TdrWindow, string][]}
              onChange={(v) => set({ tdr: { ...s.tdr, window: v } })} />
          </Field>
          <Field label="Velocity factor"><Num value={s.tdr.velocityFactor} min={0.1} max={1} step={0.01} onChange={(v) => set({ tdr: { ...s.tdr, velocityFactor: v } })} /></Field>
          <Field label="Max distance (m, 0 = all)"><Num value={s.tdr.maxDistance} min={0} step={1} onChange={(v) => set({ tdr: { ...s.tdr, maxDistance: v } })} /></Field>
          <Field label="X axis">
            <Select value={s.tdr.xAxis} ariaLabel="X axis" options={[["distance", "Distance"], ["time", "Time"]]} onChange={(v) => set({ tdr: { ...s.tdr, xAxis: v } })} />
          </Field>
          <Field label="Y axis">
            <Select value={s.tdr.yAxis} ariaLabel="Y axis" options={[["linear", "Linear ρ"], ["db", "dB"], ["impedance", "Impedance (step)"]]} onChange={(v) => set({ tdr: { ...s.tdr, yAxis: v } })} />
          </Field>
        </div>
        <p className="hint">Low-pass modes need a sweep that starts near 0 Hz with evenly spaced points (e.g. 50 kHz – 1 GHz); the data is resampled onto a harmonic grid.</p>
      </Section>

      <Section title="Charts">
        <Check checked={s.showRect} onChange={(v) => set({ showRect: v })}>Rectangular chart</Check>{" "}
        <Check checked={s.showSmith} onChange={(v) => set({ showSmith: v })}>Smith / polar chart</Check>
      </Section>
    </div>
  );
}
