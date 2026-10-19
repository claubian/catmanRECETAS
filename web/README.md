# Recetas.BI — Frontend

React + Vite, mismo patrón que `catman-app`. Consume datos de prueba
(`mockClient.js`) por defecto — no necesita backend ni BigQuery para
# Recetas.BI

Frontend React/Vite conectado a la API FastAPI en `../backend`. La API lee las
vistas y tablas materializadas del modelo BigQuery; React no recibe credenciales.

## Arranque local en Windows

Terminal 1, API (desde `recetas-app`):

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
gcloud auth application-default login
$env:BQ_PROJECT_ID = "tot-corp-planifcomer-cl-sbx"
$env:BQ_LOCATION = "US"
uvicorn app:app --reload --port 8000
```

Terminal 2, frontend (desde `recetas-app`):

```powershell
cd web
npm install
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Abre `http://localhost:5173`. La identidad de Google debe tener permiso para
crear jobs de BigQuery y leer los datasets `tot_bi_cl_sbxpc_prd` y
`tot_bi_cl_sbxpc_vw`. Las credenciales se gestionan con ADC y no se guardan en
el repo. Comprueba `/api/health/bigquery` o el indicador de conexión al pie de la barra lateral.

## Contrato y reglas visibles

- API: `GET /api/recetas`, `GET /api/recetas/{id}`, `GET /api/alertas`,
  `GET /api/ingredientes`, `GET /api/malificacion/resumen`.
- Listado limitado a recetas (`ind_receta = 'R'`) de J06/J07; el estado inicial
  es `cod_estado = 0` (ACT). `ind_activo` se conserva como señal PMM separada.
- El detalle de componentes se consulta al expandir cada receta.
- La malificación se carga en BigQuery. La app distingue una fila cargada con
  costo cero de una receta sin fila aplicable; no ofrece carga CSV.
- Cuando falta malificación o peso, no se presenta el margen de MP como margen
  final; el margen MP se etiqueta como referencial.
- Las simulaciones son borradores en memoria y no escriben en las tablas
  oficiales.

## Modo de demostración

Para activar fixtures explícitamente, establece `VITE_USE_MOCK=true` en
`.env.local`. El modo real es el predeterminado. Las fixtures históricas son
datos de demostración y no representan los resultados actuales de BigQuery.
- Definir autenticación (login corporativo) antes de exponerlo fuera de
