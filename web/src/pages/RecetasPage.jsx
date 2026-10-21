import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/index.js";
import { useRecetas } from "../hooks/useRecetas.js";
import KpiRow from "../components/KpiRow.jsx";
import RecipeCard from "../components/RecipeCard.jsx";
import SimuladorModal from "../components/SimuladorModal.jsx";
import { fmt, nameKey } from "../utils/format.js";

export default function RecetasPage() {
  const { recetas, loading, error, reload } = useRecetas();
  const [pmmList, setPmmList] = useState([]);
  const [simulacionesCount, setSimulacionesCount] = useState(0);

  const [search, setSearch] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [filterEstatus, setFilterEstatus] = useState("0");
  const [filterCalidad, setFilterCalidad] = useState("");
  const [threshold, setThreshold] = useState(30);
  const [page, setPage] = useState(1);
  const pageSize = 48;

  const [showMaster, setShowMaster] = useState(false);
  const [showMalif, setShowMalif] = useState(false);
  const [masterSearch, setMasterSearch] = useState("");
  const [malifSearch, setMalifSearch] = useState("");
  const [showSimulador, setShowSimulador] = useState(false);
  const [malifSummary, setMalifSummary] = useState(null);

  useEffect(() => {
    apiClient.getIngredientesPMM().then(setPmmList).catch(() => setPmmList([]));
    apiClient.getSimulaciones().then((s) => setSimulacionesCount(s.length)).catch(() => {});
    apiClient.getMalificacionResumen?.().then(setMalifSummary).catch(() => {});
  }, []);

  const categorias = useMemo(
    () => [...new Set(recetas.map((r) => r.resumen.desc_division || r.resumen.desc_tema).filter(Boolean))],
    [recetas]
  );

  const dupMap = useMemo(() => {
    const map = {};
    recetas.forEach((r) => {
      const k = nameKey(r.resumen.desc_receta);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }, [recetas]);

  const filtered = recetas.filter((r) => {
    const s = r.resumen;
    if (search && !(s.desc_receta || "").toLowerCase().includes(search.toLowerCase())) return false;
    if (filterSku && !(s.cod_sku_receta || "").toLowerCase().includes(filterSku.toLowerCase())) return false;
    if (filterCat && (s.desc_division || s.desc_tema) !== filterCat) return false;
    const status = String(s.cod_estado ?? (s.ind_activo === "T" ? 0 : 1));
    if (filterEstatus && status !== filterEstatus) return false;
    if (filterCalidad && s.estado_calidad !== filterCalidad) return false;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRecetas = filtered.slice((page - 1) * pageSize, page * pageSize);

  const masterFiltered = pmmList.filter(
    (i) => !masterSearch || (i.nombre || "").toLowerCase().includes(masterSearch.toLowerCase()) || (i.sku || "").includes(masterSearch)
  );

  const malifFiltered = recetas.filter(
    (r) =>
      !malifSearch ||
      (r.resumen.desc_receta || "").toLowerCase().includes(malifSearch.toLowerCase()) ||
      (r.resumen.cod_sku_receta || "").toLowerCase().includes(malifSearch.toLowerCase())
  );

  if (loading) return <div className="center-loading">Cargando recetas…</div>;
  if (error) return <div className="center-loading">Error: {error}</div>;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Dashboard de Recetas</h1>
          <p>
            Recetas de Panadería y Pastelería (J06) y Platos Preparados (J07). La formulación,
            los costos y las alertas vienen del modelo BigQuery.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setShowMaster((v) => !v)}>
            Precios base (PMM)
          </button>
          <button className="btn btn-ghost" onClick={() => setShowMalif((v) => !v)}>
            Malificación
          </button>
          <button className="btn btn-primary" onClick={() => setShowSimulador(true)}>
            + Simular receta nueva
          </button>
        </div>
      </div>

      <KpiRow recetas={recetas} simulacionesCount={simulacionesCount} />

      <div className="controls">
        <input type="text" placeholder="Buscar receta..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <input type="text" placeholder="Buscar por SKU..." value={filterSku} onChange={(e) => { setFilterSku(e.target.value); setPage(1); }} />
        <select value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(1); }}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={filterEstatus} onChange={(e) => {
          const status = e.target.value;
          setFilterEstatus(status);
          setPage(1);
          reload({ estado: status || "ALL" });
        }}>
          <option value="">Todos los estatus</option>
          <option value="0">Activo (ACT)</option>
          <option value="1">Inactivo (INA)</option>
          <option value="2">Descontinuado (DES)</option>
          <option value="98">Purgado (ARC)</option>
        </select>
        <select value={filterCalidad} onChange={(e) => { setFilterCalidad(e.target.value); setPage(1); }}>
          <option value="">Todos los estados</option>
          <option value="OK">OK</option>
          <option value="INCOMPLETO">Costeo incompleto</option>
          <option value="SIN_MALIFICACION">Sin malificación</option>
          <option value="SIN_PESO_PRODUCTO">Sin peso de producto</option>
          <option value="SIN_PRECIO">Sin precio</option>
        </select>
        <div className="threshold-group">
          Margen mínimo
          <input type="range" min="10" max="60" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          <b>{threshold}%</b>
        </div>
      </div>

      {showMaster && (
        <div className="panel">
          <div className="panel-head">
            <h2>Precios base de ingredientes (origen PMM)</h2>
            <button className="panel-close" onClick={() => setShowMaster(false)}>
              ✕ Cerrar
            </button>
          </div>
          <p className="sub">
            Costo vigente de reposición (F_COSTO_RPSC) sincronizado automáticamente desde BigQuery,
            normalizado al costo por kg/L/unidad según la presentación de compra.
          </p>
          <div className="info-note">
            🔒 Estos valores son de <b>solo lectura</b>: vienen del modelo de datos y se actualizan
            solos cada vez que cambia el costo en PMM. Si un costo se ve mal, repórtalo al equipo de
            datos — no se edita aquí. Para probar un ingrediente que aún no existe en PMM, usa el{" "}
            <button className="link-btn" onClick={() => setShowSimulador(true)}>
              Simulador de receta nueva
            </button>
            .
          </div>
          <input
            type="text"
            className="panel-search"
            placeholder="Buscar por SKU o nombre del insumo..."
            value={masterSearch}
            onChange={(e) => setMasterSearch(e.target.value)}
          />
          <div className="table-wrap">
            <table className="ptable">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Ingrediente</th>
                  <th style={{ textAlign: "right" }}>Costo</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {masterFiltered.map((i) => (
                  <tr key={i.sku}>
                    <td className="num">{i.sku}</td>
                    <td>{i.nombre}</td>
                    <td className="num readonly-val">
                      ${(i.costo_default ?? i.costo_kg ?? 0).toLocaleString("es-CL")} / {i.unidad_default || i.uom}
                    </td>
                    <td>
                      <span className="src-tag src-pmm">F_COSTO_RPSC</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showMalif && (
        <div className="panel">
          <div className="panel-head">
            <h2>Malificación del modelo</h2>
            <button className="panel-close" onClick={() => setShowMalif(false)}>
              ✕ Cerrar
            </button>
          </div>
          <p className="sub">
            Último cierre disponible por receta. Las bases se distribuyen por porciones;
            los productos finales por unidad reciben el importe por unidad vendida.
            Los costos por kg se convierten usando el peso.
          </p>
          <div className="row-metric">
            <span>Recetas con malificación vigente en la tabla</span>
            <b>{malifSummary?.recetas_vigentes ?? "—"}</b>
          </div>
          <div className="row-metric">
            <span>Filas cargadas con costo cero</span>
            <b>{malifSummary?.con_costo_cero ?? "—"}</b>
          </div>
          <div className="row-metric">
            <span>Último periodo cargado</span>
            <b>{malifSummary?.ultimo_periodo ?? "—"}</b>
          </div>
          <input
            type="text"
            className="panel-search"
            placeholder="Buscar por SKU o nombre de la receta..."
            value={malifSearch}
            onChange={(e) => setMalifSearch(e.target.value)}
          />
          <div className="table-wrap">
            <table className="ptable">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Receta</th>
                  <th>Periodo</th>
                  <th style={{ textAlign: "right" }}>Importe de origen</th>
                  <th style={{ textAlign: "right" }}>Costo unitario</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {malifFiltered.slice(0, 50).map((r) => {
                  const s = r.resumen;
                  const hasPeriod = s.periodo_malificacion != null;
                  const zeroCost = hasPeriod && s.costo_malificacion_kg === 0;
                  return (
                    <tr key={s.id_receta}>
                      <td className="num">{s.cod_sku_receta}</td>
                      <td>{s.desc_receta}</td>
                      <td>{s.periodo_malificacion || "—"}</td>
                      <td className="num readonly-val">{hasPeriod ? fmt(s.costo_malificacion_kg) : "Sin fila"}</td>
                      <td className="num">{hasPeriod ? fmt(s.costo_malificacion_unidad) : "No disponible"}</td>
                      <td>{!hasPeriod ? "Sin malificación" : zeroCost ? "Cargada en $0" : s.estado_calidad}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {malifFiltered.length > 50 && (
              <p className="sub">Mostrando 50 de {malifFiltered.length} recetas coincidentes.</p>
            )}
          </div>
        </div>
      )}

      <div className="grid">
        {filtered.length ? (
          pageRecetas.map((r) => (
            <RecipeCard key={r.resumen.id_receta} receta={r} dupCount={dupMap[nameKey(r.resumen.desc_receta)]} />
          ))
        ) : (
          <div className="empty">No hay recetas que calcen con el filtro.</div>
        )}
      </div>

      {filtered.length > pageSize && (
        <div className="actions" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
            Anterior
          </button>
          <span className="sub">Página {page} de {pageCount} · {filtered.length} recetas</span>
          <button className="btn btn-ghost" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={page === pageCount}>
            Siguiente
          </button>
        </div>
      )}

      {showSimulador && (
        <SimuladorModal
          pmmList={pmmList}
          categorias={categorias}
          threshold={threshold}
          onClose={() => setShowSimulador(false)}
          onCreated={() => {
            setShowSimulador(false);
            apiClient.getSimulaciones().then((s) => setSimulacionesCount(s.length));
            reload({ estado: filterEstatus || "ALL" });
          }}
        />
      )}
    </>
  );
}
