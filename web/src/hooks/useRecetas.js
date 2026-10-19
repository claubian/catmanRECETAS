import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/index.js";

// Hook central de datos. Encapsula el estado de carga/error para que las
// páginas no repitan lógica de fetch. Cuando se conecte el backend real,
// este hook no cambia — solo cambia qué implementación resuelve apiClient.
export function useRecetas() {
  const [recetas, setRecetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async (options = { estado: "0" }) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getRecetas(options);
      setRecetas(data);
    } catch (e) {
      setError(e.message || "Error desconocido al cargar recetas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload({ estado: "0" });
  }, [reload]);

  return { recetas, loading, error, reload };
}

export function useSimulaciones() {
  const [simulaciones, setSimulaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getSimulaciones();
      setSimulaciones(data);
    } catch (e) {
      setError(e.message || "No fue posible cargar las simulaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { simulaciones, loading, error, reload };
}
