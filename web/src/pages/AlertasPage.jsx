import { useEffect, useState } from "react";
import { apiClient } from "../api/index.js";

const PAGE_SIZE = 50;

const LABELS = {
  COMPONENTE_SIN_COSTO: "Componente sin costo",
  RECETA_DUPLICADA: "Recetas duplicadas",
  MARGEN_BAJO_MINIMO: "Margen bajo el mínimo",
  ALZA_MATERIA_PRIMA: "Alza de materia prima",
  ALZA_MALIFICACION: "Alza de Malificación",
  SIN_MALIFICACION: "Sin Malificación cargada",
  SIN_PESO_PRODUCTO: "Sin peso de producto",
  MALIFICACION_DESFASADA: "Malificación desfasada",
  DIFERENCIA_RENDIMIENTO: "Diferencia de rendimiento",
  MULTIPLES_CABECERAS: "Múltiples cabeceras",
  CONTIENE_BORRADOR: "Simulación con insumos sin registrar",
};

export default function AlertasPage() {
  const [alertas, setAlertas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pages, setPages] = useState({});

  useEffect(() => {
    apiClient.getAlertas()
      .then(setAlertas)
      .catch((e) => setError(e.message || "No fue posible cargar alertas."))
      .finally(() => setLoading(false));
  }, []);

  const groups = {};
  alertas.forEach((a) => {
    (groups[a.tipo_alerta] = groups[a.tipo_alerta] || []).push(a);
  });

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Alertas</h1>
          <p>Alertas de recetas activas de Panadería, Pastelería y Platos Preparados.</p>
        </div>
      </div>

      {loading ? (
        <div className="center-loading">Cargando…</div>
      ) : error ? (
        <div className="center-loading">{error}</div>
      ) : Object.keys(groups).length === 0 ? (
        <div className="empty">Sin alertas activas.</div>
      ) : (
        Object.entries(groups).map(([tipo, items]) => {
          const page = pages[tipo] || 1;
          const pageCount = Math.ceil(items.length / PAGE_SIZE);
          const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
          return (
            <div className="panel" key={tipo} style={{ marginBottom: 14 }}>
              <h2>
                {LABELS[tipo] || tipo} <span className="badge low" style={{ marginLeft: 8 }}>{items.length}</span>
              </h2>
              <div className="table-wrap">
                <table className="ptable">
                  <thead>
                    <tr>
                      <th>Receta</th>
                      <th>SKU</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((a, i) => (
                      <tr key={`${a.id_receta}-${a.tipo_alerta}-${i}`}>
                        <td>{a.receta}</td>
                        <td className="num">{a.sku}</td>
                        <td>{a.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 && (
                <div className="actions" style={{ justifyContent: "center", marginTop: 12 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setPages((current) => ({ ...current, [tipo]: Math.max(1, page - 1) }))}
                    disabled={page === 1}
                  >
                    Anterior
                  </button>
                  <span className="sub">Página {page} de {pageCount}</span>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setPages((current) => ({ ...current, [tipo]: Math.min(pageCount, page + 1) }))}
                    disabled={page === pageCount}
                  >
                    Siguiente
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
