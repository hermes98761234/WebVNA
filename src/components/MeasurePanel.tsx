import { useMemo } from "react";
import { useStore, set, type MeasureMode } from "../store";
import { Num, Section, Select } from "./inputs";
import { cableAnalysis, crystalAnalysis, filterAnalysis, lcMatch, lcResonator, nearestIndex, resonances, swrBandwidth } from "../lib/analysis";
import { impedance, swr } from "../lib/formats";
import { C } from "../lib/complex";
import { fmtHz, si } from "../lib/units";

const MODES: [MeasureMode, string, string][] = [
  ["off", "Off", ""],
  ["lcmatch", "L/C match", "S11: L-networks that match the load at the active marker to 50 Ω."],
  ["resonance", "Resonances", "S11: frequencies where reactance crosses zero (series and parallel resonance)."],
  ["cable", "Cable (S11)", "Connect a cable open or shorted at the far end to port 1. Length from group delay, loss from |S11|."],
  ["filter", "Filter (S21)", "Connect the filter between port 1 and port 2: insertion loss, −3/−6/−60 dB bandwidth, Q, shape factor."],
  ["serieslc", "Series LC (S21)", "Series LC in the through path between the ports: resonance, R, L, C, Q."],
  ["shuntlc", "Shunt LC (S21)", "Series LC from the through line to ground: notch frequency, R, L, C, Q."],
  ["xtal", "Series crystal (S21)", "Crystal in series between the ports: fs, fp, motional Rm, Lm, Cm, holder Cp, Q."],
];

export function MeasurePanel() {
  const mode = useStore((s) => s.measure);
  const vf = useStore((s) => s.measureVf);
  return (
    <div>
      <Section title="Measure">
        <Select value={mode} ariaLabel="Measurement" options={MODES.map(([v, l]) => [v, l] as [MeasureMode, string])} onChange={(v) => set({ measure: v })} />
        <p className="hint">{MODES.find((m) => m[0] === mode)?.[2]}</p>
        {mode === "cable" && <div className="row"><label>Velocity factor</label><Num value={vf} min={0.1} max={1} step={0.01} onChange={(v) => set({ measureVf: v })} /></div>}
        <p className="hint">Results are shown under the charts and update with every sweep.</p>
      </Section>
    </div>
  );
}

/** Antenna summary plus the selected MEASURE function. */
export function AnalysisBox() {
  const data = useStore((s) => s.data);
  const mode = useStore((s) => s.measure);
  const vf = useStore((s) => s.measureVf);
  const markers = useStore((s) => s.markers);
  const activeMarker = useStore((s) => s.activeMarker);
  const mf = markers[activeMarker]?.f ?? 0;

  const content = useMemo(() => {
    if (!data.length) return <p className="hint">No data yet.</p>;
    const band = swrBandwidth(data);
    const best = band ? data[band.best] : null;
    const zb = best ? impedance(best.s11, "s11") : null;
    const summary = best && zb && (
      <div className="kv" style={{ marginBottom: 8 }}>
        <span>Best match</span><span>{fmtHz(best.f)} · VSWR {swr(best.s11).toFixed(3)} · {zb[0].toFixed(1)} {zb[1] >= 0 ? "+" : "−"} j{Math.abs(zb[1]).toFixed(1)} Ω</span>
        <span>VSWR &lt; 2</span><span>{band?.bw ? `${fmtHz(band.low!)} – ${fmtHz(band.high!)} (${si(band.bw, "Hz")}, ${band.pct!.toFixed(2)} %)` : "none in this sweep"}</span>
        <span>Return loss</span><span>{(-20 * Math.log10(Math.max(C.abs(best.s11), 1e-12))).toFixed(2)} dB · mismatch loss {(-10 * Math.log10(1 - Math.min(C.abs(best.s11), 0.9999) ** 2)).toFixed(3)} dB</span>
      </div>
    );
    let extra: React.ReactNode = null;
    if (mode === "lcmatch") {
      const p = data[nearestIndex(data, mf)];
      const z = impedance(p.s11, "s11");
      const sols = lcMatch(z, p.f);
      extra = (
        <>
          <p className="hint">At M{activeMarker + 1} {fmtHz(p.f)}: Z = {z[0].toFixed(2)} {z[1] >= 0 ? "+" : "−"} j{Math.abs(z[1]).toFixed(2)} Ω</p>
          {sols.length ? (
            <table className="data"><thead><tr><th>Topology</th><th>Source shunt</th><th>Series</th><th>Load shunt</th></tr></thead>
              <tbody>{sols.map((x, i) => <tr key={i}><td>{x.topology}</td><td>{x.source}</td><td>{x.series}</td><td>{x.load}</td></tr>)}</tbody></table>
          ) : <p className="hint">No L-network solution (R ≤ 0).</p>}
        </>
      );
    } else if (mode === "resonance") {
      const r = resonances(data);
      extra = r.length ? (
        <table className="data"><thead><tr><th>Frequency</th><th>Type</th><th>R</th></tr></thead>
          <tbody>{r.slice(0, 20).map((x, i) => <tr key={i}><td>{fmtHz(x.f)}</td><td>{x.kind}</td><td>{x.r.toFixed(2)} Ω</td></tr>)}</tbody></table>
      ) : <p className="hint">No reactance zero crossing in this sweep.</p>;
    } else if (mode === "cable") {
      const r = cableAnalysis(data, vf);
      extra = r && (
        <div className="kv">
          <span>Physical length</span><span>{r.physicalLength.toFixed(3)} m (VF {vf})</span>
          <span>Electrical length</span><span>{r.electricalLength.toFixed(3)} m</span>
          <span>One-way delay</span><span>{si(r.delay, "s")}</span>
          <span>Loss (mid band)</span><span>{r.lossDb.toFixed(3)} dB · {r.lossDbPer100m.toFixed(2)} dB/100 m</span>
        </div>
      );
    } else if (mode === "filter") {
      const r = filterAnalysis(data);
      extra = r && (
        <div className="kv">
          <span>Type</span><span>{r.type}</span>
          <span>Peak</span><span>{fmtHz(r.peakF)} · IL {r.insertionLoss.toFixed(2)} dB</span>
          {r.center && <><span>Centre (−3 dB)</span><span>{fmtHz(r.center)}</span></>}
          {r.low3 && <><span>Lower −3 dB</span><span>{fmtHz(r.low3)}</span></>}
          {r.high3 && <><span>Upper −3 dB</span><span>{fmtHz(r.high3)}</span></>}
          {r.bw3 && <><span>BW −3 dB</span><span>{si(r.bw3, "Hz")}</span></>}
          {r.bw6 && <><span>BW −6 dB</span><span>{si(r.bw6, "Hz")}</span></>}
          {r.bw60 && <><span>BW −60 dB</span><span>{si(r.bw60, "Hz")}</span></>}
          {r.q && <><span>Q</span><span>{r.q.toFixed(2)}</span></>}
          {r.shapeFactor && <><span>Shape factor 60/6</span><span>{r.shapeFactor.toFixed(2)}</span></>}
        </div>
      );
    } else if (mode === "serieslc" || mode === "shuntlc") {
      const r = lcResonator(data, mode === "serieslc" ? "series" : "shunt");
      extra = r ? (
        <div className="kv">
          <span>Resonance</span><span>{fmtHz(r.f0)}</span>
          <span>R</span><span>{r.r.toFixed(3)} Ω</span>
          <span>L</span><span>{si(r.l, "H")}</span>
          <span>C</span><span>{si(r.c, "F")}</span>
          <span>Q</span><span>{r.q.toFixed(1)}</span>
          <span>BW −3 dB</span><span>{si(r.bw, "Hz")}</span>
        </div>
      ) : <p className="hint">The −3 dB points must be inside the sweep.</p>;
    } else if (mode === "xtal") {
      const r = crystalAnalysis(data);
      extra = r ? (
        <div className="kv">
          <span>fs</span><span>{fmtHz(r.fs, 6)}</span>
          <span>fp</span><span>{r.fp ? fmtHz(r.fp, 6) : "outside sweep"}</span>
          <span>Rm</span><span>{r.rm.toFixed(2)} Ω</span>
          <span>Lm</span><span>{si(r.lm, "H")}</span>
          <span>Cm</span><span>{si(r.cm, "F")}</span>
          <span>Cp</span><span>{r.cp ? si(r.cp, "F") : "—"}</span>
          <span>Q</span><span>{r.q.toFixed(0)}</span>
        </div>
      ) : <p className="hint">Sweep narrowly around the series resonance (the −3 dB points must be inside the sweep).</p>;
    }
    return <>{summary}{extra}</>;
  }, [data, mode, vf, mf, activeMarker]);

  return (
    <div className="box">
      <h3>Analysis{mode !== "off" ? ` · ${MODES.find((m) => m[0] === mode)?.[1]}` : ""}</h3>
      {content}
    </div>
  );
}
