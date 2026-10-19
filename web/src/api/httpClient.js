// Cliente real. Implementa exactamente la misma interfaz que mockClient.js
// para que ninguna pantalla necesite cambiar cuando se active.
const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${path}: ${body}`);
  }
  return res.json();
}

export const httpClient = {
  getIngredientesPMM: () => req("/api/ingredientes"),
  getRecetas: (options = {}) => {
    const params = new URLSearchParams();
    params.set("estado", options.estado ?? "0");
    if (options.q) params.set("q", options.q);
    return req(`/api/recetas?${params.toString()}`);
  },
  getReceta: (idReceta) => req(`/api/recetas/${idReceta}`),
  getAlertas: () => req("/api/alertas"),
  getMalificacionResumen: () => req("/api/malificacion/resumen"),
  getApiHealth: () => req("/api/health"),
  getBigQueryHealth: () => req("/api/health/bigquery"),
  getSimulaciones: () => req("/api/simulaciones"),
  crearSimulacion: (payload) =>
    req("/api/simulaciones", { method: "POST", body: JSON.stringify(payload) }),
};
