import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar.jsx";
import RecetasPage from "./pages/RecetasPage.jsx";
import SimuladorPage from "./pages/SimuladorPage.jsx";
import AlertasPage from "./pages/AlertasPage.jsx";
import CargaMasivaPage from "./pages/CargaMasivaPage.jsx";
import { apiClient } from "./api/index.js";

export default function App() {
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    apiClient.getAlertas().then((a) => setAlertCount(a.length)).catch(() => setAlertCount(0));
  }, []);

  return (
    <div className="app">
      <Sidebar alertCount={alertCount} />
      <main className="main">
        <Routes>
          <Route path="/" element={<RecetasPage />} />
          <Route path="/simulador" element={<SimuladorPage />} />
          <Route path="/alertas" element={<AlertasPage />} />
          <Route path="/carga-masiva" element={<CargaMasivaPage />} />
        </Routes>
      </main>
    </div>
  );
}
