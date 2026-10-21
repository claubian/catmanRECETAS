import unittest

from fastapi.testclient import TestClient

from app import _assemble_recetas, create_app


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
                "costo_mp_unidad_venta": 522.71,
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
    def test_malification_basis_distinguishes_base_pack_and_kg(self):
        for intermediate, sale_unit, portions, yield_quantity, weight, expected_mp, expected_mal in [
            (True, "UN", 10, 1, None, 100, 189.531),
            (False, "UN", 5, 1, None, 1000, 1895.31),
            (False, "UN", 5, 2, 0.2, 500, 1895.31),
            (False, "KG", None, 1, 0.5, 1000, 947.655),
            (True, "UN", None, 1, None, None, None),
        ]:
            with self.subTest(intermediate=intermediate, unit=sale_unit, portions=portions, yield_quantity=yield_quantity):
                summary = {
                    "id_receta": 1, "es_intermedia": intermediate,
                    "uom_venta_producto": sale_unit, "porciones_cantidad": portions,
                    "rendimiento_cantidad": yield_quantity, "rendimiento_uom": "UN",
                    "costo_mp_total": 1000, "costo_mp_unidad_venta": 1000,
                    "componentes_sin_costo": 0, "periodo_malificacion": "2026-08-01",
                    "costo_malificacion_kg": 1895.31,
                    "costo_malificacion_unidad": 1895.31 * weight if weight else None,
                    "precio_venta_neto": 5000,
                }
                result = _assemble_recetas([summary], [], [])[0]["resumen"]
                self.assertEqual(result["costo_mp_unidad_venta"], expected_mp)
                if expected_mal is None:
                    self.assertIsNone(result["costo_malificacion_unidad"])
                    self.assertIsNone(result["costo_final_unidad"])
                else:
                    self.assertAlmostEqual(result["costo_malificacion_unidad"], expected_mal)
                    self.assertAlmostEqual(result["costo_final_unidad"], expected_mp + expected_mal)
                if intermediate:
                    self.assertIsNone(result["margen_final_pct"])
                    self.assertIsNone(result["bajo_margen_minimo"])

    def test_final_cost_without_malification_does_not_require_weight(self):
        summary = {
            "id_receta": 1, "estado_calidad": "SIN_PESO_PRODUCTO",
            "costo_mp_unidad_venta": 120, "componentes_sin_costo": 0,
        }
        result = _assemble_recetas([summary], [], [
            {"id_receta": 1, "tipo_alerta": "SIN_PESO_PRODUCTO"}
        ])[0]
        self.assertEqual(result["resumen"]["costo_final_unidad"], 120)
        self.assertEqual(result["resumen"]["estado_calidad"], "SIN_MALIFICACION")
        self.assertEqual(result["alertas"], [])

    def test_margin_alert_uses_recalculated_cost(self):
        summary = {
            "id_receta": 1, "es_intermedia": False,
            "uom_venta_producto": "UN", "rendimiento_cantidad": 1,
            "rendimiento_uom": "UN", "costo_mp_total": 100,
            "periodo_malificacion": "2026-08-01", "costo_malificacion_kg": 60,
            "precio_venta_neto": 200, "margen_minimo_oficial": 0.3,
        }
        result = _assemble_recetas([summary], [], [{
            "id_receta": 1, "tipo_alerta": "MARGEN_BAJO_MINIMO", "detalle": "Valor anterior",
        }])[0]
        self.assertEqual(result["alertas"][0]["detalle"], "Margen final 20.0% bajo minimo 30.0%")

    def test_final_cost_requires_complete_mp_and_convertible_malification(self):
        for missing_components, period, malification, expected in [
            (1, None, None, None),
            (0, "2026-08-01", None, None),
            (0, "2026-08-01", 0, 120),
            (0, "2026-08-01", 30, 150),
        ]:
            with self.subTest(missing_components=missing_components, period=period, malification=malification):
                summary = {
                    "id_receta": 1, "estado_calidad": "OK",
                    "componentes_sin_costo": missing_components,
                    "costo_mp_unidad_venta": 120, "periodo_malificacion": period,
                    "costo_malificacion_unidad": malification,
                    "precio_venta_neto": 200, "margen_minimo_oficial": 0.3,
                }
                result = _assemble_recetas([summary], [], [])[0]["resumen"]
                self.assertEqual(result["costo_final_unidad"], expected)

    def setUp(self):
        self.repository = FakeRepository()
        self.client = TestClient(create_app(self.repository))

    def test_recipe_response_joins_summary_detail_and_alerts(self):
        response = self.client.get("/api/recetas")
        self.assertEqual(response.status_code, 200)
        recipe = response.json()[0]
        self.assertEqual(recipe["resumen"]["id_receta"], 40710)
        self.assertEqual(recipe["resumen"]["costo_final_unidad"], 522.71)
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