import { useEffect, useState } from "react";
import { useStore, log } from "./store";
import { Toolbar } from "./components/Toolbar";
import { StimulusPanel } from "./components/StimulusPanel";
import { CalibrationPanel } from "./components/CalibrationPanel";
import { DisplayPanel } from "./components/DisplayPanel";
import { MarkersPanel } from "./components/MarkersPanel";
import { MeasurePanel, AnalysisBox } from "./components/MeasurePanel";
import { DevicePanel } from "./components/DevicePanel";
import { FilesPanel } from "./components/FilesPanel";
import { RectChart } from "./components/RectChart";
import { SmithChart } from "./components/SmithChart";
import { MarkerTable } from "./components/MarkerTable";
import { LogPanel } from "./components/LogPanel";
import { disconnect, hasWebSerial, reconnectKnown, restoreActiveCal, updateMarkers } from "./controller";

const TABS = [
  ["stimulus", "Stimulus", StimulusPanel],
  ["cal", "Calibrate", CalibrationPanel],
  ["display", "Display", DisplayPanel],
  ["markers", "Markers", MarkersPanel],
  ["measure", "Measure", MeasurePanel],
  ["device", "Device", DevicePanel],
  ["files", "Files", FilesPanel],
] as const;

let booted = false;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("stimulus");
  const showRect = useStore((s) => s.showRect);
  const showSmith = useStore((s) => s.showSmith);
  const markers = useStore((s) => s.markers);
  const Panel = TABS.find((t) => t[0] === tab)![2];

  useEffect(() => {
    if (booted) return;
    booted = true;
    restoreActiveCal();
    if (!hasWebSerial()) log("Web Serial isn't available here. Use Chrome or Edge on desktop (https or localhost). The simulator still works.", "error");
    else void reconnectKnown();
    const bye = () => { void disconnect(); };
    window.addEventListener("beforeunload", bye);
  }, []);

  // Tracking markers follow tracking mode changes immediately.
  useEffect(() => { updateMarkers(); }, [markers]);

  return (
    <div className="app">
      <Toolbar />
      <div className="body">
        <aside className="side">
          <nav className="tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
            ))}
          </nav>
          <div className="panel"><Panel /></div>
        </aside>
        <main className="main">
          <div className={"charts" + (showRect && showSmith ? "" : " single")}>
            {showRect && <RectChart />}
            {showSmith && <SmithChart />}
          </div>
          <div className="bottom">
            <MarkerTable />
            <AnalysisBox />
          </div>
          <div className="bottom" style={{ gridTemplateColumns: "1fr" }}>
            <LogPanel />
          </div>
        </main>
      </div>
    </div>
  );
}
