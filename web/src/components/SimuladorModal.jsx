import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/index.js";
import { nameKey } from "../utils/format.js";

const MAX_OPTIONS = 50;

function IngredientPicker({ value, onChange, pmmList, enabled }) {
  const [open, setOpen] = useState(false);
  const options = useMemo(() => {
    if (!enabled || !open) return [];
    const tokens = nameKey(value).split(" ").filter(Boolean);
    const out = [];
    for (const i of pmmList) {
      const hay = nameKey(i.nombre) + " " + (i.sku || "");
      if (tokens.every((t) => hay.includes(t))) {
        out.push(i);
        if (out.length >= MAX_OPTIONS) break;
      }
    }
    return out;
  }, [value, pmmList, enabled, open]);

  return (
    <div className="combo">
      <input
        type="text"
        placeholder={enabled ? "Buscar ingrediente o SKU" : "Nombre del insumo"}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        autoComplete="off"
      />
      {open && enabled && (
        <ul className="combo-list" role="listbox">
          {options.length === 0 && <li className="combo-empty">Sin coincidencias en PMM</li>}
          {options.map((i) => (
            <li
              key={i.id_ingrediente ?? i.sku}
              role="option"
              onMouseDown={(e) => { e.preventDefault(); onChange(i.nombre); setOpen(false); }}
            >
              <span>{i.nombre}</span>
              <small>{i.sku}</small>
            </li>
          ))}
          {options.length === MAX_OPTIONS && (
            <li className="combo-empty">Mostrando los primeros {MAX_OPTIONS}. Sigue escribiendo para afinar.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function IngredientRow({ row, onChange, onRemove, pmmList }) {
  const match = useMemo(
    () => pmmList.find((i) => nameKey(i.nombre) === nameKey(row.nombre)),
    [row.nombre, pmmList]
  );

  useEffect(() => {
    if (row.tipo === "pmm" && !match && row.costo !== "") {
      onChange({ ...row, costo: "" });
      return;
    }
    if (row.tipo === "pmm" && match) {
      const unit = match.costos_por_uom?.[row.unidad] != null
        ? row.unidad
        : match.unidad_default || match.uom;
      const cost = match.costos_por_uom?.[unit] ?? match.costo_default ?? match.costo_kg;
      if (row.unidad !== unit || Number(row.costo) !== Number(cost)) {
        onChange({ ...row, costo: cost, unidad: unit });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.tipo, row.unidad, row.costo, match]);

  let hint = "";
  if (row.tipo === "pmm") {
    hint = match
      ? `Costo sincronizado: $${Number(match.costos_por_uom?.[row.unidad] ?? match.costo_default ?? match.costo_kg).toLocaleString("es-CL")} / ${row.unidad} — no editable.`
      : row.nombre.trim()
      ? 'No se encontró en PMM. Cambia a "Insumo nuevo" si aún no está registrado.'
      : "Elige un ingrediente ya sincronizado desde PMM.";
  } else {
    hint = "Ingresa el costo estimado. Este insumo no existe en PMM — la receta quedará marcada como simulación.";
  }
  const unitOptions = row.tipo === "pmm" && match
    ? Object.keys(match.costos_por_uom || {})
    : ["kg", "g", "l", "ml", "unid"];

  return (
    <div className="ing-row">
      <select value={row.tipo} onChange={(e) => onChange({ ...row, tipo: e.target.value })}>
        <option value="pmm">Ingrediente PMM (costo fijo)</option>
        <option value="nuevo">Insumo nuevo (borrador)</option>
      </select>
      <IngredientPicker
        value={row.nombre}
        pmmList={pmmList}
        enabled={row.tipo === "pmm"}
        onChange={(nombre) => onChange({ ...row, nombre })}
      />
      <input
        type="number"
        min="0"
        step="0.001"
        placeholder="Cant."
        value={row.cantidad}
        onChange={(e) => onChange({ ...row, cantidad: e.target.value })}
      />
      <select
        value={row.unidad}
        onChange={(e) => {
          const unidad = e.target.value;
          const costo = row.tipo === "pmm" ? match?.costos_por_uom?.[unidad] : row.costo;
          onChange({ ...row, unidad, costo: costo ?? "" });
        }}
      >
        {unitOptions.map((unit) => (
          <option key={unit} value={unit}>{unit}</option>
        ))}
      </select>
      <input
        type="number"
        min="0"
        step="1"
        placeholder="Costo/unid"
        value={row.costo}
        disabled={row.tipo === "pmm"}
        onChange={(e) => onChange({ ...row, costo: e.target.value })}
      />
      <button type="button" className="ing-row-remove" onClick={onRemove} title="Quitar">
        ✕
      </button>
      <div className="ing-hint">
        {row.tipo === "pmm" ? (
          <span>
            <span className="src-tag src-pmm">PMM</span> {hint}
          </span>
        ) : (
          <span>
            <span className="src-tag src-draft">Borrador</span> {hint}
          </span>
        )}
      </div>
    </div>
  );
}

let rowIdSeq = 1;
const blankRow = () => ({ id: rowIdSeq++, tipo: "pmm", nombre: "", cantidad: "", unidad: "kg", costo: "" });

export default function SimuladorModal({ pmmList, categorias, onClose, onCreated, threshold }) {
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precio, setPrecio] = useState("");
  const [rendCant, setRendCant] = useState("1");
  const [rendUnidad, setRendUnidad] = useState("unid");
  const [rows, setRows] = useState([blankRow()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function updateRow(id, next) {
    setRows((rs) => rs.map((r) => (r.id === id ? next : r)));
  }
  function removeRow(id) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  const costoMP = rows.reduce((s, r) => s + (Number(r.cantidad) || 0) * (Number(r.costo) || 0), 0);
  const precioNum = Number(precio) || 0;
  const precioNeto = precioNum > 0 ? precioNum / 1.19 : 0;
  const margen = precioNeto > 0 ? ((precioNeto - costoMP) / precioNeto) * 100 : 0;
  const tieneDraft = rows.some((r) => r.tipo === "nuevo");

  async function handleSave() {
    const nombreTrim = nombre.trim();
    const catTrim = categoria.trim();
    const validas = rows.filter((r) => r.nombre.trim() && Number(r.cantidad) > 0);

    if (!nombreTrim || !catTrim) {
      setError("Completa nombre y categoría.");
      return;
    }
    if (!validas.length) {
      setError("Agrega al menos un ingrediente con cantidad.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await apiClient.crearSimulacion({
        nombre: nombreTrim,
        categoria: catTrim,
        precio: precioNum,
        rendimientoCantidad: Number(rendCant) || 1,
        rendimientoUnidad: rendUnidad,
        ingredientes: validas.map((r) => ({
          nombre: r.nombre.trim(),
          sku: pmmList.find((item) => nameKey(item.nombre) === nameKey(r.nombre))?.sku,
          cantidad: Number(r.cantidad),
          unidad: r.unidad,
          costo: Number(r.costo) || 0,
          tipo: r.tipo,
        })),
      });
      onCreated();
    } catch (e) {
      setError(e.message || "No se pudo guardar la simulación.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Costear receta nueva (simulación)</h2>
        <p>
          Completa los datos y agrega ingredientes. Los que ya existen en PMM traen su costo fijo
          (solo lectura); si un insumo aún no está registrado, agrégalo como <b>nuevo</b> — quedará
          marcado como borrador y no afecta ningún costo oficial.
        </p>

        <div className="form-grid">
          <div className="field">
            <label>Nombre de la receta</label>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Torta Trencito" />
          </div>
          <div className="field">
            <label>Categoría</label>
            <input type="text" list="dataCategorias" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej: Pastelería" />
            <datalist id="dataCategorias">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label>Precio de venta estimado (con IVA)</label>
            <input type="number" min="0" step="1" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej: 5990" />
          </div>
          <div className="field">
            <label>Rendimiento</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" min="0" step="0.01" style={{ width: 70 }} value={rendCant} onChange={(e) => setRendCant(e.target.value)} />
              <select value={rendUnidad} onChange={(e) => setRendUnidad(e.target.value)}>
                <option value="kg">kg</option>
                <option value="unid">unid</option>
              </select>
            </div>
          </div>
        </div>

        <div className="ing-form-head">
          <span>Ingredientes</span>
          <button className="link-btn" type="button" onClick={() => setRows((rs) => [...rs, blankRow()])}>
            + Agregar ingrediente
          </button>
        </div>

        <div>
          {rows.map((row) => (
            <IngredientRow
              key={row.id}
              row={row}
              pmmList={pmmList}
              onChange={(next) => updateRow(row.id, next)}
              onRemove={() => removeRow(row.id)}
            />
          ))}
        </div>

        <div className="nr-summary">
          <span>
            Costo MP: <b>${Math.round(costoMP).toLocaleString("es-CL")}</b>
          </span>
          <span>
            Margen estimado:{" "}
            <b style={{ color: margen < threshold ? "var(--alert)" : "var(--ok)" }}>{margen.toFixed(1)}%</b>
          </span>
          {tieneDraft && <span style={{ color: "var(--draft)" }}>⚠ Contiene insumos sin registrar en PMM</span>}
        </div>

        <div className="info-note warn">
          Borrador temporal: se comparte con los usuarios de esta instancia y puede perderse
          al reiniciar o actualizar el servicio. No modifica los costos oficiales.
        </div>

        <div className="modal-actions">
          <span className="nr-error">{error}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar como borrador"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
