import { useEffect, useRef, useState } from "react";
import DetectionCanvas from "../components/DetectionCanvas.jsx";
import ReportCard from "../components/ReportCard.jsx";
import { detectFile } from "../lib/api.js";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [conf, setConf] = useState(0.35);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const imgRef = useRef(null);

  // Revoke object URLs to avoid leaks.
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  function handleFiles(list) {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please pick an image file.");
      return;
    }
    setError(null);
    setFile(f);
    setResult(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function runDetection() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await detectFile(file, conf);
      setResult(res);
      if (res.image) setSize({ w: res.image.width, h: res.image.height });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function onImgLoad() {
    const img = imgRef.current;
    if (img) setSize({ w: img.naturalWidth, h: img.naturalHeight });
  }

  return (
    <>
      <div className="card">
        <h1>Upload an image</h1>
        <p>
          Drop a still PCB image (JPEG / PNG). The backend will run YOLO
          inference and return a defect report plus bounding boxes drawn over
          your image.
        </p>

        {error && <div className="banner error">{error}</div>}

        {!previewUrl && (
          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <h3>Drop an image here</h3>
            <p>or click to choose a file</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        )}

        {previewUrl && (
          <>
            <div className="stage">
              <img
                ref={imgRef}
                src={previewUrl}
                alt="upload preview"
                onLoad={onImgLoad}
              />
              <DetectionCanvas
                detections={result?.detections || []}
                sourceWidth={size.w}
                sourceHeight={size.h}
              />
            </div>

            <div className="controls">
              <button className="primary" disabled={busy} onClick={runDetection}>
                {busy ? "Detecting…" : "Run detection"}
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }}
              >
                Clear
              </button>

              <label>
                Confidence
                <input
                  type="range"
                  min="0.05"
                  max="0.95"
                  step="0.05"
                  value={conf}
                  onChange={(e) => setConf(parseFloat(e.target.value))}
                />
                <span className="mono">{conf.toFixed(2)}</span>
              </label>

              <span className="muted mono">
                {size.w}×{size.h}
              </span>
            </div>
          </>
        )}
      </div>

      <ReportCard report={result?.report} latency={result?.latency_ms} />
    </>
  );
}
