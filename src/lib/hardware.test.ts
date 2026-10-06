// Real-hardware checks (docs/01 §9). Skipped unless HW_PORT is set, e.g.
//   HW_PORT=/dev/cu.usbmodemv1_01 npx vitest run src/lib/hardware.test.ts
// Safe: only reads registers, sweeps, and restores defaults. Never touches 0xE0–0xEF (except 0xEE screenshot).
import { describe, expect, it, afterAll } from "vitest";
import * as fs from "node:fs";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { LinkBase } from "./links";
import { LiteVNA } from "./litevna";
import { C } from "./complex";

class TtyLink extends LinkBase {
  kind = "tty";
  private fd: number;
  private cat: ChildProcess;
  constructor(path: string) {
    super();
    // Keep a write fd open, put the line in raw mode, and read through `cat` (killable, unlike a blocked fs read).
    this.fd = fs.openSync(path, fs.constants.O_RDWR | fs.constants.O_NOCTTY | fs.constants.O_NONBLOCK);
    execFileSync("stty", ["-f", path, "raw", "-echo", "115200"]);
    this.cat = spawn("cat", [path], { stdio: ["ignore", "pipe", "ignore"] });
    this.cat.stdout!.on("data", (b: Buffer) => this.push(new Uint8Array(b)));
  }
  protected async write(bytes: Uint8Array) {
    let off = 0;
    while (off < bytes.length) {
      try { off += fs.writeSync(this.fd, bytes, off); }
      catch (e) { if ((e as NodeJS.ErrnoException).code !== "EAGAIN") throw e; await new Promise((r) => setTimeout(r, 1)); }
    }
  }
  async close() { this.closed = true; this.cat.kill(); try { fs.closeSync(this.fd); } catch { /* ignore */ } }
}

const PORT = process.env.HW_PORT;

describe.skipIf(!PORT)("LiteVNA hardware", () => {
  const link = PORT ? new TtyLink(PORT) : (null as unknown as TtyLink);
  const vna = new LiteVNA(link);
  const report: Record<string, unknown> = {};

  afterAll(async () => {
    try {
      await vna.setAverage(1);
      await vna.setChannels(0);
      await vna.exitUsbMode();
    } finally {
      await link.close();
      fs.writeFileSync(process.env.HW_REPORT ?? "hw-report.json", JSON.stringify(report, null, 2));
    }
  });

  it("identifies the device", async () => {
    const info = await vna.init();
    report.info = info;
    expect(info.variant).toBe(2);
  }, 10000);

  it("reads battery and serial", async () => {
    report.vbat = await vna.readVbat();
    report.serial = await vna.readSerial();
  }, 10000);

  it("sweeps 201 / 1001 points and validates checksums", async () => {
    for (const n of [201, 1001]) {
      const before = { ...vna.stats };
      const t0 = performance.now();
      const d = await vna.sweep(100e6, 1000e6, n);
      const ms = performance.now() - t0;
      expect(d.length).toBe(n);
      expect(d.every((p) => isFinite(p.s11[0]) && isFinite(p.s21[0]))).toBe(true);
      report[`sweep${n}`] = {
        ms: Math.round(ms), ptsPerSec: Math.round(n / (ms / 1000)),
        records: vna.stats.records - before.records, badChecksum: vna.stats.badChecksum - before.badChecksum, zeroChecksum: vna.stats.zeroChecksum - before.zeroChecksum,
        s11mag: [C.abs(d[0].s11), C.abs(d[Math.floor(n / 2)].s11), C.abs(d[n - 1].s11)].map((v) => +v.toFixed(4)),
        s21mag: [C.abs(d[0].s21), C.abs(d[Math.floor(n / 2)].s21), C.abs(d[n - 1].s21)].map((v) => +v.toFixed(5)),
      };
    }
  }, 60000);

  it("sweeps more than 1024 points (segmented)", async () => {
    const t0 = performance.now();
    const d = await vna.sweep(50e3, 6e9, 3001);
    report.sweep3001 = { ms: Math.round(performance.now() - t0), n: d.length, f0: d[0].f, f1: d[d.length - 1].f };
    expect(d.length).toBe(3001);
  }, 120000);

  it("averaging 10× slows the sweep", async () => {
    await vna.setAverage(10);
    const t0 = performance.now();
    await vna.sweep(100e6, 1000e6, 101);
    report.avg10_101pts_ms = Math.round(performance.now() - t0);
    await vna.setAverage(1);
  }, 60000);

  it("first sweep after a range change is not stale", async () => {
    await vna.sweep(100e6, 300e6, 101);
    const a = await vna.sweep(3e9, 5e9, 101); // first sweep after the change
    const b = await vna.sweep(3e9, 5e9, 101); // repeat
    const diff = Math.max(...a.map((p, i) => C.abs(C.sub(p.s11, b[i].s11))));
    report.firstSweepMaxDiff = +diff.toFixed(4);
    expect(diff).toBeLessThan(0.1);
  }, 60000);

  it("data mode 3 (device calibration)", async () => {
    const raw = await vna.sweep(100e6, 1000e6, 51);
    await vna.setDataMode(3);
    const dev = await vna.sweep(100e6, 1000e6, 51);
    await vna.setDataMode(0);
    report.dataMode3 = {
      rawS11: raw.filter((_, i) => i % 25 === 0).map((p) => +C.abs(p.s11).toFixed(4)),
      devS11: dev.filter((_, i) => i % 25 === 0).map((p) => +C.abs(p.s11).toFixed(4)),
      maxDiff: +Math.max(...raw.map((p, i) => C.abs(C.sub(p.s11, dev[i].s11)))).toFixed(4),
    };
  }, 60000);

  it("captures a screenshot", async () => {
    const s = await vna.screenshot(20000);
    report.screenshot = { width: s.width, height: s.height };
    expect(s.rgba.length).toBe(s.width * s.height * 4);
  }, 30000);
});
