import { useEffect, useState } from "react";
import { getHealth } from "../lib/api.js";

export default function ModelStatusPill() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const h = await getHealth();
        if (!cancelled) {
          setInfo(h.model);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (error) return <span className="pill danger">backend offline</span>;
  if (!info) return <span className="pill">connecting…</span>;
  if (!info.ready) return <span className="pill danger">model error</span>;

  if (info.model_kind === "trained_pcb") {
    return (
      <span className="pill ok" title={info.weights}>
        ● trained: {info.weights}
      </span>
    );
  }
  if (info.model_kind === "pretrained_fallback") {
    return (
      <span
        className="pill warn"
        title="No best.pt found — running a pretrained fallback. Detections will not be PCB defects."
      >
        ● fallback: {info.weights}
      </span>
    );
  }
  return <span className="pill">{info.model_kind}</span>;
}
