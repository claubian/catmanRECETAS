# Recetas.BI

Frontend React/Vite y API FastAPI para consultar el modelo de recetas de BigQuery.
En Cloud Run se publican juntos: el mismo enlace sirve las pantallas y las rutas
`/api`. Las credenciales de BigQuery nunca llegan al navegador.

## Desplegar en Cloud Run desde Windows

La [guía detallada de Cloud Run, BigQuery e IAP](GUIA_CLOUD_RUN_IAP_BIGQUERY.md)
documenta el flujo completo y los permisos por identidad.

Configuracion inicial:

- Proyecto: `tot-corp-planifcomer-cl-sbx`.
- Region Cloud Run: `southamerica-west1` (Santiago).
- Ubicacion BigQuery: `US`, independiente de la region del servicio.
- Servicio: `recetas-bi`.
- Primera etapa: servicio privado por IAM, sin configurar IAP ni correos.
- Segunda etapa: el cloud engineer habilita IAP y los usuarios autorizados.
- Sin acceso anonimo. Compartir la URL no concede permisos automaticamente.

### Requisitos

1. Google Cloud CLI actualizado, incluidos `gcloud` y `bq`, y facturacion habilitada.
   No se necesita Docker ni Node instalados localmente: Cloud Build construye
   el [Dockerfile](Dockerfile).
2. Una identidad con permisos para desplegar Cloud Run y ejecutar Cloud Build.
   La cuenta runtime existente es
   `srv-planifcomer-cl-dev@tot-corp-planifcomer-cl-sbx.iam.gserviceaccount.com`;
   no se requiere crear cuentas nuevas para este contexto. Cloud Build usa la
   identidad predeterminada del proyecto salvo que Cloud Engineering indique
   una cuenta build existente concreta. No hace falta conceder Owner al runtime.
3. Permiso `iam.serviceAccounts.actAs` para el desplegador sobre la cuenta
   runtime reutilizada y, solo si se selecciona explícitamente, sobre la cuenta
   build existente. Si falta, un administrador debe otorgar
   `roles/iam.serviceAccountUser` sobre la cuenta correspondiente.
4. Para la segunda etapa, cuenta corporativa en la misma organizacion de Google Cloud para usar el
   cliente OAuth administrado de IAP. Usuarios externos u organizaciones con
   restricciones pueden requerir configuracion adicional por el administrador.
5. TLS de gcloud habilitado. Si un proxy corporativo necesita certificados,
   configura `core/custom_ca_certs_file` con el certificado aprobado; no
   desactives la verificacion SSL. El script se detiene si detecta TLS
   deshabilitado. Para habilitarlo solo durante esta terminal:

   ```powershell
   $env:CLOUDSDK_AUTH_DISABLE_SSL_VALIDATION = "false"
   ```

Desde esta carpeta en PowerShell:

```powershell
gcloud auth login
.\deploy-cloudrun.ps1
```

El [script de despliegue](deploy-cloudrun.ps1) se detiene ante errores y
reutiliza la cuenta runtime existente; no crea service accounts. La preparación
inicial de APIs y permisos BigQuery debe ejecutarla el Cloud Engineer:

```powershell
.\deploy-cloudrun.ps1 -ProvisionInfrastructure -ProvisionOnly
```

Ese modo no despliega Cloud Run ni crea cuentas. Habilita las APIs necesarias
y añade permisos BigQuery a la cuenta runtime existente:

| Identidad | Permisos |
| --- | --- |
| `srv-planifcomer-cl-dev@tot-corp-planifcomer-cl-sbx.iam.gserviceaccount.com` | `roles/bigquery.jobUser` en el proyecto y `roles/bigquery.dataViewer` solo en los datasets `tot_bi_cl_sbxpc_prd` y `tot_bi_cl_sbxpc_vw` |
| Identidad Cloud Build predeterminada del proyecto | Debe tener permisos de build/Artifact Registry/Cloud Run ya aprobados; el script no la reemplaza |

Para consultar cuál identidad Cloud Build tiene configurada el proyecto:

```powershell
gcloud builds get-default-service-account --project=tot-corp-planifcomer-cl-sbx
```

Además, el Cloud Engineer debe autorizar al desplegador con
`roles/iam.serviceAccountUser` sobre la cuenta runtime y los permisos de
despliegue Cloud Run/Cloud Build/Artifact Registry correspondientes. Para
usar una cuenta build explícita, debe ser una cuenta existente y el desplegador
debe tener `actAs` sobre ella. Para la prueba por proxy, necesita también
permiso de invocación sobre `recetas-bi`. El script no concede `actAs` al
desplegador.

El script no configura IAP ni concede acceso a usuarios finales.
Agrega permisos, no reemplaza las politicas IAM completas. Revisa
tambien permisos heredados de proyecto/organizacion. Si las vistas no son vistas autorizadas y
consultan otros datasets, el administrador debe habilitar tambien la lectura
de sus dependencias; no otorgar Data Viewer a todo el proyecto como atajo.

Cloud Run ejecuta el contenedor con la identidad runtime y obtiene credenciales
automaticamente. No subir archivos JSON de cuentas de servicio, credenciales
ADC ni archivos `.env`. Los archivos de ignore excluyen estos del build.

### Verificar el resultado

1. El script imprime la URL `https://...run.app`. Antes de IAP, una solicitud
   anonima debe recibir 401/403, no una pantalla de login. Nunca mostrar datos
   sin autenticacion. Para probar el frontend desde un navegador, ejecutar:

   ```powershell
   gcloud run services proxy recetas-bi --project=tot-corp-planifcomer-cl-sbx `
     --region=southamerica-west1 --port=8080
   ```

   Abrir `http://127.0.0.1:8080`. El proxy agrega la identidad de gcloud;
   el usuario necesita `run.routes.invoke` (por ejemplo `roles/run.invoker`)
   en el servicio. El puerto local no debe compartirse ni exponerse a la red.
2. Mediante el proxy, verificar `/api/health` y
   `/api/health/bigquery`. Ambos deben devolver `"status": "ok"`.
   El health de BigQuery ejecuta `SELECT 1`: **no prueba** acceso a las tablas.
3. Abrir Recetas, desplegar los ingredientes de una receta, revisar Alertas y
   Malificacion. Esto comprueba permisos y compatibilidad del modelo real.
4. Abrir directamente `/simulador`, `/alertas` y `/carga-masiva` y refrescar:
   las pantallas deben cargar sin errores 404.
5. Crear una simulacion, comprobarla en el listado y confirmar que no modifica
   tablas oficiales.
6. En Cloud Run > Seguridad, comprobar ausencia de acceso anonimo. Revisar
   logs si la API devuelve 503. Despues de habilitar IAP, repetir las pruebas
   usando directamente la URL del servicio, comprobar el inicio de sesion
   y que una cuenta no autorizada reciba acceso denegado.

Hasta completar estas comprobaciones, el despliegue no esta validado de punta
a punta.

### Habilitar IAP y agregar usuarios despues (cloud engineer)

El cloud engineer debe habilitar IAP directo en Cloud Run, otorgar
`roles/run.invoker` al agente de IAP del proyecto y luego autorizar usuarios
con `roles/iap.httpsResourceAccessor` sobre el servicio. Revisar el procedimiento
oficial enlazado al final. El script de despliegue no modifica la configuracion
de IAP, por lo que tampoco la deshabilita en futuros despliegues.

Preferir un grupo corporativo administrado por TI para los usuarios:

```powershell
gcloud iap web add-iam-policy-binding --project=tot-corp-planifcomer-cl-sbx `
  --region=southamerica-west1 --resource-type=cloud-run --service=recetas-bi `
  --member="group:GRUPO_CORPORATIVO" --role=roles/iap.httpsResourceAccessor
```

No usar `allUsers`, `allAuthenticatedUsers` ni desactivar IAP para compartir
el enlace.

## Limitaciones de esta primera version

- Las simulaciones son compartidas por instancia y **solo viven en memoria**.
  Se pueden perder en reinicios, escalado a cero, fallos o nuevos despliegues.
  Un worker y un maximo de una instancia por revision reducen inconsistencias,
  pero no garantizan persistencia ni exclusividad durante reemplazos de revision.
  No usarlas como registro permanente. Para eso se requiere una base de datos.
- Las consultas generan costos de BigQuery. No se ha fijado un tope arbitrario
  que pueda bloquear consultas validas. `BQ_MAX_BYTES_BILLED` permite establecer
  un limite por consulta cuando se conozca su consumo; no es un presupuesto total.
- El build usa Cloud Build y Artifact Registry, que tambien pueden generar costos.
- No se incluye creacion/migracion de vistas ni tablas de BigQuery.
- En el contenedor se fuerza el cliente real. `.env.local` no participa del build.

## Desarrollo local y pruebas

Ver la [guía detallada de Cloud Run, BigQuery e IAP](GUIA_CLOUD_RUN_IAP_BIGQUERY.md)
para el flujo de despliegue y autorización de usuarios.

Ver [backend](backend/README.md) y [frontend](web/README.md). La opcion
`WEB_DIST_DIR` activa el frontend compilado en FastAPI y falla al arrancar si
no contiene `index.html` y `assets`. Sin ella se mantiene el flujo local con
Vite y su proxy a la API.

```powershell
cd backend
py -3 -m unittest discover -s tests -v
```

## Referencias oficiales

- [IAP directo en Cloud Run](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run)
- [Despliegue desde codigo fuente](https://docs.cloud.google.com/run/docs/deploying-source-code)
