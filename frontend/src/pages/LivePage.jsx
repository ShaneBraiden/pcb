import { useEffect, useRef, useState } from "react";
import DetectionCanvas from "../components/DetectionCanvas.jsx";
import ReportCard from "../components/ReportCard.jsx";
import { wsUrl } from "../lib/api.js";

/**
 * Webcam feed -> capture each frame to a hidden canvas -> send JPEG bytes
 * over WebSocket -> server returns detections -> overlay canvas renders boxes.
 *
 * Backpressure: send the next frame only after the previous response lands,
 * so the queue never grows and the UI stays smooth even when the model is
 * slow.
 */
export default function LivePage() {
  const videoRef = useRef(null);
  const grabRef = useRef(document.createElement("canvas"));
  const wsRef = useRef(null);
  const inflightRef = useRef(false);
  const lastSentRef = useRef(0);
  const cameraStreamRef = useRef(null);

  const [streaming, setStreaming] = useState(false);
  const [conf, setConf] = useState(0.4);
  const [quality, setQuality] = useState(0.7);
  const [detections, setDetections] = useState([]);
  const [report, setReport] = useState(null);
  const [latency, setLatency] = useState(null);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Track an FPS estimate based on response arrivals.
  const fpsWindowRef = useRef([]);

  useEffect(() => {
    return () => stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-emit conf threshold to the server when the slider changes.
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "conf", value: conf }));
    }
  }, [conf]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      setSize({ w: v.videoWidth, h: v.videoHeight });

      const ws = new WebSocket(wsUrl());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "conf", value: conf }));
        setStreaming(true);
        requestAnimationFrame(tick);
      };
      ws.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.error) {
          setError(msg.error);
          return;
        }
        if (msg.type === "ack") return;
        if (msg.detections) {
          setDetections(msg.detections);
          setReport(msg.report);
          setLatency(msg.latency_ms);
          inflightRef.current = false;

          const now = performance.now();
          fpsWindowRef.current.push(now);
          fpsWindowRef.current = fpsWindowRef.current.filter(
            (t) => now - t < 2000
          );
          setFps(fpsWindowRef.current.length / 2);
        }
      };
      ws.onerror = () => setError("WebSocket error — is the backend running?");
      ws.onclose = () => setStreaming(false);
    } catch (e) {
      setError(e.message || String(e));
    }
  }

  function stop() {
    setStreaming(false);
    inflightRef.current = false;
    if (wsRef.current && wsRef.current.readyState <= 1) {
      wsRef.current.close();
    }
    wsRef.current = null;
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function tick() {
    const ws = wsRef.current;
    const v = videoRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !v?.videoWidth) {
      return;
    }
    // Skip until previous request finishes; cap rate at ~15 send/s as a floor.
    const now = performance.now();
    if (!inflightRef.current && now - lastSentRef.current > 60) {
      const cap = grabRef.current;
      cap.width = v.videoWidth;
      cap.height = v.videoHeight;
      cap.getContext("2d").drawImage(v, 0, 0);
      cap.toBlob(
        (blob) => {
          if (!blob) return;
          blob.arrayBuffer().then((buf) => {
            if (ws.readyState === WebSocket.OPEN) {
              inflightRef.current = true;
              lastSentRef.current = performance.now();
              ws.send(buf);
            }
          });
        },
        "image/jpeg",
        quality
      );
      if (size.w !== v.videoWidth) setSize({ w: v.videoWidth, h: v.videoHeight });
    }
    if (wsRef.current) requestAnimationFrame(tick);
  }

  return (
    <>
      <div className="card">
        <h1>Live webcam</h1>
        <p>
          Grant camera access and the page will stream frames to the backend
          for defect detection. The overlay updates whenever a response lands.
        </p>

        {error && <div className="banner error">{error}</div>}

        <div className="stage">
          <video ref={videoRef} autoPlay playsInline muted />
          <DetectionCanvas
            detections={detections}
            sourceWidth={size.w}
            sourceHeight={size.h}
          />
        </div>

        <div className="controls">
          {!streaming ? (
            <button className="primary" onClick={start}>Start camera</button>
          ) : (
            <button className="danger" onClick={stop}>Stop</button>
          )}

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

          <label>
            JPEG quality
            <input
              type="range"
              min="0.3"
              max="0.95"
              step="0.05"
              value={quality}
              onChange={(e) => setQuality(parseFloat(e.target.value))}
            />
            <span className="mono">{quality.toFixed(2)}</span>
          </label>

          <span className="pill">FPS {fps.toFixed(1)}</span>
          {latency != null && (
            <span className="pill">latency {latency.toFixed(1)} ms</span>
          )}
        </div>
      </div>

      <ReportCard report={report} latency={latency} />
    </>
  );
}
