# WebVNA

A browser app for the **LiteVNA** (and the NanoVNA V2 family): connect over USB with Web Serial, sweep 50 kHz – 6.3 GHz, calibrate, and analyse S11/S21. Runs in Chrome or Edge; no install, no drivers. React 19 + TypeScript + Vite + zustand.

```bash
npm install
npm run dev       # http://localhost:5173 (localhost is a secure context, so Web Serial works)
npm test          # unit tests against the built-in simulator
npm run test:hw   # checks against a real LiteVNA (HW_PORT=/dev/cu.usbmodem… to override)
npm run build     # static site in dist/ (serve over https or localhost)
```

Plug in the LiteVNA and click **Connect** (close NanoVNA-App/Saver first: only one program can open the port). No hardware? Click **Simulator**.

## Features

- **Device:** Web Serial / WebUSB, auto-reconnect, IF averaging, output power, channel select, device calibration mode, battery, clock, screenshot, hex comms monitor, simulator.
- **Sweeps:** start/stop/center/span, up to 65535 points (segmented), log and CW sweeps, sweep averaging, band presets.
- **Calibration:** SOL, isolation, thru, enhanced response, cal-kit models, save/recall/import/export, interpolation, electrical delay / port extension.
- **Display:** 4 traces in 27 formats, Smith and polar charts, scale/reference controls, stored traces A–D with data/memory math, .sNp overlays, light/dark theme.
- **Markers:** 8 markers, search and tracking, delta, marker → start/stop/center/span/e-delay.
- **Analysis:** TDR/DTF, L/C match, filter, cable, crystal and LC resonator measurements, resonances, VSWR bandwidth.
- **Files:** Touchstone (.s1p/.s2p, RI/MA/DB) and CSV export/import, auto-save, chart PNG.

Firmware update (DFU) is deliberately not implemented; the driver refuses writes to the flash registers (`0xE0–0xEF`, except `0xEE` screenshot).

## Layout

```
src/lib/          protocol, transports, driver, simulator, calibration, formats, analysis, TDR, Touchstone (no DOM)
src/lib/*.test.ts core.test.ts (simulator), hardware.test.ts (real device, needs HW_PORT)
src/store.ts      app state · src/controller.ts device I/O · src/display.ts chart series
src/components/   React UI (charts are canvas)
```
