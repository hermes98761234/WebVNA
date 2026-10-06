import type { RefObject } from "react";
import { download } from "../controller";
import { cssVar } from "../display";
import { useT } from "../i18n";

/** Fullscreen ("pop-out") and save-as-PNG buttons for a chart. */
export function ChartTools({ target, canvas, name }: { target: RefObject<HTMLDivElement | null>; canvas: RefObject<HTMLCanvasElement | null>; name: string }) {
  const t = useT();
  const save = () => {
    const c = canvas.current;
    if (!c) return;
    const out = document.createElement("canvas");
    out.width = c.width; out.height = c.height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = cssVar("--chart-bg");
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(c, 0, 0);
    out.toBlob((b) => b && download(`webvna-${name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`, b));
  };
  const full = () => {
    const el = target.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };
  return (
    <div className="chart-tools">
      <button className="small" onClick={save} title={t("Save chart as PNG")}>PNG</button>
      <button className="small" onClick={full} title={t("Fullscreen")}>⛶</button>
    </div>
  );
}
