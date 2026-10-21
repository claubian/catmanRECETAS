import { useEffect, useState } from "react";
import { apiClient } from "../api/index.js";
import { useSimulaciones } from "../hooks/useRecetas.js";
import RecipeCard from "../components/RecipeCard.jsx";
import SimuladorModal from "../components/SimuladorModal.jsx";

export default function SimuladorPage() {
  const { simulaciones, loading, error, reload } = useSimulaciones();
  const [showModal, setShowModal] = useState(false);
  const [pmmList, setPmmList] = useState([]);
  const [ingredientsError, setIngredientsError] = useState("");

  useEffect(() => {
    apiClient.getIngredientesPMM()
      .then(setPmmList)
      .catch((e) => setIngredientsError(e.message || "No fue posible cargar ingredientes."));
  }, []);

  const categorias = [...new Set(simulaciones.map((r) => r.resumen.desc_division || r.resumen.desc_tema).filter(Boolean))];

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Simulador de recetas nuevas</h1>
          <p>
            Costea un producto en desarrollo antes de crearlo en PMM. Puedes usar ingredientes ya
            sincronizados (costo fijo, solo lectura) o agregar insumos nuevos que aún no existen —
            quedan marcados como borrador hasta que Abastecimiento los registre oficialmente.
          </p>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + Nueva simulación
          </button>
        </div>
      </div>

      <div className="info-note warn">
        Las simulaciones son temporales y compartidas entre los usuarios de esta instancia.
        Pueden perderse cuando el servicio se reinicia o se actualiza. No modifican los costos oficiales.
      </div>

      {loading ? (
        <div className="center-loading">Cargando…</div>
      ) : error ? (
        <div className="center-loading">{error}</div>
      ) : (
        <div className="grid">
          {simulaciones.length ? (
            simulaciones.map((r) => <RecipeCard key={r.resumen.id_receta} receta={r} dupCount={1} isSimulation />)
          ) : (
            <div className="empty">
              Aún no has creado simulaciones. Usa el botón "Nueva simulación" para costear un
              producto en desarrollo.
            </div>
          )}
        </div>
      )}

      {ingredientsError && <div className="panel"><div className="alert-box danger">{ingredientsError}</div></div>}

      {showModal && (
        <SimuladorModal
          pmmList={pmmList}
          categorias={categorias}
          threshold={30}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            reload();
          }}
        />
      )}
    </>
  );
}
