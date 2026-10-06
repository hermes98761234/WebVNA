import { useMemo, useRef, useState } from "react";
import { useStore, set, updateMarker } from "../store";
import { rectSeries, cssVar, valueText, type Series } from "../display";
import { useCanvas } from "../hooks/useCanvas";
import { fmtHz, fmtHzShort, si } from "../lib/units";
import { FORMAT_BY_ID } from "../lib/formats";
import { restartIfRunning } from "../controller";
import { ChartTools } from "./ChartTools";

const DIV_Y = 8, DIV_X = 10;
const M = { l: 62, r: 14, t: 40, b: 26 };

export function RectChart() {
  const s = useStore();
  const { data, traces, activeTrace, memories, refs, tdr, markers, activeMarker, deltaRef, sweepMode } = s;
  const { series, xKind } = useMemo(() => rectSeries(s),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, traces, activeTrace, memories, refs, tdr]);
  const [hover, setHover] = useState<number | null>(null);
  const [zoom, setZoom] = useState<[number, number] | null>(null);
  const drag = useRef<"marker" | "zoom" | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const xr = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const se of series) if (se.x.length) { lo = Math.min(lo, se.x[0]); hi = Math.max(hi, se.x[se.x.length - 1]); }
    if (!isFinite(lo)) { lo = s.start; hi = s.stop; }
    if (hi <= lo) hi = lo + 1;
    return { lo, hi, log: xKind === "freq" && sweepMode === "log" && lo > 0 };
  }, [series, xKind, sweepMode, s.start, s.stop]);

  const geom = (w: number, h: number) => {
    const pw = w - M.l - M.r, ph = h - M.t - M.b;
    const xToPx = (x: number) => M.l + (xr.log ? Math.log(x / xr.lo) / Math.log(xr.hi / xr.lo) : (x - xr.lo) / (xr.hi - xr.lo)) * pw;
    const pxToX = (px: number) => { const t = Math.min(1, Math.max(0, (px - M.l) / pw)); return xr.log ? xr.lo * Math.pow(xr.hi / xr.lo, t) : xr.lo + t * (xr.hi - xr.lo); };
    return { pw, ph, xToPx, pxToX };
  };

  const xLabel = (x: number) => (xKind === "freq" ? fmtHzShort(x) : xKind === "distance" ? `${x.toFixed(x < 10 ? 2 : 1)} m` : si(x, "s", 3));

  const canvas = useCanvas((ctx, w, h) => {
    const { pw, ph, xToPx } = geom(w, h);
    const fg = cssVar("--chart-fg"), grid = cssVar("--grid"), gridStrong = cssVar("--grid-strong");
    ctx.clearRect(0, 0, w, h);
    ctx.font = "11px system-ui, sans-serif";
    // grid
    ctx.strokeStyle = grid; ctx.lineWidth = 1;
    for (let i = 0; i <= DIV_Y; i++) { const y = Math.round(M.t + (ph * i) / DIV_Y) + 0.5; ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke(); }
    const xt: number[] = [];
    if (xr.log) { for (let e = Math.floor(Math.log10(xr.lo)); e <= Math.ceil(Math.log10(xr.hi)); e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= xr.lo && v <= xr.hi) xt.push(v); } }
    else for (let i = 0; i <= DIV_X; i++) xt.push(xr.lo + ((xr.hi - xr.lo) * i) / DIV_X);
    ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "top";
    xt.forEach((v, i) => {
      const x = Math.round(xToPx(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph); ctx.stroke();
      if (xr.log || i % 2 === 0 || pw > 700) ctx.fillText(xLabel(v), x, M.t + ph + 6);
    });
    ctx.strokeStyle = gridStrong; ctx.strokeRect(M.l + 0.5, M.t + 0.5, pw, ph);

    if (!series.length) {
      ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(data.length ? "No rectangular traces enabled." : "Connect and press Sweep (or use the simulator).", M.l + pw / 2, M.t + ph / 2);
      return;
    }
    const yToPx = (se: Series, v: number) => M.t + ph - ((v - se.scale.ref) / se.scale.perDiv + se.scale.refPos) * (ph / DIV_Y);
    // y labels of the active trace (or first)
    const lab = series.find((se) => se.traceIndex === activeTrace && se.primary) ?? series[0];
    ctx.fillStyle = lab.color; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (let i = 0; i <= DIV_Y; i++) {
      const v = lab.scale.ref + (i - lab.scale.refPos) * lab.scale.perDiv;
      const txt = lab.unit === "dB" || lab.unit === "°" ? `${+v.toFixed(3)}` : lab.unit ? si(v, lab.unit, 3) : `${+v.toPrecision(4)}`;
      ctx.fillText(txt, M.l - 5, M.t + ph - (ph * i) / DIV_Y);
    }
    // reference marker ▶ at refPos
    const ry = M.t + ph - lab.scale.refPos * (ph / DIV_Y);
    ctx.beginPath(); ctx.moveTo(M.l - 1, ry - 4); ctx.lineTo(M.l + 5, ry); ctx.lineTo(M.l - 1, ry + 4); ctx.fill();
    // VSWR 2 line on SWR traces
    for (const se of series) if (se.primary && traces[se.traceIndex].format === "swr" && !tdr.enabled) {
      const y = yToPx(se, 2);
      if (y > M.t && y < M.t + ph) { ctx.strokeStyle = cssVar("--ref-line"); ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(M.l, y); ctx.lineTo(M.l + pw, y); ctx.stroke(); ctx.setLineDash([]); }
    }
    // traces
    ctx.save();
    ctx.beginPath(); ctx.rect(M.l, M.t, pw, ph); ctx.clip();
    for (const se of series) {
      ctx.strokeStyle = se.color; ctx.lineWidth = se.primary ? 1.6 : 1.1;
      ctx.setLineDash(se.dashed ? [4, 3] : []);
      ctx.globalAlpha = se.primary ? 1 : 0.75;
      ctx.beginPath();
      let started = false;
      const step = Math.max(1, Math.floor(se.x.length / (pw * 2)));
      for (let i = 0; i < se.x.length; i += step) {
        const v = se.y[i];
        if (!isFinite(v)) { started = false; continue; }
        const x = xToPx(se.x[i]), y = Math.max(-1e4, Math.min(1e4, yToPx(se, v)));
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    // legend
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    let lx = M.l, ly = 10;
    for (const se of series) {
      const num = (v: number) => (se.unit === "dB" || se.unit === "°" ? `${+v.toFixed(3)}${se.unit}` : se.unit ? si(v, se.unit, 3) : `${+v.toPrecision(4)}`);
      const txt = tdr.enabled ? se.label : `${se.label}  ${num(se.scale.perDiv)}/  ref ${num(se.scale.ref)}`;
      const tw = ctx.measureText(txt).width + 28;
      if (lx + tw > w - 80 && lx > M.l) { lx = M.l; ly += 14; }
      if (ly > 24) break;
      ctx.fillStyle = se.color;
      ctx.fillRect(lx, ly, 10, 3);
      ctx.fillText(txt, lx + 14, ly + 2);
      lx += tw;
    }
    // markers (frequency domain only)
    if (!tdr.enabled) {
      markers.forEach((m, mi) => {
        if (!m.enabled || m.f < xr.lo || m.f > xr.hi) return;
        const x = xToPx(m.f);
        for (const se of series) {
          if (!se.primary) continue;
          let lo = 0, hi = se.x.length - 1;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (se.x[mid] <= m.f) lo = mid; else hi = mid; }
          const i = Math.abs(se.x[lo] - m.f) <= Math.abs(se.x[hi] - m.f) ? lo : hi;
          const y = Math.max(M.t + 10, Math.min(M.t + ph, yToPx(se, se.y[i])));
          const act = mi === activeMarker;
          ctx.fillStyle = act ? se.color : cssVar("--chart-bg");
          ctx.strokeStyle = se.color; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 10); ctx.lineTo(x + 6, y - 10); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = act ? cssVar("--chart-bg") : se.color; ctx.textAlign = "center"; ctx.font = "bold 9px system-ui";
          ctx.fillText(deltaRef === mi ? "Δ" : String(mi + 1), x, y - 6.5);
          ctx.font = "11px system-ui, sans-serif";
        }
      });
    }
    // hover crosshair + readout
    if (hover != null && hover >= xr.lo && hover <= xr.hi) {
      const x = xToPx(hover);
      ctx.strokeStyle = fg; ctx.globalAlpha = 0.5; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, M.t); ctx.lineTo(x, M.t + ph); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const lines = [xKind === "freq" ? fmtHz(hover) : xLabel(hover)];
      const cols = ["--fg"];
      for (const se of series) {
        if (!se.primary) continue;
        let lo = 0, hi = se.x.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (se.x[mid] <= hover) lo = mid; else hi = mid; }
        const v = se.y[Math.abs(se.x[lo] - hover) <= Math.abs(se.x[hi] - hover) ? lo : hi];
        const t = traces[se.traceIndex];
        lines.push(tdr.enabled ? `${se.unit ? si(v, se.unit) : v.toFixed(4)}` : `${t.channel.toUpperCase()} ${FORMAT_BY_ID[t.format].label}: ${valueText(t.format, v)}`);
        cols.push(se.color);
      }
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14, bh = lines.length * 15 + 8;
      const bx = x + bw + 12 > w ? x - bw - 8 : x + 8, by = M.t + 6;
      ctx.fillStyle = cssVar("--panel"); ctx.globalAlpha = 0.92; ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1;
      ctx.strokeStyle = gridStrong; ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? cssVar("--fg") : cols[i]; ctx.fillText(l, bx + 7, by + 5 + i * 15); });
    }
    // zoom box
    if (zoom) {
      const a = xToPx(zoom[0]), b = xToPx(zoom[1]);
      ctx.fillStyle = cssVar("--accent"); ctx.globalAlpha = 0.15;
      ctx.fillRect(Math.min(a, b), M.t, Math.abs(b - a), ph); ctx.globalAlpha = 1;
    }
  }, [series, markers, activeMarker, deltaRef, hover, zoom, xr, activeTrace, tdr.enabled]);

  const xAt = (e: React.PointerEvent) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return geom(r.width, r.height).pxToX(e.clientX - r.left);
  };
  const moveMarker = (x: number) => {
    if (xKind !== "freq") return;
    updateMarker(activeMarker, { f: x, enabled: true, tracking: null });
  };

  return (
    <div className="chart" ref={wrap}>
      <ChartTools target={wrap} canvas={canvas} name="rect" />
      <canvas ref={canvas}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const x = xAt(e);
          if (e.shiftKey && xKind === "freq") { drag.current = "zoom"; setZoom([x, x]); }
          else { drag.current = "marker"; moveMarker(x); }
        }}
        onPointerMove={(e) => {
          const x = xAt(e);
          setHover(x);
          if (drag.current === "marker") moveMarker(x);
          else if (drag.current === "zoom") setZoom((z) => (z ? [z[0], x] : null));
        }}
        onPointerUp={() => {
          if (drag.current === "zoom" && zoom) {
            const [a, b] = [Math.min(...zoom), Math.max(...zoom)];
            if (b - a > (xr.hi - xr.lo) / 200) { set({ start: Math.round(a), stop: Math.round(b) }); restartIfRunning(); }
          }
          drag.current = null; setZoom(null);
        }}
        onPointerLeave={() => { if (!drag.current) setHover(null); }}
        onDoubleClick={() => set((st) => ({ traces: st.traces.map((t) => ({ ...t, scale: { ...t.scale, auto: true } })) }))}
        aria-label="Rectangular chart. Drag to move the active marker, Shift-drag to zoom, double-click to auto-scale."
      />
    </div>
  );
}
