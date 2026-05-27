import { Link } from "react-router-dom";
import { PCB_CLASSES, colorFor, prettyClass } from "../lib/colors.js";

export default function HomePage() {
  return (
    <>
      <div className="card">
        <h1>PCB Defect Detection</h1>
        <p>
          A real-time computer-vision system that flags manufacturing defects on
          bare PCBs. One YOLO model serves both this web app and an on-device
          Android counterpart.
        </p>
        <div className="row" style={{ marginTop: 8 }}>
          <Link to="/live" className="card" style={{ flex: 1, textDecoration: "none" }}>
            <h3>Live</h3>
            <p>Stream your webcam and see defects boxed in real time.</p>
          </Link>
          <Link to="/upload" className="card" style={{ flex: 1, textDecoration: "none" }}>
            <h3>Upload</h3>
            <p>Drop a still image and get a PASS / FAIL report.</p>
          </Link>
          <Link to="/metrics" className="card" style={{ flex: 1, textDecoration: "none" }}>
            <h3>Metrics</h3>
            <p>Inspect the loaded model and training-run artefacts.</p>
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>Defect classes</h2>
        <p>The detector is trained on six standard bare-board copper defects.</p>
        <div className="class-grid">
          {PCB_CLASSES.map((cls, i) => (
            <div
              key={cls}
              className="chip"
              style={{ borderLeftColor: colorFor(cls, i) }}
            >
              <div className="name">{prettyClass(cls)}</div>
              <div className="muted mono" style={{ fontSize: 11 }}>{i}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
