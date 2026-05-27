import { colorFor, prettyClass } from "../lib/colors.js";

/**
 * Renders a PASS/FAIL verdict and a per-class breakdown.
 *
 * Props:
 *   report:   { total, by_class, max_conf_by_class, verdict }
 *   latency:  number (ms) — optional
 */
export default function ReportCard({ report, latency }) {
  if (!report) {
    return (
      <div className="card">
        <h2>Report</h2>
        <p className="muted">Awaiting a detection result…</p>
      </div>
    );
  }

  const { verdict, total, by_class = {}, max_conf_by_class = {} } = report;
  const entries = Object.entries(by_class).sort((a, b) => b[1] - a[1]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ marginBottom: 0 }}>Report</h2>
        <span className={`verdict ${verdict === "PASS" ? "pass" : "fail"}`}>
          {verdict}
        </span>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="label">Total defects</div>
          <div className="value">{total}</div>
        </div>
        <div className="stat">
          <div className="label">Classes hit</div>
          <div className="value">{entries.length}</div>
        </div>
        {typeof latency === "number" && (
          <div className="stat">
            <div className="label">Latency</div>
            <div className="value">{latency.toFixed(1)} ms</div>
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <div className="class-grid">
          {entries.map(([cls, count]) => (
            <div
              key={cls}
              className="chip"
              style={{ borderLeftColor: colorFor(cls) }}
            >
              <div>
                <div className="name">{prettyClass(cls)}</div>
                {max_conf_by_class[cls] != null && (
                  <div className="muted" style={{ fontSize: 11 }}>
                    max conf {(max_conf_by_class[cls] * 100).toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="count">{count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
