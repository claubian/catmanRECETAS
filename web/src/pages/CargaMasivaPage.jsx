import { useCallback, useEffect, useState } from "react";
import { apiClient, isMock } from "../api/index.js";

export default function CargaMasivaPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await apiClient.getMalificacionResumen());
    } catch (e) {
      setError(e.message || "No fue posible consultar la malificación.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Malificación en BigQuery</h1>
          <p>
            La carga mensual se realiza en BigQuery. Esta pantalla consulta el historial disponible;
            no carga ni modifica datos.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={reload} disabled={loading}>
            {loading ? "Consultando…" : "Actualizar resumen"}
          </button>
        </div>
      </div>

      {isMock && (
        <div className="info-note warn">
          Modo demostración: estos indicadores no representan el contenido actual de BigQuery.
        </div>
      )}

      {loading ? (
        <div className="center-loading">Consultando BigQuery…</div>
      ) : error ? (
        <div className="panel"><div className="alert-box danger">{error}</div></div>
      ) : (
        <div className="panel">
          <h2>Estado del historial</h2>
          <div className="row-metric">
            <span>Filas vigentes en el historial</span>
            <b>{Number(summary?.filas_vigentes || 0).toLocaleString("es-CL")}</b>
          </div>
          <div className="row-metric">
            <span>Recetas con malificación vigente</span>
            <b>{Number(summary?.recetas_vigentes || 0).toLocaleString("es-CL")}</b>
          </div>
          <div className="row-metric">
            <span>Recetas con costo positivo</span>
            <b>{Number(summary?.con_costo_positivo || 0).toLocaleString("es-CL")}</b>
          </div>
          <div className="row-metric">
            <span>Recetas con costo cargado en cero</span>
            <b>{Number(summary?.con_costo_cero || 0).toLocaleString("es-CL")}</b>
          </div>
          <div className="row-metric">
            <span>Último periodo cargado</span>
            <b>{summary?.ultimo_periodo || "Sin periodos"}</b>
          </div>
          <p className="sub" style={{ marginTop: 14 }}>
            “Sin malificación” significa que no hay una fila aplicable para la receta y periodo del
            costeo. Un valor cargado de $0 se conserva y se muestra como cero.
          </p>
        </div>
      )}
    </>
  );
}