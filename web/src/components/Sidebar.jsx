import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { apiClient, isMock } from "../api/index.js";

const items = [
  {
    to: "/",
    label: "Recetas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/simulador",
    label: "Simulador de recetas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 3v4M15 3v4M4 8h16M6 8v11a2 2 0 002 2h8a2 2 0 002-2V8" />
      </svg>
    ),
  },
  {
    to: "/alertas",
    label: "Alertas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 01-3.4 0" />
      </svg>
    ),
  },
  {
    to: "/carga-masiva",
    label: "Malificación en BigQuery",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v12" />
        <path d="M7 8l5-5 5 5" />
        <path d="M4 17v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
      </svg>
    ),
  },
];

const connLabel = { checking: "Comprobando…", ok: "Conectado", error: "Sin conexión" };

export default function Sidebar({ alertCount }) {
  const [conn, setConn] = useState({ api: "checking", bigquery: "checking" });

  useEffect(() => {
    if (isMock) return;
    Promise.allSettled([apiClient.getApiHealth(), apiClient.getBigQueryHealth()]).then(([a, b]) =>
      setConn({
        api: a.status === "fulfilled" ? "ok" : "error",
        bigquery: b.status === "fulfilled" ? "ok" : "error",
      })
    );
  }, []);

  return (
    <aside className="sidebar">
      <div className="brand">
        Recetas<span>.</span>BI
      </div>
      <div className="brand-sub">Panadería · Pastelería · Platos Preparados</div>

      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.to === "/"}
          className={({ isActive }) => "nav-item" + (isActive ? " active" : "")}
        >
          {it.icon}
          {it.label}
          {it.to === "/alertas" && alertCount > 0 && (
            <span className="nav-badge">{alertCount}</span>
          )}
        </NavLink>
      ))}

      <div className="sidebar-foot">
        <span className={"env-tag" + (isMock ? "" : " real")}>
          {isMock ? "MOCK · datos de prueba" : "API · BigQuery"}
        </span>
        <br />
        {isMock ? (
          <>
            Este frontend usa fixtures de demostración. Activa VITE_USE_MOCK
            solo para probar sin consultar la API.
          </>
        ) : (
          <>
            <div className="conn">
              <span className={"conn-dot " + conn.api} /> API: {connLabel[conn.api]}
            </div>
            <div className="conn">
              <span className={"conn-dot " + conn.bigquery} /> BigQuery: {connLabel[conn.bigquery]}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
