# Recetas.BI API

FastAPI read API for the materialized BigQuery recipe model. Official recipe,
component, alert, ingredient cost, and malification data are read from BigQuery.
No BigQuery credentials belong in the frontend.

## Local setup (PowerShell)

```powershell
cd recetas-app\backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
gcloud auth application-default login
$env:BQ_PROJECT_ID = "tot-corp-planifcomer-cl-sbx"
$env:BQ_LOCATION = "US"
uvicorn app:app --reload --port 8000
```

The authenticated Google identity needs permission to create BigQuery query jobs
and read the `tot_bi_cl_sbxpc_prd` and `tot_bi_cl_sbxpc_vw` datasets. The API uses
Application Default Credentials; do not put service-account keys in this repo.

Check `http://localhost:8000/api/health` and
`http://localhost:8000/api/health/bigquery`. OpenAPI is available at
`http://localhost:8000/docs`.

Run the API contract tests from `recetas-app` with:

```powershell
cd backend
py -3 -m unittest discover -s tests -v
```

## Frontend

In another PowerShell terminal:

```powershell
cd recetas-app\web
npm install
Copy-Item .env.example .env.local
npm run dev
```

Vite proxies `/api` to `http://localhost:8000`. To use another API origin, set
`VITE_API_BASE_URL` in `.env.local`.

## Routes

- `GET /api/recetas?estado=0|1|2|98|ALL&q=...`
- `GET /api/recetas/{id_receta}`
- `GET /api/alertas`
- `GET /api/ingredientes`
- `GET /api/malificacion/resumen`
- `GET /api/health` and `GET /api/health/bigquery`
- `GET /api/simulaciones` and `POST /api/simulaciones`

Only recipe products (`ind_receta = 'R'`) in divisions J06/J07 are returned.
The default recipe status is `cod_estado = 0` (ACT); `ind_activo` is preserved
as a separate PMM signal and does not override the catalog status. The API
groups each recipe's summary, component detail, and alerts in the existing
frontend contract.

Malification upload remains in BigQuery and is intentionally not exposed as an
API write. Simulation drafts are in-memory, are lost when the API restarts, and
never update official cost tables.

This local API has no corporate authentication. Keep it bound to localhost; do
not expose it to a network or deploy it until the approved company auth layer
and deployment controls are added.