// Single source of truth for backend URLs. Vite proxies /api -> :8000 in dev.

const API_BASE = "/api";

export async function getHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`health: ${res.status}`);
  return res.json();
}

export async function getMetrics() {
  const res = await fetch(`${API_BASE}/metrics`);
  if (!res.ok) throw new Error(`metrics: ${res.status}`);
  return res.json();
}

export async function detectFile(file, conf = 0.35) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/detect?conf=${conf}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`detect failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Build a same-origin WebSocket URL so the Vite dev proxy can upgrade it.
export function wsUrl(path = "/api/ws") {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export function runArtefactUrl(path) {
  // backend returns absolute /api/runs/... paths already
  return path;
}
