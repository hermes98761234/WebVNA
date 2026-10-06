import { useStore, set } from "../store";
import { Check, Section, Select } from "./inputs";
import { setIfAverage, setPower, setChannelsMode, readVbat, syncClock, screenshot, setSimDut, isSimulator, getStats, download, reconnectKnown, hasWebSerial } from "../controller";
import { DUTS } from "../lib/mock";

export function DevicePanel() {
  const s = useStore();
  const connected = s.status === "connected";
  const stats = getStats();
  return (
    <div>
      <Section title="Device">
        {s.info ? (
          <div className="kv">
            <span>Model</span><span>{s.info.model}</span>
            <span>Hardware rev</span><span>{s.info.hardware}</span>
            <span>Firmware</span><span>{s.info.fwMajor}.{s.info.fwMinor}</span>
            <span>Protocol</span><span>{s.info.protocol}</span>
            <span>Max points</span><span>{s.info.maxPoints}</span>
            <span>Serial</span><span style={{ fontFamily: "monospace", fontSize: 11 }}>{s.serial || "—"}</span>
            <span>Battery</span><span>{s.vbat != null ? `${s.vbat.toFixed(3)} V` : "—"}</span>
            <span>Link</span><span>{s.linkKind}</span>
            {stats && <><span>Records</span><span>{stats.records} ({stats.badChecksum} bad checksum)</span></>}
            {stats && stats.lastSweepMs > 0 && <><span>Last sweep</span><span>{(stats.lastSweepMs / 1000).toFixed(2)} s</span></>}
          </div>
        ) : (
          <>
            <p className="hint">Not connected. Close NanoVNA-App / NanoVNA-Saver first: only one program can open the port.</p>
            {hasWebSerial() && <button onClick={() => reconnectKnown()}>Reconnect to a known device</button>}
          </>
        )}
        <div className="row" style={{ marginTop: 6 }}>
          <button disabled={!connected} onClick={() => readVbat()}>Read battery</button>
          <button disabled={!connected} onClick={() => syncClock()}>Set clock</button>
          <button disabled={!connected} onClick={() => screenshot()}>Screenshot</button>
        </div>
      </Section>

      <Section title="Instrument">
        <div className="row">
          <label>IF averaging</label>
          <Select value={s.ifAverage} ariaLabel="IF averaging" options={[1, 2, 3, 5, 10, 20, 40, 80].map((n) => [n, `${n}×`] as [number, string])} onChange={(v) => setIfAverage(v)} />
        </div>
        <div className="row">
          <label>Power &gt;140 MHz</label>
          <Select value={s.powerHf} ariaLabel="High band power" options={[[0, "0 (−9 dB)"], [1, "1 (−6 dB)"], [2, "2 (−3 dB)"], [3, "3 (max)"]]} onChange={(v) => setPower({ hf: v })} />
        </div>
        <div className="row">
          <label>Power &lt;140 MHz</label>
          <Select value={s.powerLf} ariaLabel="Low band power" options={[[0, "0"], [1, "1 (default)"], [2, "2"], [3, "3 (max)"]]} onChange={(v) => setPower({ lf: v })} />
        </div>
        <div className="row">
          <label>Channels</label>
          <Select value={s.channelsMode} ariaLabel="Channels" options={[[0, "S11 + S21"], [1, "S11 only"], [2, "S21 only"]]} onChange={(v) => setChannelsMode(v)} />
        </div>
        <p className="hint">Higher IF averaging narrows the IF bandwidth: lower noise, slower sweeps. Defaults: 1×, power 1 / 3, both channels.</p>
      </Section>

      {isSimulator() && (
        <Section title="Simulator">
          <div className="row">
            <label>Device under test</label>
            <Select value={s.simDut} ariaLabel="Simulated DUT" options={DUTS.map((d) => [d, d] as [typeof d, string])} onChange={(v) => setSimDut(v)} />
          </div>
          <p className="hint">antenna: 435 MHz dipole · filter: 145 MHz band-pass (S21) · crystal: 10 MHz series (S21) · cable: 3 m open RG-58 · rlc: series RLC.</p>
        </Section>
      )}

      {s.screenshot && (
        <Section title="Screenshot" right={<span className="row" style={{ margin: 0 }}>
          <button className="small" onClick={() => fetch(s.screenshot!.url).then((r) => r.blob()).then((b) => download(`litevna-screen-${Date.now()}.png`, b))}>Save PNG</button>
          <button className="small" onClick={() => set({ screenshot: null })}>✕</button>
        </span>}>
          <div className="screenshot"><img src={s.screenshot.url} alt={`Device screen ${s.screenshot.width}×${s.screenshot.height}`} /></div>
        </Section>
      )}

      <Section title="Diagnostics">
        <Check checked={s.commsMonitor} onChange={(v) => set({ commsMonitor: v })}>Comms monitor (hex log of every transfer)</Check>
      </Section>
    </div>
  );
}
