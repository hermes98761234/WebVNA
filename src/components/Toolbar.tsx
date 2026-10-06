import { useStore } from "../store";
import { connectSerial, connectSimulator, connectUsb, disconnect, hasWebSerial, hasWebUsb, startContinuous, stop, sweepOnce } from "../controller";
import { calCovers } from "../lib/calibration";
import { useEffect, useState } from "react";

export function Toolbar({ onMenu, menuOpen }: { onMenu: () => void; menuOpen: boolean }) {
  const status = useStore((s) => s.status);
  const info = useStore((s) => s.info);
  const linkKind = useStore((s) => s.linkKind);
  const running = useStore((s) => s.running);
  const continuous = useStore((s) => s.continuous);
  const progress = useStore((s) => s.progress);
  const cal = useStore((s) => s.cal);
  const calEnabled = useStore((s) => s.calEnabled);
  const deviceCal = useStore((s) => s.deviceCal);
  const vbat = useStore((s) => s.vbat);
  const start = useStore((s) => s.start), stopHz = useStore((s) => s.stop);
  const lastSweepMs = useStore((s) => s.lastSweepMs);
  const points = useStore((s) => s.points);
  const connected = status === "connected";
  const [theme, setTheme] = useState<string>(() => { try { return localStorage.getItem("webvna.theme") || "auto"; } catch { return "auto"; } });
  useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("webvna.theme", theme); } catch { /* ignore */ }
  }, [theme]);

  // Keyboard: Space = single sweep, R = run/stop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, select, textarea")) return;
      if (e.key === " " && connected) { e.preventDefault(); void sweepOnce(); }
      if ((e.key === "r" || e.key === "R") && connected) { if (continuous) stop(); else void startContinuous(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connected, continuous]);

  let calBadge = <span className="badge warn">Raw</span>;
  if (deviceCal) calBadge = <span className="badge ok">Device cal</span>;
  else if (cal && calEnabled) calBadge = calCovers(cal, start, stopHz)
    ? <span className="badge ok" title={cal.name}>Calibrated</span>
    : <span className="badge warn" title="The sweep extends outside the calibrated range; edge terms are extrapolated.">Cal (out of range)</span>;
  else if (cal) calBadge = <span className="badge warn">Cal off</span>;

  return (
    <div className="toolbar">
      <button className="mobile-only menu-btn" onClick={onMenu} aria-label="Settings" aria-expanded={menuOpen}>☰</button>
      <span className="brand">WebVNA</span>
      {!connected ? (
        <>
          <button className="primary" disabled={status === "connecting" || !hasWebSerial()} onClick={() => connectSerial()} title={hasWebSerial() ? "" : "Web Serial needs Chrome or Edge"}>Connect</button>
          {hasWebUsb() && <button disabled={status === "connecting"} onClick={() => connectUsb()}>WebUSB</button>}
          <button disabled={status === "connecting"} onClick={() => connectSimulator()}>Simulator</button>
        </>
      ) : (
        <button onClick={() => disconnect()}>Disconnect</button>
      )}
      {connected && info && <span className="hint device-info">{info.model} · fw {info.fwMajor}.{info.fwMinor} · {linkKind}{vbat != null ? ` · ${vbat.toFixed(2)} V` : ""}</span>}
      {status === "connecting" && <span className="hint">Connecting…</span>}
      <span className="spacer" />
      {calBadge}
      <button disabled={!connected || running} onClick={() => sweepOnce()} title="Single sweep (Space)">Sweep</button>
      {continuous
        ? <button className="on" onClick={() => stop()} title="Stop (R)">Stop</button>
        : <button className="primary" disabled={!connected || running} onClick={() => startContinuous()} title="Run continuously (R)">Run</button>}
      <div className="progress" title={lastSweepMs ? `Last sweep ${(lastSweepMs / 1000).toFixed(2)} s (${Math.round(points / (lastSweepMs / 1000))} pts/s)` : ""}>
        <div style={{ width: `${(running ? progress : 0) * 100}%` }} />
      </div>
      <select className="theme-select" aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
        <option value="auto">Auto theme</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
