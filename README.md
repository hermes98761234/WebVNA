# WebVNA

A browser app for the **LiteVNA** (and the NanoVNA V2 family). Connect over USB, sweep from 50 kHz to 6.3 GHz, calibrate, and analyse S11/S21 on rectangular and Smith charts. It runs in Chrome or Edge with no install and no drivers.

![WebVNA showing an antenna sweep: S11 log-magnitude and SWR on the left, Smith chart on the right, marker and VSWR bandwidth readouts below](docs/screenshot.jpg)

*The built-in simulator, sweeping an antenna near 435 MHz.*

## Why

NanoVNA-App and NanoVNA-Saver are desktop programs. WebVNA does the same job in a browser tab through the [Web Serial API](https://developer.mozilla.org/docs/Web/API/Web_Serial_API). There is nothing to install, it works the same on macOS, Windows, Linux and ChromeOS, and you can host it as a static site. The main use is antenna work: S11, VSWR, impedance and bandwidth, with S21 and time-domain analysis on top.

## Features

- **Device:** Web Serial or WebUSB, auto-reconnect, IF averaging, output power, channel select, device calibration mode, battery voltage, clock, device screenshot, hex comms monitor.
- **Sweeps:** start/stop/center/span, up to 65,535 points (segmented), log and CW sweeps, sweep averaging, amateur and ISM band presets.
- **Calibration:** SOL, isolation, thru and enhanced response, cal-kit models, save/recall/import/export, interpolation when the range changes, electrical delay and port extension.
- **Display:** 4 traces in 27 formats (log mag, phase, group delay, SWR, R/X, \|Z\|, Q, L/C, G/B, …), Smith and polar charts, stored traces A–D with data/memory maths, `.sNp` overlays, light and dark themes, a mobile layout.
- **Markers:** 8 markers, peak/valley search and tracking, delta markers, marker → start/stop/center/span/e-delay.
- **Analysis:** VSWR bandwidth and best match, L/C matching networks, filter (type, insertion loss, bandwidth, Q), cable, crystal and LC resonators, resonances.
- **Time domain:** TDR/DTF with low-pass impulse/step and band-pass modes, Kaiser windows, velocity factor, distance or time axis.
- **Files:** Touchstone `.s1p`/`.s2p` (RI/MA/DB) and CSV export/import, auto-save to a folder, chart PNG.
- **Simulator:** a byte-level LiteVNA emulator with antenna, filter, crystal, cable, RLC and calibration-standard DUTs. Try everything without hardware.
- **Languages:** English and Ukrainian.

## Quick start

You need [Node.js](https://nodejs.org/) 20.19+ or 22.12+ and Chrome or Edge 89+ (Firefox and Safari don't support Web Serial).

```bash
git clone https://github.com/vkopitsa/WebVNA.git
cd WebVNA
npm install
npm run dev       # http://localhost:5173
```

1. Close NanoVNA-App / NanoVNA-Saver: only one program can open the serial port.
2. Plug in the LiteVNA and click **Connect**, then pick the device in the browser's port chooser.
3. Press **Sweep** (once) or **Run** (continuous).

No hardware? Click **Simulator**.

**Calibrating:** set the sweep range first. On the **Calibrate** tab, connect OPEN, SHORT and LOAD in turn and press each button. For S21, also measure ISOLATION and THRU. Then press **Done (apply)**.

## Building and deploying

```bash
npm run build     # static site in dist/
npm run preview   # serve dist/ locally
```

`dist/` uses relative paths, so it works from any sub-path, including GitHub Pages. Web Serial only works in a [secure context](https://developer.mozilla.org/docs/Web/Security/Secure_Contexts), so serve the site over HTTPS or from `localhost`.

## Development

```bash
npm test           # unit tests against the simulator (vitest)
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm run test:hw    # hardware tests on a real LiteVNA; HW_PORT=/dev/cu.usbmodem… to override the port
```

```
src/lib/          protocol, transports (Web Serial / WebUSB), LiteVNA driver, simulator, calibration,
                  trace formats, analysis, TDR, Touchstone. No DOM: runs and is tested in Node.
src/store.ts      app state (zustand, persisted to localStorage)
src/controller.ts device I/O, sweep loop, calibration workflow, import/export
src/display.ts    state → chart series
src/components/   React UI; charts are drawn on canvas
src/i18n.ts       translations
```

Stack: React 19, TypeScript, Vite, zustand, vitest. No runtime dependencies besides React and zustand.

### Contributing

Issues and pull requests are welcome. A few rules:

- Keep `src/lib` free of DOM and React so it stays testable in Node.
- Each new protocol feature needs a simulator implementation in `src/lib/mock.ts` and a test in `src/lib/core.test.ts`.
- Every visible string goes through `t()` / `tr()`. Add the Ukrainian entry to `src/i18n.ts`, or leave it out and say so in the PR.
- Run `npm test`, `npm run typecheck` and `npm run lint` before opening a PR.

## Safety

The LiteVNA protocol also exposes the bootloader's flash registers (`0xE0–0xEF`). WebVNA **never writes them**, except `0xEE` (screenshot). The driver refuses those writes in code (`isForbiddenWrite()` in `src/lib/protocol.ts`). Firmware update is deliberately not implemented; use NanoVNA-App for that.

Tested on a LiteVNA 64 (hardware rev 2, firmware 2.2). Other NanoVNA V2–protocol devices should work but haven't been tested.

## Acknowledgements

- [NanoVNA-App](https://github.com/OneOfEleven/NanoVNA-App) and [NanoVNA-Saver](https://github.com/NanoVNA-Saver/nanovna-saver), the reference for features and behaviour.
- [NanoVNA2-firmware](https://github.com/nanovna-v2/NanoVNA2-firmware), [NanoVNA-QT](https://github.com/nanovna-v2/NanoVNA-QT) and [liteVNA](https://github.com/openhoangnc/liteVNA), for the USB protocol.

## License

[MIT](LICENSE)
