import { RECETAS_INICIALES, PMM_INGREDIENTES } from "./mockData.js";

// Estado en memoria (se pierde al recargar la página; es solo para probar
// el frontend). El backend real reemplazará cada función por un fetch.
let recetas = structuredClone(RECETAS_INICIALES);
let simulaciones = [];
let nextSimId = 900001;

const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms));

function nameKey(n) {
  return (n || "").trim().toLowerCase();
}

export function computeDupCounts(list) {
  const map = {};
  list.forEach((r) => {
    const k = nameKey(r.resumen.desc_receta);
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}

export const mockClient = {
  async getIngredientesPMM() {
    await wait(120);
    return structuredClone(PMM_INGREDIENTES);
  },

  async getRecetas() {
    await wait();
    return structuredClone(recetas);
  },

  async getReceta(idReceta) {
    await wait(120);
    const r = recetas.find((x) => x.resumen.id_receta === idReceta);
    return r ? structuredClone(r) : null;
  },

  async getAlertas() {
    await wait();
    const out = [];
    recetas.forEach((r) =>
      r.alertas.forEach((a) =>
        out.push({ ...a, receta: r.resumen.desc_receta, sku: r.resumen.cod_sku_receta })
      )
    );
    return out;
  },

  async getMalificacionResumen() {
    await wait(100);
    const conFila = recetas.filter((r) => r.resumen.periodo_malificacion != null);
    return {
      filas_vigentes: conFila.length,
      recetas_vigentes: conFila.length,
      con_costo_positivo: conFila.filter((r) => r.resumen.costo_malificacion_kg > 0).length,
      con_costo_cero: conFila.filter((r) => r.resumen.costo_malificacion_kg === 0).length,
      ultimo_periodo: conFila.map((r) => r.resumen.periodo_malificacion).sort().at(-1) || null,
    };
  },

  async getSimulaciones() {
    await wait();
    return structuredClone(simulaciones);
  },

  async crearSimulacion({ nombre, categoria, precio, rendimientoCantidad, rendimientoUnidad, ingredientes }) {
    await wait(300);
    const costoMP = ingredientes.reduce((s, i) => s + i.cantidad * i.costo, 0);
    const precioNeto = precio > 0 ? precio / 1.19 : 0;
    const margen = precioNeto > 0 ? (precioNeto - costoMP) / precioNeto : 0;
    const contieneDraft = ingredientes.some((i) => i.tipo === "nuevo");
    const idSim = nextSimId++;

    const nueva = {
      resumen: {
        id_receta: idSim,
        cod_sku_receta: "SIM-" + idSim,
        desc_receta: nombre.toUpperCase(),
        ind_activo: "T",
        cod_tema: categoria,
        desc_tema: categoria,
        costo_mp_total: costoMP,
        rendimiento_cantidad: rendimientoCantidad,
        rendimiento_uom: rendimientoUnidad.toUpperCase(),
        porciones_cantidad: 1,
        porciones_teoricas: 1,
        costo_mp_por_kg: rendimientoUnidad === "kg" ? costoMP / rendimientoCantidad : null,
        unidad_venta: rendimientoUnidad === "kg" ? "KG" : "UN",
        costo_mp_unidad_venta: costoMP,
        periodo_malificacion: null,
        costo_malificacion_kg: null,
        peso_kg_unidad_venta: null,
        costo_malificacion_unidad: null,
        costo_final_unidad: null,
        precio_venta_bruto: precio || null,
        precio_venta_neto: precioNeto || null,
        margen_mp_pct: margen,
        margen_final_pct: null,
        componentes_total: ingredientes.length,
        componentes_sin_costo: 0,
        estado_calidad: "SIMULACION",
        margen_minimo_oficial: 0.3,
        bajo_margen_minimo: precio > 0 ? margen < 0.3 : null,
        variacion_mp_monto: 0,
        variacion_mp_pct: 0,
        impacto_margen_pp: null,
        origen: "SIMULACION",
      },
      detalle: ingredientes.map((i) => ({
        cod_sku_ingrediente: i.tipo === "nuevo" ? "BORRADOR" : "PMM",
        desc_ingrediente: i.nombre,
        cantidad: i.cantidad,
        uom_receta: i.unidad.toUpperCase(),
        costo_componente: i.cantidad * i.costo,
        origen: i.tipo === "nuevo" ? "DRAFT" : "PMM",
      })),
      alertas: contieneDraft
        ? [{ tipo_alerta: "CONTIENE_BORRADOR", detalle: "Esta simulación usa insumos aún no registrados en PMM." }]
        : [],
    };

    simulaciones = [...simulaciones, nueva];
    return structuredClone(nueva);
  },
};
