// Touchstone .s1p/.s2p export and import (RI / MA / DB, Hz…GHz, any reference impedance), CSV export.
import { C, type Complex } from "./complex";
import type { SweepPoint } from "./litevna";
import { Z0 } from "./calibration";
import { formatValue, impedance, swr } from "./formats";

export function writeTouchstone(data: SweepPoint[], ports: 1 | 2, comment = "WebVNA", format: "RI" | "MA" | "DB" = "RI"): string {
  const lines = [`! ${comment}`, `! ${new Date().toISOString()}`, `# Hz S ${format} R ${Z0}`];
  const e = (v: number) => v.toExponential(9);
  const pair = (s: Complex) => {
    if (format === "RI") return `${e(s[0])} ${e(s[1])}`;
    const m = C.abs(s), a = (C.arg(s) * 180) / Math.PI;
    return format === "MA" ? `${e(m)} ${e(a)}` : `${e(20 * Math.log10(Math.max(m, 1e-15)))} ${e(a)}`;
  };
  for (const p of data) {
    const f = Math.round(p.f);
    // 2-port order: S11 S21 S12 S22. The LiteVNA measures one direction; S12 = S21, S22 = 0 by convention of NanoVNA tools.
    lines.push(ports === 1 ? `${f} ${pair(p.s11)}` : `${f} ${pair(p.s11)} ${pair(p.s21)} ${pair(p.s21)} ${pair([0, 0])}`);
  }
  return lines.join("\n") + "\n";
}

export interface TouchstoneFile { ports: number; z0: number; data: SweepPoint[]; comments: string[] }

export function parseTouchstone(text: string, nameHint = ""): TouchstoneFile {
  let unit = 1e9, fmt = "MA", z0 = 50, ports = /\.s2p$/i.test(nameHint) ? 2 : /\.s1p$/i.test(nameHint) ? 1 : 0;
  const comments: string[] = [];
  const rows: number[][] = [];
  for (const raw of text.split(/\r?\n/)) {
    const ci = raw.indexOf("!");
    if (ci >= 0) comments.push(raw.slice(ci + 1).trim());
    const line = (ci >= 0 ? raw.slice(0, ci) : raw).trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const t = line.slice(1).trim().toUpperCase().split(/\s+/);
      for (let i = 0; i < t.length; i++) {
        const k = t[i];
        if (k === "HZ") unit = 1; else if (k === "KHZ") unit = 1e3; else if (k === "MHZ") unit = 1e6; else if (k === "GHZ") unit = 1e9;
        else if (k === "RI" || k === "MA" || k === "DB") fmt = k;
        else if (k === "R" && t[i + 1]) { const r = parseFloat(t[i + 1]); if (Number.isFinite(r) && r > 0) z0 = r; i++; }
      }
      continue;
    }
    if (line.startsWith("[")) continue; // Touchstone 2.0 keywords
    rows.push(line.split(/\s+/).map(parseFloat));
  }
  // Guess from the row width of the data: 3 → 1-port, 9 → 2-port.
  if (!ports) ports = rows[0] && rows[0].length >= 9 ? 2 : 1;
  const per = ports === 1 ? 3 : 9;
  const toC = (a: number, b: number): Complex => {
    if (fmt === "RI") return [a, b];
    const m = fmt === "DB" ? Math.pow(10, a / 20) : a;
    return C.polar(m, (b * Math.PI) / 180);
  };
  const data: SweepPoint[] = rows.map((r, i) => {
    if (r.length !== per || !r.every(Number.isFinite)) throw new Error(`Malformed data row ${i + 1}: expected ${per} numbers.`);
    const f = r[0] * unit;
    const s11 = toC(r[1], r[2]);
    const s21 = ports === 2 ? toC(r[3], r[4]) : ([0, 0] as Complex);
    // Renormalise to 50 Ω if the file uses another reference impedance (an exact open stays Γ = 1).
    const s11n = z0 === Z0 ? s11 : (() => { const z = impedance(s11, "s11", z0); return isFinite(z[0]) ? C.div(C.sub(z, [Z0, 0]), C.add(z, [Z0, 0])) : ([1, 0] as Complex); })();
    return { f, s11: s11n, s21 };
  });
  if (!data.length) throw new Error("No data points found in the Touchstone file.");
  return { ports, z0, data, comments };
}

export function writeCsv(data: SweepPoint[]): string {
  const rows = ["frequency_hz,s11_re,s11_im,s21_re,s21_im,s11_db,s11_phase_deg,vswr,r_ohm,x_ohm,s21_db,s21_phase_deg"];
  for (const p of data) {
    const z = impedance(p.s11, "s11");
    rows.push([
      Math.round(p.f), p.s11[0], p.s11[1], p.s21[0], p.s21[1],
      formatValue("logmag", p.s11, p.f, "s11").toFixed(4), formatValue("phase", p.s11, p.f, "s11").toFixed(3),
      swr(p.s11).toFixed(4), z[0].toFixed(4), z[1].toFixed(4),
      formatValue("logmag", p.s21, p.f, "s21").toFixed(4), formatValue("phase", p.s21, p.f, "s21").toFixed(3),
    ].join(","));
  }
  return rows.join("\n") + "\n";
}
