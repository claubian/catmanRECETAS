import unittest

from fastapi.testclient import TestClient

from app import create_app


class FakeRepository:
    def __init__(self):
        self.requested_status = None
        self.requested_recipe_id = None
        self.detail_requests = []

    def ping(self):
        return None

    def list_recetas(self, estado, busqueda, limite, id_receta=None):
        self.requested_status = estado
        self.requested_recipe_id = id_receta
        if id_receta not in (None, 40710):
            return []
        return [
            {
                "id_receta": 40710,
                "cod_sku_receta": "06600035",
                "desc_receta": "HALLULLA",
                "cod_estado": 0,
                "estado_calidad": "SIN_MALIFICACION",
                "costo_final_unidad": 522.71,
                "margen_final_pct": 0.6874,
                "bajo_margen_minimo": False,
            }
        ]

    def list_detalles(self, ids):
        self.detail_requests.append(ids)
        return [{"id_receta": 40710, "desc_ingrediente": "Harina"}]

    def list_alertas(self, ids):
        return [
            {"id_receta": 40710, "tipo_alerta": "SIN_MALIFICACION", "detalle": "Sin carga"},
            {"id_receta": 40710, "tipo_alerta": "MARGEN_BAJO_MINIMO", "detalle": "Margen bajo"},
        ]

    def list_ingredientes(self):
        return [{
            "sku": "1",
            "nombre": "Harina",
            "costos_por_uom": {"kg": 100.0, "g": 0.1},
        }]

    def malificacion_resumen(self):
        return {"recetas_vigentes": 246}


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.repository = FakeRepository()
        self.client = TestClient(create_app(self.repository))

    def test_recipe_response_joins_summary_detail_and_alerts(self):
        response = self.client.get("/api/recetas")
        self.assertEqual(response.status_code, 200)
        recipe = response.json()[0]
        self.assertEqual(recipe["resumen"]["id_receta"], 40710)
        self.assertIsNone(recipe["resumen"]["costo_final_unidad"])
        self.assertIsNone(recipe["resumen"]["margen_final_pct"])
        self.assertIsNone(recipe["resumen"]["bajo_margen_minimo"])
        self.assertEqual(recipe["detalle"], [])
        self.assertEqual(recipe["alertas"][0]["sku"], "06600035")
        self.assertEqual([a["tipo_alerta"] for a in recipe["alertas"]], ["SIN_MALIFICACION"])
        self.assertEqual(self.repository.requested_status, "0")
        self.assertEqual(self.repository.detail_requests, [])

    def test_all_statuses_can_be_requested(self):
        response = self.client.get("/api/recetas?estado=ALL")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.repository.requested_status, "ALL")

    def test_recipe_detail_uses_id_filter_and_returns_404_when_absent(self):
        found = self.client.get("/api/recetas/40710")
        self.assertEqual(found.status_code, 200)
        self.assertEqual(found.json()["detalle"][0]["desc_ingrediente"], "Harina")
        self.assertEqual(self.repository.detail_requests, [[40710]])
        missing = self.client.get("/api/recetas/1")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(self.repository.requested_recipe_id, 1)

    def test_health_and_malification_summary(self):
        self.assertEqual(self.client.get("/api/health").json()["status"], "ok")
        self.assertEqual(
            self.client.get("/api/malificacion/resumen").json()["recetas_vigentes"],
            246,
        )

    def test_simulation_uses_server_pmm_cost_not_client_cost(self):
        response = self.client.post(
            "/api/simulaciones",
            json={
                "nombre": "Pan de prueba",
                "categoria": "J06",
                "precio": 1190,
                "rendimientoCantidad": 1,
                "rendimientoUnidad": "kg",
                "ingredientes": [
                    {"sku": "1", "nombre": "Harina", "cantidad": 2, "unidad": "kg", "costo": 999999, "tipo": "pmm"}
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["resumen"]["costo_mp_total"], 200)

    def test_simulation_rejects_unknown_pmm_sku(self):
        response = self.client.post(
            "/api/simulaciones",
            json={
                "nombre": "Pan de prueba",
                "categoria": "J06",
                "precio": 1190,
                "rendimientoCantidad": 1,
                "rendimientoUnidad": "kg",
                "ingredientes": [
                    {"sku": "missing", "nombre": "No PMM", "cantidad": 1, "unidad": "kg", "costo": 1, "tipo": "pmm"}
                ],
            },
        )
        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()