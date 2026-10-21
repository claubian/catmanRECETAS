from __future__ import annotations

import logging
import math
import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Protocol

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

PROJECT_ID = os.getenv("BQ_PROJECT_ID", "tot-corp-planifcomer-cl-sbx")
LOCATION = os.getenv("BQ_LOCATION", "US")
DATASET_PRD = "tot_bi_cl_sbxpc_prd"
DATASET_VW = "tot_bi_cl_sbxpc_vw"
logger = logging.getLogger("recetas_api")


class Repository(Protocol):
    def ping(self) -> None: ...

    def list_recetas(
        self, estado: str, busqueda: str, limite: int, id_receta: int | None = None
    ) -> list[dict[str, Any]]: ...

    def list_detalles(self, ids: list[int]) -> list[dict[str, Any]]: ...

    def list_alertas(self, ids: list[int]) -> list[dict[str, Any]]: ...

    def list_ingredientes(self) -> list[dict[str, Any]]: ...

    def malificacion_resumen(self) -> dict[str, Any]: ...


def _json_value(value: Any) -> Any:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


class BigQueryRepository:
    def __init__(self) -> None:
        self.project_id = PROJECT_ID
        self.location = LOCATION
        self._client: Any | None = None
        self._bigquery: Any | None = None

    def _get_client(self) -> Any:
        if self._client is None:
            try:
                from google.cloud import bigquery
            except ImportError as error:
                raise RuntimeError("Falta instalar google-cloud-bigquery.") from error
            self._bigquery = bigquery
            self._client = bigquery.Client(project=self.project_id, location=self.location)
        return self._client

    def _query(
        self,
        sql: str,
        *,
        scalars: dict[str, tuple[str, Any]] | None = None,
        arrays: dict[str, tuple[str, list[Any]]] | None = None,
    ) -> list[dict[str, Any]]:
        client = self._get_client()
        bigquery = self._bigquery
        parameters = [
            bigquery.ScalarQueryParameter(name, kind, value)
            for name, (kind, value) in (scalars or {}).items()
        ]
        parameters.extend(
            bigquery.ArrayQueryParameter(name, kind, values)
            for name, (kind, values) in (arrays or {}).items()
        )
        config = bigquery.QueryJobConfig(query_parameters=parameters)
        max_bytes = os.getenv("BQ_MAX_BYTES_BILLED")
        if max_bytes:
            config.maximum_bytes_billed = int(max_bytes)
        try:
            rows = client.query(sql, job_config=config, location=self.location).result()
            return [
                {key: _json_value(value) for key, value in row.items()}
                for row in rows
            ]
        except Exception as error:
            logger.exception("BigQuery query failed")
            raise RuntimeError("No fue posible consultar BigQuery.") from error

    def ping(self) -> None:
        self._query("SELECT 1 AS ok")

    def list_recetas(
        self, estado: str, busqueda: str, limite: int, id_receta: int | None = None
    ) -> list[dict[str, Any]]:
        sql = f"""
        WITH division_sku AS (
          SELECT ID_SKU, COD_DIVISION, DESC_DIVISION
          FROM `{self.project_id}.{DATASET_PRD}.LK_ATR_PRODUCTO`
          WHERE fecha_proceso = (
            SELECT MAX(fecha_proceso)
            FROM `{self.project_id}.{DATASET_PRD}.LK_ATR_PRODUCTO`
          )
          QUALIFY ROW_NUMBER() OVER (PARTITION BY ID_SKU ORDER BY COD_DIVISION) = 1
        )
                , ultima_malificacion AS (
                    SELECT id_receta, periodo, costo_malificacion_kg
                    FROM `{self.project_id}.{DATASET_PRD}.fact_malificacion`
                    WHERE es_vigente
                        AND periodo <= CURRENT_DATE('America/Santiago')
                    QUALIFY ROW_NUMBER() OVER (
                        PARTITION BY id_receta
                        ORDER BY periodo DESC, version_carga DESC, cargado_en DESC
                    ) = 1
                )
                SELECT
                    r.* REPLACE (
                        m.periodo AS periodo_malificacion,
                        m.costo_malificacion_kg AS costo_malificacion_kg,
                        m.costo_malificacion_kg * r.peso_kg_unidad_venta AS costo_malificacion_unidad
                    ),
          d.COD_DIVISION AS division,
          d.DESC_DIVISION AS desc_division,
                    p.uom_venta AS uom_venta_producto,
                    (
                        STARTS_WITH(UPPER(TRIM(p.desc_sku)), 'BASE ')
                        AND EXISTS (
                            SELECT 1
                            FROM `{self.project_id}.{DATASET_VW}.vw_detalle_receta_vigente` AS uso
                            WHERE uso.id_ingrediente = r.id_receta
                                AND uso.tipo_ingrediente = 'SUBRECETA'
                        )
                    ) AS es_intermedia,
          p.ind_receta
        FROM `{self.project_id}.{DATASET_VW}.vw_costo_receta_vigente` AS r
        LEFT JOIN ultima_malificacion AS m ON m.id_receta = r.id_receta
        JOIN division_sku AS d ON d.ID_SKU = r.id_receta
        JOIN `{self.project_id}.{DATASET_VW}.vw_stg_producto` AS p
          ON p.id_producto = r.id_receta
        WHERE d.COD_DIVISION IN ('J06', 'J07')
          AND p.ind_receta = 'R'
          AND (@estado = 'ALL' OR CAST(r.cod_estado AS STRING) = @estado)
          AND (@id_receta IS NULL OR r.id_receta = @id_receta)
          AND (
            @busqueda = ''
            OR STRPOS(LOWER(COALESCE(r.desc_receta, '')), LOWER(@busqueda)) > 0
            OR STRPOS(LOWER(COALESCE(r.cod_sku_receta, '')), LOWER(@busqueda)) > 0
          )
        ORDER BY r.desc_receta, r.id_receta
        LIMIT @limite
        """
        return self._query(
            sql,
            scalars={
                "estado": ("STRING", estado),
                "id_receta": ("INT64", id_receta),
                "busqueda": ("STRING", busqueda.strip()),
                "limite": ("INT64", limite),
            },
        )

    def list_detalles(self, ids: list[int]) -> list[dict[str, Any]]:
        if not ids:
            return []
        sql = f"""
        SELECT *
        FROM `{self.project_id}.{DATASET_VW}.vw_detalle_receta_vigente`
        WHERE id_receta IN UNNEST(@ids)
        ORDER BY id_receta, costo_componente DESC
        """
        return self._query(sql, arrays={"ids": ("INT64", ids)})

    def list_alertas(self, ids: list[int]) -> list[dict[str, Any]]:
        if not ids:
            return []
        sql = f"""
        SELECT id_receta, tipo_alerta, detalle
        FROM `{self.project_id}.{DATASET_VW}.vw_alertas_recetas`
        WHERE id_receta IN UNNEST(@ids)
        ORDER BY id_receta, tipo_alerta
        """
        return self._query(sql, arrays={"ids": ("INT64", ids)})

    def list_ingredientes(self) -> list[dict[str, Any]]:
        sql = f"""
        SELECT
          id_ingrediente,
          cod_sku AS sku,
          desc_sku AS nombre,
          costo_base,
          uom_base
        FROM `{self.project_id}.{DATASET_PRD}.fact_costo_materia_prima`
        WHERE es_vigente AND tipo_costo = 'RPSC' AND costo_base IS NOT NULL
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY id_ingrediente
          ORDER BY vigente_desde DESC, cargado_en DESC
        ) = 1
        ORDER BY desc_sku
        """
        rows = self._query(sql)
        ingredients = []
        for row in rows:
            base_cost = row.get("costo_base")
            base_unit = (row.get("uom_base") or "").upper()
            costs: dict[str, float] = {}
            if base_cost is not None and base_unit == "G":
                costs = {"g": base_cost, "kg": base_cost * 1000}
            elif base_cost is not None and base_unit == "ML":
                costs = {"ml": base_cost, "l": base_cost * 1000}
            elif base_cost is not None and base_unit == "UN":
                costs = {"unid": base_cost}
            if not costs:
                continue
            default_unit = next(unit for unit in ("kg", "l", "unid") if unit in costs)
            ingredients.append(
                {
                    "id_ingrediente": row.get("id_ingrediente"),
                    "sku": row.get("sku"),
                    "nombre": row.get("nombre"),
                    "uom_base": base_unit,
                    "unidad_default": default_unit,
                    "costo_default": costs[default_unit],
                    "costos_por_uom": costs,
                }
            )
        return ingredients

    def malificacion_resumen(self) -> dict[str, Any]:
        sql = f"""
                WITH ultima AS (
                    SELECT *
                    FROM `{self.project_id}.{DATASET_PRD}.fact_malificacion`
                    WHERE es_vigente
                    QUALIFY ROW_NUMBER() OVER (
                        PARTITION BY id_receta
                        ORDER BY periodo DESC, version_carga DESC
                    ) = 1
                )
        SELECT
                    (SELECT COUNTIF(es_vigente) FROM `{self.project_id}.{DATASET_PRD}.fact_malificacion`) AS filas_vigentes,
                    COUNT(*) AS recetas_vigentes,
                    COUNTIF(costo_malificacion_kg > 0) AS con_costo_positivo,
                    COUNTIF(costo_malificacion_kg = 0) AS con_costo_cero,
                    MAX(periodo) AS ultimo_periodo
                FROM ultima
        """
        rows = self._query(sql)
        return rows[0] if rows else {}


def _apply_malification_basis(summary: dict[str, Any]) -> None:
    unit = str(summary.get("uom_venta_producto") or "").upper()
    amount = summary.get("costo_malificacion_kg")
    summary["costo_malificacion_origen"] = amount
    summary["base_malificacion"] = "KG"
    if summary.get("es_intermedia"):
        portions = summary.get("porciones_cantidad")
        divisor = portions if portions is not None and portions > 0 else None
        summary["base_malificacion"] = "LOTE_POR_PORCIONES"
        summary["unidad_venta"] = "PORCION"
    elif unit in {"UN", "UNID", "UND"}:
        summary["base_malificacion"] = "UNIDAD_VENTA"
        summary["unidad_venta"] = "UNIDAD"
        quantity = summary.get("rendimiento_cantidad")
        yield_unit = str(summary.get("rendimiento_uom") or "").upper()
        divisor = quantity if quantity is not None and quantity > 0 and yield_unit in {"UN", "UNID", "UND"} else None
    else:
        return
    total = summary.get("costo_mp_total")
    summary["costo_mp_unidad_venta"] = total / divisor if total is not None and divisor else None
    summary["costo_malificacion_unidad"] = (
        amount / divisor if amount is not None and divisor else None
    ) if summary.get("es_intermedia") else amount
    net_price = summary.get("precio_venta_neto")
    mp_cost = summary["costo_mp_unidad_venta"]
    summary["margen_mp_pct"] = (
        (net_price - mp_cost) / net_price
        if net_price is not None and net_price > 0 and mp_cost is not None else None
    )


def _assemble_recetas(
    resumenes: list[dict[str, Any]],
    detalles: list[dict[str, Any]],
    alertas: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_id: dict[int, dict[str, Any]] = {}
    for summary in resumenes:
        _apply_malification_basis(summary)
        recipe_id = int(summary["id_receta"])
        quality = summary.get("estado_calidad")
        missing_malification = summary.get("periodo_malificacion") is None
        mp_cost = summary.get("costo_mp_unidad_venta")
        incomplete = (summary.get("componentes_sin_costo") or 0) > 0 or mp_cost is None
        if incomplete:
            quality = "INCOMPLETO"
        elif missing_malification:
            quality = "SIN_MALIFICACION"
            summary["costo_final_unidad"] = mp_cost
        elif summary.get("costo_malificacion_unidad") is None:
            quality = "SIN_PESO_PRODUCTO"
        else:
            summary["costo_final_unidad"] = mp_cost + summary["costo_malificacion_unidad"]
            net_price = summary.get("precio_venta_neto")
            quality = "OK" if net_price is not None and net_price > 0 else "SIN_PRECIO"
            if quality == "OK":
                margin = (net_price - summary["costo_final_unidad"]) / net_price
                summary["margen_final_pct"] = margin
                threshold = summary.get("margen_minimo_oficial")
                summary["bajo_margen_minimo"] = margin < threshold if threshold is not None else None
        summary["estado_calidad"] = quality
        if quality != "OK" or summary.get("es_intermedia"):
            summary["margen_final_pct"] = None
            summary["bajo_margen_minimo"] = None
        if summary.get("es_intermedia"):
            summary["margen_mp_pct"] = None
        if quality == "SIN_MALIFICACION":
            summary["costo_final_unidad"] = summary.get("costo_mp_unidad_venta")
        if quality in {"INCOMPLETO", "SIN_PESO_PRODUCTO"}:
            summary["costo_final_unidad"] = None
        by_id[recipe_id] = {"resumen": summary, "detalle": [], "alertas": []}
    for detail in detalles:
        recipe = by_id.get(int(detail["id_receta"]))
        if recipe:
            recipe["detalle"].append(detail)
    for alert in alertas:
        recipe = by_id.get(int(alert["id_receta"]))
        if recipe:
            if (
                alert.get("tipo_alerta") == "SIN_PESO_PRODUCTO"
                and (
                    recipe["resumen"].get("periodo_malificacion") is None
                    or recipe["resumen"].get("costo_malificacion_unidad") is not None
                )
            ):
                continue
            if alert.get("tipo_alerta") == "MARGEN_BAJO_MINIMO":
                summary = recipe["resumen"]
                if summary.get("bajo_margen_minimo") is not True:
                    continue
                alert = {
                    **alert,
                    "detalle": (
                        f"Margen final {summary['margen_final_pct'] * 100:.1f}% "
                        f"bajo minimo {summary['margen_minimo_oficial'] * 100:.1f}%"
                    ),
                }
            recipe["alertas"].append(
                {
                    **alert,
                    "receta": recipe["resumen"].get("desc_receta"),
                    "sku": recipe["resumen"].get("cod_sku_receta"),
                }
            )
    return list(by_id.values())


def create_app(repository: Repository | None = None) -> FastAPI:
    app = FastAPI(title="Recetas.BI API", version="1.0.0")
    app.state.repository = repository or BigQueryRepository()
    app.state.simulaciones = []
    origins = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in origins.split(",") if origin.strip()],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "recetas-api"}

    @app.get("/api/health/bigquery")
    def bigquery_health() -> dict[str, str]:
        try:
            app.state.repository.ping()
        except Exception as error:
            logger.exception("BigQuery health check failed")
            raise HTTPException(
                status_code=503,
                detail="BigQuery no está disponible; revisa ADC y permisos de lectura.",
            ) from error
        return {"status": "ok", "service": "bigquery"}

    @app.get("/api/recetas")
    def recetas(
        estado: str = Query(default="0", pattern="^(ALL|0|1|2|98)$"),
        q: str = Query(default="", max_length=100),
        limite: int = Query(default=6000, ge=1, le=6000),
    ) -> list[dict[str, Any]]:
        try:
            summaries = app.state.repository.list_recetas(estado, q, limite)
            ids = [int(item["id_receta"]) for item in summaries]
            alerts = app.state.repository.list_alertas(ids)
            return _assemble_recetas(summaries, [], alerts)
        except Exception as error:
            logger.exception("Could not list recipes")
            raise HTTPException(status_code=503, detail="No fue posible consultar las recetas.") from error

    @app.get("/api/recetas/{id_receta}")
    def receta(id_receta: int) -> dict[str, Any]:
        try:
            summaries = app.state.repository.list_recetas("ALL", "", 1, id_receta)
            if not summaries:
                raise HTTPException(status_code=404, detail="Receta no encontrada en J06/J07.")
            details = app.state.repository.list_detalles([id_receta])
            alerts = app.state.repository.list_alertas([id_receta])
            return _assemble_recetas(summaries, details, alerts)[0]
        except HTTPException:
            raise
        except Exception as error:
            logger.exception("Could not get recipe")
            raise HTTPException(status_code=503, detail="No fue posible consultar la receta.") from error

    @app.get("/api/ingredientes")
    def ingredientes() -> list[dict[str, Any]]:
        try:
            return app.state.repository.list_ingredientes()
        except Exception as error:
            logger.exception("Could not list ingredients")
            raise HTTPException(status_code=503, detail="No fue posible consultar ingredientes.") from error

    @app.get("/api/alertas")
    def alertas() -> list[dict[str, Any]]:
        try:
            summaries = app.state.repository.list_recetas("0", "", 6000)
            ids = [int(item["id_receta"]) for item in summaries]
            recipes = _assemble_recetas(summaries, [], app.state.repository.list_alertas(ids))
            return [alert for recipe in recipes for alert in recipe["alertas"]]
        except Exception as error:
            logger.exception("Could not list alerts")
            raise HTTPException(status_code=503, detail="No fue posible consultar las alertas.") from error

    @app.get("/api/malificacion/resumen")
    def malificacion_resumen() -> dict[str, Any]:
        try:
            return app.state.repository.malificacion_resumen()
        except Exception as error:
            logger.exception("Could not summarize malification")
            raise HTTPException(status_code=503, detail="No fue posible consultar malificación.") from error

    @app.get("/api/simulaciones")
    def simulaciones() -> list[dict[str, Any]]:
        return list(app.state.simulaciones)

    @app.post("/api/simulaciones")
    def crear_simulacion(payload: dict[str, Any]) -> dict[str, Any]:
        name = str(payload.get("nombre", "")).strip()
        category = str(payload.get("categoria", "")).strip()
        submitted_ingredients = payload.get("ingredientes") or []
        if not name or not category or not submitted_ingredients:
            raise HTTPException(
                status_code=422,
                detail="Nombre, categoría e ingredientes son obligatorios.",
            )
        try:
            price = float(payload.get("precio") or 0)
            yield_quantity = float(payload.get("rendimientoCantidad") or 1)
        except (KeyError, TypeError, ValueError) as error:
            raise HTTPException(status_code=422, detail="Los datos de la simulación no son válidos.") from error
        if not math.isfinite(price) or not math.isfinite(yield_quantity) or price < 0 or yield_quantity <= 0:
            raise HTTPException(status_code=422, detail="Costo, precio y rendimiento deben ser válidos.")

        try:
            pmm_costs = {
                str(item.get("sku")): item
                for item in app.state.repository.list_ingredientes()
                if item.get("sku") is not None
            }
        except Exception as error:
            logger.exception("Could not verify PMM simulation ingredients")
            raise HTTPException(status_code=503, detail="No fue posible verificar costos PMM.") from error

        ingredients = []
        for item in submitted_ingredients:
            if not isinstance(item, dict):
                raise HTTPException(status_code=422, detail="Ingrediente inválido.")
            try:
                quantity = float(item["cantidad"])
                unit = str(item.get("unidad", "unid")).lower()
                kind = item.get("tipo", "pmm")
                if kind == "pmm":
                    sku = str(item.get("sku", "")).strip()
                    source = pmm_costs.get(sku)
                    if not source:
                        raise HTTPException(status_code=422, detail="Ingrediente PMM no encontrado o sin costo vigente.")
                    cost = float(source.get("costos_por_uom", {}).get(unit))
                    name_for_detail = source.get("nombre") or str(item.get("nombre", "")).strip()
                    sku_for_detail = source.get("sku")
                elif kind == "nuevo":
                    cost = float(item["costo"])
                    name_for_detail = str(item.get("nombre", "")).strip()
                    sku_for_detail = None
                else:
                    raise HTTPException(status_code=422, detail="Tipo de ingrediente no válido.")
            except (KeyError, TypeError, ValueError) as error:
                raise HTTPException(status_code=422, detail="Cantidad, unidad o costo de ingrediente inválido.") from error
            if not math.isfinite(quantity) or not math.isfinite(cost) or quantity <= 0 or cost < 0 or not name_for_detail:
                raise HTTPException(status_code=422, detail="Cantidad, nombre o costo de ingrediente inválido.")
            ingredients.append(
                {
                    "sku": sku_for_detail,
                    "nombre": name_for_detail,
                    "cantidad": quantity,
                    "unidad": unit,
                    "costo": cost,
                    "tipo": kind,
                }
            )

        cost = sum(item["cantidad"] * item["costo"] for item in ingredients)
        recipe_id = 900000 + len(app.state.simulaciones) + 1
        net_price = price / 1.19 if price else None
        margin = (net_price - cost) / net_price if net_price else None
        simulation = {
            "resumen": {
                "id_receta": recipe_id,
                "cod_sku_receta": f"SIM-{recipe_id}",
                "desc_receta": name.upper(),
                "ind_activo": "T",
                "cod_estado": 0,
                "division": "J06",
                "desc_division": "Simulación",
                "cod_tema": category,
                "desc_tema": category,
                "costo_mp_total": cost,
                "rendimiento_cantidad": yield_quantity,
                "rendimiento_uom": str(payload.get("rendimientoUnidad") or "UN").upper(),
                "unidad_venta": str(payload.get("rendimientoUnidad") or "UN").upper(),
                "costo_mp_unidad_venta": cost,
                "costo_malificacion_kg": None,
                "costo_malificacion_unidad": None,
                "costo_final_unidad": None,
                "precio_venta_bruto": price or None,
                "precio_venta_neto": net_price,
                "margen_mp_pct": margin,
                "margen_final_pct": None,
                "estado_calidad": "SIMULACION",
                "componentes_total": len(ingredients),
                "componentes_sin_costo": 0,
                "margen_minimo_oficial": 0.30,
                "bajo_margen_minimo": margin < 0.30 if margin is not None else None,
            },
            "detalle": [
                {
                    "cod_sku_ingrediente": item.get("sku") or "BORRADOR",
                    "desc_ingrediente": item.get("nombre", ""),
                    "cantidad": float(item["cantidad"]),
                    "uom_receta": str(item.get("unidad", "UN")).upper(),
                    "costo_componente": float(item["cantidad"]) * float(item["costo"]),
                    "origen": "DRAFT" if item.get("tipo") == "nuevo" else "PMM",
                }
                for item in ingredients
            ],
            "alertas": [],
        }
        app.state.simulaciones.append(simulation)
        return simulation

    return app


app = create_app()