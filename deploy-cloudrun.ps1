[CmdletBinding()]
param(
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string]$ProjectId = "tot-corp-planifcomer-cl-sbx",
    [ValidatePattern('^[a-z]+-[a-z]+[0-9]$')]
    [string]$Region = "southamerica-west1",
    [ValidatePattern('^[a-z][a-z0-9-]{0,39}[a-z0-9]$')]
    [string]$Service = "recetas-bi",
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._@-]+$')]
    [string]$RuntimeServiceAccount = "srv-planifcomer-cl-dev@tot-corp-planifcomer-cl-sbx.iam.gserviceaccount.com",
    [string]$BuildServiceAccount = "",
    [switch]$ProvisionInfrastructure,
    [switch]$ProvisionOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$gcloud = (Get-Command gcloud -ErrorAction Stop).Source
$bq = (Get-Command bq -ErrorAction Stop).Source

function Invoke-Gcloud {
    & $gcloud @args
    if ($LASTEXITCODE -ne 0) {
        throw "gcloud fallo. Revisa el error anterior; el despliegue no esta completo."
    }
}

function Invoke-Bq {
    & $bq @args
    if ($LASTEXITCODE -ne 0) {
        throw "BigQuery IAM fallo. Un administrador debe autorizar la cuenta en los datasets."
    }
}

$sslDisabled = Invoke-Gcloud config get-value auth/disable_ssl_validation
if ($sslDisabled -eq "True" -or $sslDisabled -eq "true") {
    throw "La verificacion TLS de gcloud esta deshabilitada. Habilitala o configura el certificado corporativo antes de desplegar."
}

$projectNumber = Invoke-Gcloud projects describe $ProjectId --format="value(projectNumber)" --project=$ProjectId
if (-not $projectNumber) {
    throw "No se pudo obtener el numero del proyecto."
}

if ($ProvisionOnly -and -not $ProvisionInfrastructure) {
    throw "ProvisionOnly requiere ProvisionInfrastructure."
}

if ($ProvisionInfrastructure) {
    Invoke-Gcloud services enable run.googleapis.com cloudbuild.googleapis.com `
        artifactregistry.googleapis.com bigquery.googleapis.com `
        iam.googleapis.com --project=$ProjectId --quiet
}

$runtimeEmail = Invoke-Gcloud iam service-accounts describe $RuntimeServiceAccount `
    --project=$ProjectId --format="value(email)"
if (-not $runtimeEmail) {
    throw "No existe o no es accesible la cuenta runtime $RuntimeServiceAccount. Solicita al administrador validar la cuenta existente."
}

$buildEmail = $null
if ($BuildServiceAccount) {
    if ($BuildServiceAccount -notmatch '^[A-Za-z0-9][A-Za-z0-9._@-]+$') {
        throw "BuildServiceAccount debe ser el correo de una cuenta existente."
    }
    $buildEmail = Invoke-Gcloud iam service-accounts describe $BuildServiceAccount `
        --project=$ProjectId --format="value(email)"
    if (-not $buildEmail) {
        throw "No existe o no es accesible la cuenta build $BuildServiceAccount. No se crean cuentas automaticamente."
    }
}

if ($ProvisionInfrastructure) {
    Invoke-Gcloud projects add-iam-policy-binding $ProjectId `
        --member="serviceAccount:$runtimeEmail" --role=roles/bigquery.jobUser `
        --condition=None --project=$ProjectId --quiet --format="value(etag)"

    foreach ($dataset in @("tot_bi_cl_sbxpc_prd", "tot_bi_cl_sbxpc_vw")) {
        Invoke-Bq --project_id=$ProjectId --headless=true add-iam-policy-binding `
            --dataset --member="serviceAccount:$runtimeEmail" `
            --role=roles/bigquery.dataViewer "${ProjectId}:$dataset"
    }

    if ($buildEmail) {
        Invoke-Gcloud projects add-iam-policy-binding $ProjectId `
            --member="serviceAccount:$buildEmail" --role=roles/run.builder `
            --condition=None --project=$ProjectId --quiet --format="value(etag)"
    }
}

if ($ProvisionOnly) {
    Write-Host "APIs y permisos BigQuery de la cuenta runtime revisados; no se crearon cuentas y no se desplego Cloud Run."
    Write-Host "El administrador debe autorizar al desplegador para usar la cuenta runtime (iam.serviceAccounts.actAs)."
    if ($buildEmail) {
        Write-Host "Se usara la cuenta build existente: $buildEmail"
        Write-Host "El administrador debe autorizar al desplegador para usarla (iam.serviceAccounts.actAs)."
    } else {
        Write-Host "Cloud Build usara la cuenta de build predeterminada configurada en el proyecto."
    }
    return
}

$deployArgs = @(
    "run", "deploy", $Service,
    "--source=$PSScriptRoot",
    "--project=$ProjectId",
    "--region=$Region",
    "--service-account=$runtimeEmail",
    "--no-allow-unauthenticated",
    "--invoker-iam-check",
    "--ingress=all",
    "--port=8080",
    "--cpu=1",
    "--memory=1Gi",
    "--concurrency=8",
    "--min-instances=0",
    "--max-instances=1",
    "--timeout=300",
    "--set-env-vars=BQ_PROJECT_ID=$ProjectId,BQ_LOCATION=US,CORS_ORIGINS=",
    "--quiet"
)
if ($buildEmail) {
    $deployArgs += "--build-service-account=projects/$ProjectId/serviceAccounts/$buildEmail"
}
Invoke-Gcloud @deployArgs

$url = Invoke-Gcloud run services describe $Service --region=$Region `
    --project=$ProjectId --format="value(status.url)"

Write-Host ""
Write-Host "Servicio creado/actualizado: $url"
Write-Host "Cuenta runtime: $runtimeEmail"
if ($buildEmail) {
    Write-Host "Cuenta build existente: $buildEmail"
} else {
    Write-Host "Cloud Build uso la cuenta predeterminada del proyecto."
}
Write-Host "Sin acceso anonimo. IAP y permisos de usuarios quedan a cargo del cloud engineer."
Write-Host "Prueba local autenticada: gcloud run services proxy $Service --project=$ProjectId --region=$Region --port=8080"
Write-Host "Las simulaciones son temporales; no hay persistencia garantizada."
