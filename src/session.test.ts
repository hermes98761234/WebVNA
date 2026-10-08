import { describe, expect, it } from "vitest";
import { get, set, initialState } from "./store";
import { setCalibration, recompute } from "./controller";
import { exportSession, importSession, serializeSession, encodeShare, decodeShare, applySharedView, sharePayload } from "./session";
import { IDEAL_KIT, type CalData } from "./lib/calibration";
import type { SweepPoint } from "./lib/litevna";
import { NO_FIXTURE, type FixtureSettings } from "./lib/deembed";
import type { Complex } from "./lib/complex";

const N = 11;
const freqs = Array.from({ length: N }, (_, i) => 100e6 + i * 10e6);
const cx = (k: number): Complex[] => freqs.map((_, i) => [Math.cos(i + k) * 0.5, Math.sin(i + k) * 0.5]);
const cal: CalData = {
  name: "c", created: "x", freqs, kit: IDEAL_KIT, enhancedResponse: false,
  open: freqs.map(() => [0.9, 0.1] as Complex), short: freqs.map(() => [-0.9, 0.1] as Complex), load: freqs.map(() => [0.02, 0] as Complex),
};
const raw: SweepPoint[] = freqs.map((f, i) => ({ f, s11: cx(2)[i], s21: cx(3)[i] }));
const fixture: FixtureSettings = { ...NO_FIXTURE, enabled: true, z0: 75, port1: [{ type: "lumped", op: "embed", kind: "series", element: "L", value: 1e-9 }] };

const fresh = () => set({ ...initialState, raw: [], data: [], cal: null, terms: null });

describe("session files", () => {
  it("round-trips settings, calibration, fixture and data", () => {
    fresh();
    set({ start: 100e6, stop: 200e6, points: N, raw, fixture, lang: "uk" });
    setCalibration(cal);
    set({ fixture, calEnabled: false });
    recompute();
    const before = get().data;
    const text = serializeSession();

    fresh();
    expect(get().cal).toBeNull();
    importSession(text);
    const s = get();
    expect(s.start).toBe(100e6);
    expect(s.points).toBe(N);
    expect(s.cal?.name).toBe("c");
    expect(s.terms).not.toBeNull();
    expect(s.calEnabled).toBe(false);
    expect(s.fixture).toEqual(fixture);
    expect(s.raw).toEqual(raw);
    expect(s.data).toEqual(before);
    expect(s.lang).toBe("en"); // language is not taken from a session
  });

  it("fills settings missing from older files with defaults", () => {
    fresh();
    importSession({ format: "webvna-session", version: 1, settings: { start: 1e6, stop: 2e6, tdr: { enabled: true } } });
    expect(get().start).toBe(1e6);
    expect(get().tdr).toMatchObject({ enabled: true, mode: initialState.tdr.mode });
    expect(get().raw).toEqual([]);
  });

  it("rejects malformed files with clear errors and leaves the store alone", () => {
    fresh();
    set({ start: 123e6 });
    const ok = exportSession();
    const bad: [unknown, RegExp][] = [
      ["{nope", /JSON/],
      [[], /session/i],
      [{ format: "other", version: 1, settings: {} }, /session/i],
      [{ ...ok, version: 99 }, /version/],
      [{ ...ok, settings: undefined }, /settings/],
      [{ ...ok, settings: { ...ok.settings, points: 0 } }, /sweep settings/],
      [{ ...ok, settings: { ...ok.settings, start: "x" } }, /sweep settings/],
      [{ ...ok, data: { raw: [{ f: 1, s11: [0, 0] }] } }, /malformed point/],
      [{ ...ok, data: { raw: [{ f: 2, s11: [0, 0], s21: [0, 0] }, { f: 1, s11: [0, 0], s21: [0, 0] }] } }, /increase/],
      [{ ...ok, cal: { freqs: [1, 2], open: [[0, 0]] } }, /calibration/],
      [{ ...ok, refs: [{ name: 1 }] }, /references/],
    ];
    for (const [input, re] of bad) expect(() => importSession(input), JSON.stringify(input)?.slice(0, 60)).toThrow(re);
    expect(get().start).toBe(123e6);
  });
});

describe("share links", () => {
  it("encodes and decodes a sweep at float32 precision", async () => {
    fresh();
    set({ start: 100e6, stop: 200e6, points: N, raw, calEnabled: false });
    recompute();
    const token = await encodeShare();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    const v = await decodeShare(token);
    expect(v.data).toHaveLength(N);
    v.data.forEach((p, i) => {
      expect(p.f).toBeCloseTo(freqs[i], 3);
      expect(p.s11[0]).toBeCloseTo(raw[i].s11[0], 6);
      expect(p.s21[1]).toBeCloseTo(raw[i].s21[1], 6);
    });
    expect(v.settings.start).toBe(100e6);
  });

  it("stores non-linear grids and applies as a view with corrections off", async () => {
    fresh();
    const logRaw = raw.map((p, i) => ({ ...p, f: 1e6 * 2 ** i }));
    set({ raw: logRaw, calEnabled: false });
    recompute();
    expect(sharePayload().f).toBeTypeOf("string");
    const v = await decodeShare(await encodeShare());
    expect(v.data[5].f).toBe(32e6);
    fresh();
    set({ fixture });
    applySharedView(v);
    expect(get().calEnabled).toBe(false);
    expect(get().fixture.enabled).toBe(false);
    expect(get().data).toHaveLength(N);
  });

  it("rejects damaged links", async () => {
    await expect(decodeShare("AAAA")).rejects.toThrow(/damaged/);
    await expect(decodeShare("!!!")).rejects.toThrow();
    await expect(encodeShare({ format: "x" })).resolves.toBeTypeOf("string");
    await expect(decodeShare(await encodeShare({ format: "x" }))).rejects.toThrow(/damaged/);
  });

  it("refuses to share without data", async () => {
    fresh();
    await expect(encodeShare()).rejects.toThrow(/Nothing to share/);
  });
});
