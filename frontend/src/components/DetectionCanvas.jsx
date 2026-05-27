import { useEffect, useRef } from "react";
import { colorFor, prettyClass } from "../lib/colors.js";

/**
 * Overlay canvas that draws YOLO bounding boxes.
 *
 * The canvas's intrinsic size matches the source image's pixel dimensions
 * (sourceWidth × sourceHeight) so detection coordinates are 1:1. CSS
 * (object-fit: contain) then scales it to fit alongside the underlying
 * <video> or <img>, preserving alignment without any per-frame math.
 *
 * Props:
 *   detections:    Array of { bbox: [x1,y1,x2,y2], cls, conf }
 *   sourceWidth:   intrinsic width of the underlying media
 *   sourceHeight:  intrinsic height of the underlying media
 *   showLabels:    boolean (default true)
 */
export default function DetectionCanvas({
  detections = [],
  sourceWidth,
  sourceHeight,
  showLabels = true,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceWidth || !sourceHeight) return;
    if (canvas.width !== sourceWidth) canvas.width = sourceWidth;
    if (canvas.height !== sourceHeight) canvas.height = sourceHeight;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Scale line width / font with image size so they look right at any res.
    const scale = Math.max(canvas.width, canvas.height) / 800;
    const lineW = Math.max(2, Math.round(2 * scale));
    const fontPx = Math.max(12, Math.round(14 * scale));
    ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";

    for (const det of detections) {
      const [x1, y1, x2, y2] = det.bbox || [];
      if ([x1, y1, x2, y2].some((v) => typeof v !== "number")) continue;
      const w = x2 - x1;
      const h = y2 - y1;
      const color = colorFor(det.cls, det.cls_id ?? 0);

      ctx.lineWidth = lineW;
      ctx.strokeStyle = color;
      ctx.strokeRect(x1, y1, w, h);

      if (!showLabels) continue;
      const label = `${prettyClass(det.cls)}  ${(det.conf * 100).toFixed(1)}%`;
      const padX = 6, padY = 3;
      const textW = ctx.measureText(label).width;
      const tagH = fontPx + padY * 2;
      const tagW = textW + padX * 2;
      const tagY = y1 - tagH < 0 ? y1 : y1 - tagH;

      ctx.fillStyle = color;
      ctx.fillRect(x1, tagY, tagW, tagH);
      ctx.fillStyle = "#0b0f14";
      ctx.fillText(label, x1 + padX, tagY + padY);
    }
  }, [detections, sourceWidth, sourceHeight, showLabels]);

  return <canvas ref={canvasRef} />;
}
