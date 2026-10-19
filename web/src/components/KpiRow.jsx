import { fmtPct, nameKey } from "../utils/format.js";

export default function KpiRow({ recetas, simulacionesCount }) {
  const activas = recetas.filter((r) => String(r.resumen.cod_estado ?? (r.resumen.ind_activo === "T" ? 0 : 1)) === "0");
  const conMargen = activas.filter(
    (r) => r.resumen.estado_calidad === "OK" && r.resumen.margen_final_pct != null
  );
  const margenProm = conMargen.length
    ? conMargen.reduce((s, r) => s + r.resumen.margen_final_pct, 0) / conMargen.length
    : 0;

  const bajoMargen = activas.filter(
    (r) => r.resumen.estado_calidad === "OK" && r.resumen.bajo_margen_minimo === true
  ).length;

  const dupMap = {};
  activas.forEach((r) => {
    const k = nameKey(r.resumen.desc_receta);
    dupMap[k] = (dupMap[k] || 0) + 1;
  });
  const dup = activas.filter((r) => dupMap[nameKey(r.resumen.desc_receta)] > 1).length;

  const sinMalificacion = activas.filter(
    (r) => r.resumen.periodo_malificacion == null && r.resumen.estado_calidad !== "SIMULACION"
  ).length;
  const incompletas = activas.filter((r) => ["INCOMPLETO", "SIN_PESO_PRODUCTO", "SIN_PRECIO"].includes(r.resumen.estado_calidad)).length;
  const alzaMP = activas.filter((r) => (r.resumen.variacion_mp_monto || 0) > 0).length;

  const kpis = [
    { label: "Recetas activas", value: activas.length, cls: "" },
    { label: "Margen final promedio", value: fmtPct(margenProm), cls: "ok" },
    { label: "Bajo margen mínimo", value: bajoMargen, cls: bajoMargen > 0 ? "alert" : "ok" },
    { label: "Recetas duplicadas", value: dup, cls: dup > 0 ? "alert" : "ok" },
    { label: "Alza de materia prima", value: alzaMP, cls: alzaMP > 0 ? "alert" : "ok" },
    {
      label: "Sin malificación",
      value: sinMalificacion,
      sub: sinMalificacion > 0 ? "No se calcula margen final" : undefined,
      cls: sinMalificacion > 0 ? "alert" : "ok",
    },
    { label: "Costeo incompleto", value: incompletas, cls: incompletas > 0 ? "alert" : "ok" },
    { label: "Simulaciones en curso", value: simulacionesCount, cls: "info" },
  ];

  return (
    <div className="kpis">
      {kpis.map((k) => (
        <div className={"kpi " + k.cls} key={k.label}>
          <div className="stamp-corner" />
          <div className="label">{k.label}</div>
          <div className="value">{k.value}</div>
          {k.sub && <div className="sub">{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}
