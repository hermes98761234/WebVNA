import { describe, expect, it } from "vitest";
import { C, type Complex } from "./complex";
import { LiteVNA, planSegments, type SweepPoint } from "./litevna";
import { MockLink, dutS } from "./mock";
import { fifoChecksum, REG, DATA_MODE } from "./protocol";
import { applyCalibration, computeErrorTerms, IDEAL_KIT, kitGamma, parseCal, serializeCal, solveSOLGeneral, type CalData, type CalKit } from "./calibration";
import { formatValue, groupDelay, impedance, swr, traceValues } from "./formats";
import { parseTouchstone, writeCsv, writeTouchstone } from "./touchstone";
import { cableAnalysis, crystalAnalysis, filterAnalysis, lcMatch, resonances, search, swrBandwidth } from "./analysis";
import { DEFAULT_TDR, fft, timeDomain } from "./tdr";
import { parseHz, si } from "./units";

const S = 300e6, E = 600e6, N = 301;

async function setup() {
  const link = new MockLink(), vna = new LiteVNA(link);
  await vna.init();
  return { link, vna };
}

async function calibrate(link: MockLink, vna: LiteVNA, start = S, stop = E, n = N, kit: CalKit = IDEAL_KIT, enhanced = false): Promise<CalData> {
  const meas = async (d: Parameters<typeof dutS>[0]) => { link.dut = d; return vna.sweep(start, stop, n); };
  const o = await meas("open"), s = await meas("short"), l = await meas("load"), iso = await meas("isolation"), t = await meas("thru");
  return {
    name: "t", created: "", freqs: o.map((p) => p.f), kit, enhancedResponse: enhanced,
    open: o.map((p) => p.s11), short: s.map((p) => p.s11), load: l.map((p) => p.s11),
    isolation: iso.map((p) => p.s21), thru: t.map((p) => p.s21), thru11: t.map((p) => p.s11),
  };
}

const maxErr = (data: SweepPoint[], ch: "s11" | "s21", dut: Parameters<typeof dutS>[0]) =>
  Math.max(...data.map((p) => C.abs(C.sub(p[ch], dutS(dut, p.f)[ch]))));

describe("device driver (simulator)", () => {
  it("identifies the LiteVNA", async () => {
    const { vna } = await setup();
    expect(vna.info?.model).toBe("LiteVNA");
    expect(vna.info?.maxPoints).toBe(65535);
  });
  it("reads vbat, serial and screenshot", async () => {
    const { vna } = await setup();
    expect(await vna.readVbat()).toBe(4.012);
    expect(await vna.readSerial()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}$/);
    const shot = await vna.screenshot();
    expect(shot.rgba.length).toBe(shot.width * shot.height * 4);
  });
  it("orders points by freqIndex", async () => {
    const { vna } = await setup();
    const d = await vna.sweep(S, E, N);
    expect(d.every((p, i) => Math.abs(p.f - (S + i * 1e6)) < 1)).toBe(true);
  });
  it("does segmented sweeps", async () => {
    const { vna } = await setup();
    const big = await vna.sweep(1e6, 6e9, 3001);
    expect(big.length).toBe(3001);
  });
  it("does approximated log sweeps", async () => {
    const segs = planSegments(1e6, 1e9, 201, "log");
    expect(segs.reduce((a, s) => a + s.points, 0)).toBe(201);
    const { vna } = await setup();
    const d = await vna.sweepSegments(segs);
    expect(d.length).toBe(201);
    expect(d[0].f).toBeCloseTo(1e6, -1);
    expect(d[200].f).toBeCloseTo(1e9, -3);
  });
  it("validates the checksum", () => {
    const rec = new Uint8Array(32);
    rec[3] = 7;
    rec[31] = fifoChecksum(rec);
    expect(fifoChecksum(rec)).toBe(rec[31]);
    rec[3] ^= 1;
    expect(fifoChecksum(rec)).not.toBe(rec[31]);
  });
  it("refuses to write protected registers", async () => {
    const { vna } = await setup();
    expect(() => vna.write1(0xe0, 1)).toThrow();
    expect(() => vna.write1(REG.DATA_MODE, DATA_MODE.RAW)).toThrow();
  });
  it("aborts a sweep", async () => {
    const { vna } = await setup();
    const ac = new AbortController();
    ac.abort();
    await expect(vna.sweep(S, E, 2000, { signal: ac.signal })).rejects.toThrow(/stopped/);
  });
  it("supports device-calibrated data mode", async () => {
    const { link, vna } = await setup();
    await vna.setDataMode(DATA_MODE.DEVICE_CAL);
    link.dut = "antenna";
    const d = await vna.sweep(S, E, 101);
    expect(maxErr(d, "s11", "antenna")).toBeLessThan(0.005);
  });
});

describe("calibration", () => {
  it("SOL corrects S11 and thru normalises S21", async () => {
    const { link, vna } = await setup();
    const cal = await calibrate(link, vna);
    const terms = computeErrorTerms(cal);
    link.dut = "antenna";
    const corr = applyCalibration(await vna.sweep(S, E, N), terms);
    expect(maxErr(corr, "s11", "antenna")).toBeLessThan(0.005);
    const best = corr.reduce((a, p) => (swr(p.s11) < swr(a.s11) ? p : a));
    expect(best.f).toBe(435e6);
    expect(impedance(best.s11, "s11")[0]).toBeCloseTo(38, 0);
    link.dut = "thru";
    const t = applyCalibration(await vna.sweep(S, E, N), terms).map((p) => C.abs(p.s21));
    expect(Math.min(...t)).toBeGreaterThan(0.999);
    expect(Math.max(...t)).toBeLessThan(1.001);
  });
  it("interpolates onto a different sweep", async () => {
    const { link, vna } = await setup();
    const terms = computeErrorTerms(await calibrate(link, vna, 100e6, 1000e6, 901));
    link.dut = "antenna";
    const corr = applyCalibration(await vna.sweep(400e6, 470e6, 57), terms);
    expect(maxErr(corr, "s11", "antenna")).toBeLessThan(0.01);
  });
  it("general solver matches the ideal solver", () => {
    const g: [Complex, Complex, Complex] = [[1, 0], [-1, 0], [0, 0]];
    const e00: Complex = [0.05, 0.02], e11: Complex = [0.1, -0.05], T: Complex = [0.8, 0.3];
    const meas = g.map((G) => C.add(e00, C.div(C.mul(T, G), C.sub([1, 0], C.mul(e11, G))))) as [Complex, Complex, Complex];
    const e = solveSOLGeneral(meas, g);
    expect(C.abs(C.sub(e.e00, e00))).toBeLessThan(1e-9);
    expect(C.abs(C.sub(e.e11, e11))).toBeLessThan(1e-9);
    expect(C.abs(C.sub(e.T, T))).toBeLessThan(1e-9);
  });
  it("cal-kit model changes the open standard", () => {
    const kit: CalKit = { ...IDEAL_KIT, open: { ...IDEAL_KIT.open, c0: 50 } };
    const g = kitGamma(kit, "open", 1e9);
    expect(C.abs(g)).toBeCloseTo(1, 6);
    expect(C.arg(g)).toBeLessThan(-0.01);
  });
  it("enhanced response corrects S21 of a mismatched DUT", async () => {
    const { link, vna } = await setup();
    const terms = computeErrorTerms(await calibrate(link, vna, S, E, N, IDEAL_KIT, true));
    link.dut = "thru";
    const t = applyCalibration(await vna.sweep(S, E, N), terms);
    expect(maxErr(t, "s21", "thru")).toBeLessThan(0.01);
  });
  it("serialises and parses", async () => {
    const { link, vna } = await setup();
    const cal = await calibrate(link, vna, S, E, 11);
    const back = parseCal(serializeCal(cal));
    expect(back.freqs).toEqual(cal.freqs);
    expect(back.open).toEqual(cal.open);
  });
});

describe("formats and analysis", () => {
  const ant = Array.from({ length: 301 }, (_, i) => { const f = S + i * 1e6; return { f, ...dutS("antenna", f) }; });
  it("computes impedance and SWR", () => {
    const p = ant[135];
    expect(p.f).toBe(435e6);
    expect(formatValue("r", p.s11, p.f, "s11")).toBeCloseTo(38, 6);
    expect(formatValue("x", p.s11, p.f, "s11")).toBeCloseTo(0, 6);
    expect(formatValue("swr", p.s11, p.f, "s11")).toBeCloseTo(50 / 38, 6);
  });
  it("finds the VSWR bandwidth and resonance", () => {
    const b = swrBandwidth(ant)!;
    expect(ant[b.best].f).toBe(435e6);
    expect(b.low! < 435e6 && b.high! > 435e6).toBe(true);
    const r = resonances(ant);
    expect(r[0].f).toBeCloseTo(435e6, -4);
  });
  it("searches peaks", () => {
    const v = [0, 1, 0, 3, 0, 2, 0];
    expect(search(v, "max")).toBe(3);
    expect(search(v, "peak_right", 3)).toBe(5);
    expect(search(v, "peak_left", 3)).toBe(1);
  });
  it("computes group delay", () => {
    const d = Array.from({ length: 101 }, (_, i) => { const f = 1e8 + i * 1e6; return { f, s11: [0, 0] as Complex, s21: C.expj(-2 * Math.PI * f * 5e-9) }; });
    expect(groupDelay(d)[50]).toBeCloseTo(5e-9, 12);
    expect(traceValues(d, "s21", "delay")[50]).toBeCloseTo(5e-9, 12);
  });
  it("L/C match transforms the load to 50 Ω", () => {
    const sols = lcMatch([20, 30], 100e6);
    expect(sols.length).toBeGreaterThan(0);
  });
  it("analyses a band-pass filter", () => {
    const d = Array.from({ length: 801 }, (_, i) => { const f = 100e6 + i * 0.1e6; return { f, ...dutS("filter", f) }; });
    const r = filterAnalysis(d)!;
    expect(r.type).toBe("bandpass");
    expect(r.center! / 1e6).toBeGreaterThan(140);
    expect(r.center! / 1e6).toBeLessThan(150);
  });
  it("analyses a crystal", () => {
    const d = Array.from({ length: 2001 }, (_, i) => { const f = 9.99e6 + i * 20; return { f, ...dutS("crystal", f) }; });
    const r = crystalAnalysis(d)!;
    expect(r.fs / 1e6).toBeCloseTo(10, 3);
    expect(r.rm).toBeCloseTo(20, 0);
    expect(r.lm).toBeCloseTo(0.01, 2);
  });
  it("measures a cable", () => {
    const d = Array.from({ length: 401 }, (_, i) => { const f = 1e6 + i * 0.5e6; return { f, ...dutS("cable", f) }; });
    const r = cableAnalysis(d, 0.66)!;
    expect(r.physicalLength).toBeCloseTo(3, 1);
  });
});

describe("time domain", () => {
  it("fft round-trips", () => {
    const re = new Float64Array([1, 2, 3, 4, 0, 0, 0, 0]), im = new Float64Array(8);
    fft(re, im); fft(re, im, true);
    expect(re[2] / 8).toBeCloseTo(3, 9);
  });
  it("finds the open end of a cable", () => {
    const d = Array.from({ length: 401 }, (_, i) => { const f = (i + 1) * 2.5e6; return { f, ...dutS("cable", f) }; });
    const r = timeDomain(d, "s11", { ...DEFAULT_TDR, enabled: true, mode: "lowpass_impulse" })!;
    let best = 1;
    for (let i = 1; i < r.value.length; i++) if (Math.abs(r.value[i]) > Math.abs(r.value[best])) best = i;
    expect(r.distance[best]).toBeCloseTo(3, 0);
  });
});

describe("files and units", () => {
  const d = [{ f: 1e6, s11: [0.1, 0.2] as Complex, s21: [0.5, -0.5] as Complex }, { f: 2e6, s11: [0.3, -0.1] as Complex, s21: [0.4, 0.1] as Complex }];
  for (const fmt of ["RI", "MA", "DB"] as const) {
    it(`touchstone round-trip ${fmt}`, () => {
      const t = parseTouchstone(writeTouchstone(d, 2, "x", fmt), "a.s2p");
      expect(t.ports).toBe(2);
      expect(t.data[1].f).toBe(2e6);
      expect(t.data[1].s11[0]).toBeCloseTo(0.3, 8);
      expect(t.data[0].s21[1]).toBeCloseTo(-0.5, 8);
    });
  }
  it("parses MHz MA files with comments", () => {
    const t = parseTouchstone("! hi\n# MHz S MA R 50\n100 0.5 90\n200 0.25 -90 ! end\n");
    expect(t.ports).toBe(1);
    expect(t.data[0].f).toBe(100e6);
    expect(t.data[0].s11[1]).toBeCloseTo(0.5, 9);
  });
  it("writes CSV", () => expect(writeCsv(d).split("\n")[0]).toContain("frequency_hz"));
  it("parses and formats units", () => {
    expect(parseHz("435M")).toBe(435e6);
    expect(parseHz("1.2 GHz")).toBe(1.2e9);
    expect(parseHz("500k")).toBe(500e3);
    expect(si(1.5e-9, "H")).toBe("1.500 nH");
  });
});
