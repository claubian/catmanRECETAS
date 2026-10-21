import { useState } from "react";
import { apiClient } from "../api/index.js";
import { fmt, fmtPct } from "../utils/format.js";

const QUALITY_LABELS = {
  OK: "Margen OK",
  INCOMPLETO: "Costeo incompleto",
  SIN_MALIFICACION: "Sin malificación",
  SIN_PRECIO: "Sin precio",
  SIN_PESO_PRODUCTO: "Sin peso de producto",
  SIMULACION: "Simulación",
};

const FINAL_COST_UNAVAILABLE = new Set([
  "INCOMPLETO",
  "SIN_PESO_PRODUCTO",
]);

function productStatus(summary) {
  const labels = { 0: "Activo", 1: "Inactivo", 2: "Descontinuado", 98: "Purgado" };
  return labels[String(summary.cod_estado)] || (summary.ind_activo === "T" ? "Activo" : "Inactivo");
}

export default function RecipeCard({ receta, dupCount, isSimulation }) {
  const [open, setOpen] = useState(false);
  const [loadedDetail, setLoadedDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const s = receta.resumen;
  const detail = loadedDetail?.detalle || receta.detalle || [];
  const quality = s.estado_calidad || "OK";
  const malificacionMissing = quality === "SIN_MALIFICACION" || (
    quality !== "SIMULACION" &&
    s.periodo_malificacion == null &&
    s.costo_malificacion_kg == null
  );
  const malificacionKg = s.costo_malificacion_kg;
  const malificacionBasis = s.base_malificacion || "KG";
  const malificacionUnit = malificacionBasis === "LOTE_POR_PORCIONES"
    ? "porción"
    : malificacionBasis === "UNIDAD_VENTA" ? "unidad vendida" : "kg";
  const malificacionDescription = malificacionBasis === "LOTE_POR_PORCIONES"
    ? `Importe del lote ${fmt(s.costo_malificacion_origen)} dividido entre ${s.porciones_cantidad ?? "sin dato de"} porciones`
    : `Importe informado por ${malificacionUnit}`;
  const hasFinalCost = !FINAL_COST_UNAVAILABLE.has(quality) && quality !== "SIMULACION" && s.costo_final_unidad != null;
  const hasFinalMargin = hasFinalCost && s.margen_final_pct != null && quality !== "SIN_PRECIO";
  const isDup = dupCount > 1;
  const isLow = quality === "OK" && s.bajo_margen_minimo === true;
  const isDegraded = quality !== "OK" && quality !== "SIMULACION";
  const barColor = isLow ? "var(--highlight)" : "var(--secondary)";
  const barWidth =
    hasFinalMargin
      ? Math.max(4, Math.min(100, s.margen_final_pct * 100))
      : 4;
  const estadoTxt = productStatus(s);

  async function toggleDetail() {
    if (open) {
      setOpen(false);
      return;
    }
    if (!isSimulation && !loadedDetail && !receta.detalle?.length) {
      setDetailLoading(true);
      setDetailError("");
      try {
        setLoadedDetail(await apiClient.getReceta(s.id_receta));
      } catch (error) {
        setDetailError(error.message || "No fue posible cargar los ingredientes.");
      } finally {
        setDetailLoading(false);
      }
    }
    setOpen(true);
  }

  let badgeLabel = "Margen OK";
  let badgeCls = "ok";
  if (isDegraded) {
    badgeLabel = QUALITY_LABELS[quality] || "Costeo incompleto";
    badgeCls = "degraded";
  } else if (s.es_intermedia) {
    badgeLabel = "Receta intermedia";
    badgeCls = "na";
  } else if (isLow) {
    badgeLabel = "Bajo margen";
    badgeCls = "low";
  } else if (quality === "SIMULACION") {
    badgeLabel = "Simulación";
    badgeCls = "na";
  }

  return (
    <div
      className={
        "card" + (isLow ? " is-low" : "") + (isDup ? " is-dup" : "") + (isDegraded ? " is-degraded" : "")
      }
    >
      {isDup && <div className="stamp">Duplicada</div>}
      <div className="card-head">
        <div>
          <div className="cat">
            {s.desc_division || s.desc_tema || s.cod_tema || "Sin categoría"} ·{" "}
            <span className={"estatus-tag estatus-" + estadoTxt.toLowerCase()}>{estadoTxt}</span>{" "}
            {isSimulation && <span className="src-tag src-draft">Simulación</span>}
          </div>
          <h3>{s.desc_receta}</h3>
          <div className="sku-tag">SKU {s.cod_sku_receta}</div>
        </div>
        <span className={"badge " + badgeCls}>{badgeLabel}</span>
      </div>

      <div className="card-body">
        <div className="row-metric">
          <span>Costo MP por {s.unidad_venta?.toLowerCase() || "unidad"}</span>
          <b>{fmt(s.costo_mp_unidad_venta ?? s.costo_mp_total)}</b>
        </div>
        <div className="row-metric">
          <span>
            Malificación{malificacionBasis === "LOTE_POR_PORCIONES" ? " por porción" : ""}
            {!malificacionMissing && s.periodo_malificacion && (
              <span
                className="src-tag src-pmm"
                style={{ marginLeft: 6 }}
                title={`${malificacionDescription}, periodo ${s.periodo_malificacion}`}
              >
                {s.periodo_malificacion.slice(0, 7)} · $/{malificacionUnit}
              </span>
            )}
          </span>
          <b>
            {quality === "SIMULACION"
              ? "No incorporada"
              : malificacionMissing
              ? "Sin malificación"
              : quality === "SIN_PESO_PRODUCTO" && malificacionKg != null
              ? `${fmt(malificacionKg)} / kg · falta peso`
              : fmt(s.costo_malificacion_unidad)}
          </b>
        </div>
        <div className="row-metric total">
          <span>{quality === "SIMULACION" ? "Costo final estimado (sin malificación)" : malificacionMissing ? "Costo final sin malificación (sin IVA)" : "Costo final (sin IVA)"}</span>
          <b className={hasFinalCost ? "" : "not-available"}>
            {hasFinalCost ? fmt(s.costo_final_unidad) : "No disponible"}
          </b>
        </div>
        {!s.es_intermedia && <div className="row-metric">
          <span>Precio de venta (con IVA)</span>
          <b>{fmt(s.precio_venta_bruto)}</b>
        </div>}
        {!s.es_intermedia && <div className="row-metric">
          <span>{quality === "SIMULACION" ? "Margen final estimado" : "Margen final (sobre neto)"}</span>
          <b>{hasFinalMargin ? fmtPct(s.margen_final_pct) : "No disponible"}</b>
        </div>}
        {!hasFinalMargin && s.margen_mp_pct != null && (
          <div className="row-metric">
            <span>{quality === "SIMULACION" ? "Margen MP estimado" : "Margen solo MP (referencial)"}</span>
            <b>{fmtPct(s.margen_mp_pct)}</b>
          </div>
        )}

        {(receta.alertas || []).map((a, i) => (
          <div
            key={i}
            className={"alert-box " + (["SIN_MALIFICACION", "SIN_PESO_PRODUCTO"].includes(a.tipo_alerta) ? "danger" : "warn")}
          >
            ⚠ {a.detalle}
          </div>
        ))}

        {hasFinalMargin && (
          <div className="margin-bar-track">
            <div className="margin-bar-fill" style={{ width: barWidth + "%", background: barColor }} />
          </div>
        )}

        <button className="toggle-ing" onClick={toggleDetail} disabled={detailLoading}>
          {detailLoading ? "Cargando ingredientes…" : open ? "Ocultar ingredientes ▴" : "Ver ingredientes ▾"}
        </button>

        {open && (
          <div className="ing-list">
            {detailError && <div className="alert-box danger">{detailError}</div>}
            <table>
              <thead>
                <tr>
                  <th>Ingrediente</th>
                  <th>SKU</th>
                  <th style={{ textAlign: "right" }}>Cant.</th>
                  <th></th>
                  <th style={{ textAlign: "right" }}>Costo</th>
                </tr>
              </thead>
              <tbody>
                {detail.length ? (
                  detail.map((i, idx) => (
                    <tr key={idx}>
                      <td>
                        {i.desc_ingrediente}{" "}
                        {i.origen === "DRAFT" && <span className="src-tag src-draft">Borrador</span>}
                      </td>
                      <td className="num">{i.cod_sku_ingrediente}</td>
                      <td className="num">{i.cantidad}</td>
                      <td>{i.uom_receta}</td>
                      <td className="num">{fmt(i.costo_componente)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ color: "var(--ink-soft)", padding: "8px 0" }}>
                      Sin componentes registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
