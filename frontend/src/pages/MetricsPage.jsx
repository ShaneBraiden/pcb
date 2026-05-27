import { useEffect, useState } from "react";
import { getMetrics, runArtefactUrl } from "../lib/api.js";
import { colorFor, prettyClass } from "../lib/colors.js";

export default function MetricsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const m = await getMetrics();
        if (!cancelled) {
          setData(m);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    };
    load();
    const t = setInterval(load, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (error) return <div className="banner error">{error}</div>;
  if (!data) return <div className="card">Loading…</div>;

  const { inference, model, runs = [] } = data;

  return (
    <>
      <div className="card">
        <h1>Metrics</h1>
        <p>Live inference stats and training-run artefacts.</p>
      </div>

      <div className="card">
        <h2>Model</h2>
        {!model.ready && (
          <div className="banner error">{model.error || "model not loaded"}</div>
        )}
        <div className="stat-grid">
          <div className="stat"><div className="label">Kind</div><div className="value" style={{ fontSize: 16 }}>{model.model_kind}</div></div>
          <div className="stat"><div className="label">Weights</div><div className="value mono" style={{ fontSize: 16 }}>{model.weights || "—"}</div></div>
          <div className="stat"><div className="label">Classes</div><div className="value">{model.classes?.length ?? 0}</div></div>
        </div>
        {model.classes && model.classes.length > 0 && (
          <div className="class-grid">
            {model.classes.slice(0, 24).map((c) => (
              <div
                key={c.id}
                className="chip"
                style={{ borderLeftColor: colorFor(c.name, c.id) }}
              >
                <div className="name">{prettyClass(c.name)}</div>
                <div className="muted mono" style={{ fontSize: 11 }}>{c.id}</div>
              </div>
            ))}
            {model.classes.length > 24 && (
              <div className="chip"><div className="muted">+{model.classes.length - 24} more</div></div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Inference</h2>
        <div className="stat-grid">
          <div className="stat"><div className="label">Total calls</div><div className="value">{inference.total_calls}</div></div>
          <div className="stat"><div className="label">Last (ms)</div><div className="value">{inference.last_ms}</div></div>
          <div className="stat"><div className="label">Rolling avg (ms)</div><div className="value">{inference.rolling_avg_ms}</div></div>
          <div className="stat"><div className="label">FPS (rolling)</div><div className="value">{inference.fps_rolling}</div></div>
        </div>
      </div>

      <div className="card">
        <h2>Training runs</h2>
        {runs.length === 0 ? (
          <p className="muted">
            No runs yet. Train the model with <code>python train.py</code> and
            the artefacts under <code>runs/</code> will show up here.
          </p>
        ) : (
          <div className="runs-list">
            {runs.map((r) => (
              <div className="run" key={r.name}>
                <h3>
                  {r.name}{" "}
                  {r.has_weights && <span className="pill ok">best.pt</span>}
                </h3>
                {Object.keys(r.artefacts).length === 0 ? (
                  <p className="muted">No artefacts in this run.</p>
                ) : (
                  <div className="artefacts">
                    {Object.entries(r.artefacts).map(([name, url]) => (
                      <div key={name}>
                        <div className="muted mono" style={{ fontSize: 12, marginBottom: 6 }}>{name}</div>
                        {name.endsWith(".png") ? (
                          <img src={runArtefactUrl(url)} alt={name} />
                        ) : (
                          <a href={runArtefactUrl(url)} target="_blank" rel="noreferrer">Download</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
