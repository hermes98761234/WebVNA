import { describe, expect, it } from "vitest";
import { mergeDefaults, mergePersisted, initialState } from "./store";
import { limitReports } from "./display";
import type { SweepPoint } from "./lib/litevna";

describe("mergePersisted", () => {
  it("adds defaults for fields missing in old persisted objects", () => {
    const old = {
      tdr: { enabled: true, mode: "bandpass", window: "normal", velocityFactor: 0.7, yAxis: "linear", xAxis: "distance", maxDistance: 0 },
      traces: [{ enabled: true, channel: "s21", format: "logmag", color: "#fff", scale: { auto: true, perDiv: 10, ref: 0, refPos: 7 }, memory: null, math: "off" }],
      kit: { name: "Custom", open: { c0: 5 } },
    };
    const m = mergePersisted(old);
    expect(m.tdr).toMatchObject({ enabled: true, mode: "bandpass", velocityFactor: 0.7, padding: 1 });
    expect(m.traces![0].limits).toEqual([]);
    expect(m.traces![0].channel).toBe("s21");
    expect(m.kit!.open).toMatchObject({ c0: 5, c1: 0, delayPs: 0 });
    expect(m.kit!.load.r).toBe(50);
  });

  it("keeps persisted limits, kit data and ignores unknown keys", () => {
    const limits = [{ kind: "upper", f1: 1, f2: 2, v1: 1.5, v2: 1.5 }];
    const data = { open: { name: "o.s1p", freqs: [1, 2], gamma: [[1, 0], [0.9, 0.1]] } };
    const m = mergePersisted({ traces: [{ ...initialState.traces[0], limits }], kit: { ...initialState.kit, data }, bogus: 1 });
    expect(m.traces![0].limits).toEqual(limits);
    expect(m.kit!.data).toEqual(data);
    expect("bogus" in m).toBe(false);
  });

  it("mergeDefaults fills nested objects only", () => {
    expect(mergeDefaults({ a: 1, b: { c: 2, d: 3 }, e: [1] }, { b: { c: 9 }, e: [] })).toEqual({ a: 1, b: { c: 9, d: 3 }, e: [] });
  });
});

describe("limitReports", () => {
  const data: SweepPoint[] = [1e6, 2e6, 3e6].map((f) => ({ f, s11: [0.5, 0], s21: [0, 0] })); // SWR 3
  const mk = (limits: unknown) => ({ data, memories: {}, core: initialState.core, traces: [{ ...initialState.traces[1], limits }] } as never);
  it("reports pass, fail and nothing checked", () => {
    expect(limitReports(mk([{ kind: "upper", f1: 1e6, f2: 3e6, v1: 5, v2: 5 }]))[0].status).toBe("pass");
    expect(limitReports(mk([{ kind: "upper", f1: 1e6, f2: 3e6, v1: 2, v2: 2 }]))[0].status).toBe("fail");
    expect(limitReports(mk([{ kind: "upper", f1: 5e6, f2: 6e6, v1: 2, v2: 2 }]))[0].status).toBe("none");
    expect(limitReports(mk([]))).toEqual([]);
  });
});
