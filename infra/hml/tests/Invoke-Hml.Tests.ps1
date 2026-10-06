#Requires -Version 5.1
# Testes locais: nao executam gcloud, Terraform, Docker ou chamadas GCP.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$scriptPath = Join-Path $PSScriptRoot '../Invoke-Hml.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    [IO.Path]::GetFullPath($scriptPath), [ref]$tokens, [ref]$parseErrors
)
if ($parseErrors.Count) { throw ($parseErrors | ForEach-Object { $_.Message } | Out-String) }
# Carregar somente funcoes evita executar o ponto de entrada operacional.
$functions = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)
. ([scriptblock]::Create(($functions | ForEach-Object { $_.Extent.Text }) -join "`n"))

$script:Checks = 0
function Assert-Check {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
    $script:Checks++
}
function Assert-Throws {
    param([scriptblock]$Operation, [string]$Expected)
    $caught = $null
    try { & $Operation } catch { $caught = $_.Exception.Message }
    Assert-Check -Condition ($caught -like "*$Expected*") -Message "Esperava rejeicao contendo '$Expected'; recebido '$caught'."
}
function New-TestPlan {
    param([object[]]$Changes = @())
    return [pscustomobject]@{
        variables = [pscustomobject]@{
            project_id = [pscustomobject]@{ value = 'site-institucional-510319' }
            name_prefix = [pscustomobject]@{ value = 'spm-hml' }
            region = [pscustomobject]@{ value = 'southamerica-east1' }
            zone = [pscustomobject]@{ value = 'southamerica-east1-a' }
        }
        resource_changes = $Changes
    }
}
function New-TestChange {
    param([string]$Address, $After, [string[]]$Actions = @('create'), [string]$Mode = 'managed')
    return [pscustomobject]@{
        address = $Address; mode = $Mode
        change = [pscustomobject]@{ after = $After; actions = $Actions }
    }
}
function Test-Plan {
    param($Plan)
    Assert-HmlPlan -Plan $Plan -ExpectedProject 'site-institucional-510319' -ExpectedPrefix 'spm-hml' -ExpectedRegion 'southamerica-east1' -ExpectedZone 'southamerica-east1-a' -ExpectedProjectNumber '123456'
}

$validChanges = @(
    (New-TestChange 'google_compute_instance.hml' ([pscustomobject]@{ name = 'spm-hml-vm'; project = 'site-institucional-510319'; zone = 'southamerica-east1-a' })),
    (New-TestChange 'google_storage_bucket.uploads' ([pscustomobject]@{ name = 'site-institucional-510319-spm-hml-uploads'; location = 'southamerica-east1' })),
    (New-TestChange 'google_secret_manager_secret.app["AUTH_SECRET"]' ([pscustomobject]@{ secret_id = 'spm-hml-auth-secret' })),
    (New-TestChange 'google_project_service.apis["compute.googleapis.com"]' ([pscustomobject]@{ project = 'site-institucional-510319'; service = 'compute.googleapis.com' })),
    (New-TestChange 'google_project_iam_custom_role.schedule' ([pscustomobject]@{ role_id = 'spm_hml_schedule' }))
)
Test-Plan (New-TestPlan $validChanges)
Assert-Check $true 'Plano HML valido deveria passar.'
foreach ($actions in @(@('delete'), @('delete', 'create'), @('create', 'delete'))) {
    $change = New-TestChange 'google_compute_instance.hml' ([pscustomobject]@{ name = 'spm-hml-vm' }) -Actions $actions
    Assert-Throws { Test-Plan (New-TestPlan @($change)) } 'exclusao/substituicao'
}
foreach ($field in @('project_id', 'name_prefix', 'region', 'zone')) {
    $plan = New-TestPlan
    $plan.variables.$field.value = 'outro-destino'
    Assert-Throws { Test-Plan $plan } 'diverge'
}
foreach ($change in @(
    (New-TestChange 'google_compute_instance.hml' ([pscustomobject]@{ name = 'production-vm' })),
    (New-TestChange 'google_compute_instance.hml' ([pscustomobject]@{ name = 'spm-hml-vm'; project = 'outro-projeto' })),
    (New-TestChange 'google_compute_instance.hml' ([pscustomobject]@{ name = 'spm-hml-vm'; zone = 'us-central1-a' })),
    (New-TestChange 'google_secret_manager_secret.app["OTHER"]' ([pscustomobject]@{ secret_id = 'production-password' })),
    (New-TestChange 'google_project_service.apis["OTHER"]' ([pscustomobject]@{ service = 'sqladmin.googleapis.com' })),
    (New-TestChange 'google_storage_bucket_iam_member.vm_uploads' ([pscustomobject]@{ member = 'user:outsider@example.org'; role = 'roles/storage.objectUser'; bucket = 'site-institucional-510319-spm-hml-uploads' })),
    (New-TestChange 'google_storage_bucket_iam_member.vm_uploads' ([pscustomobject]@{ member = 'serviceAccount:spm-hml-vm@site-institucional-510319.iam.gserviceaccount.com'; role = 'roles/storage.admin'; bucket = 'site-institucional-510319-spm-hml-uploads' })),
    (New-TestChange 'google_secret_manager_secret_version.app' ([pscustomobject]@{ secret_data = 'never-allowed-in-state' })),
    (New-TestChange 'data.google_secret_manager_secret_version.latest' ([pscustomobject]@{}) -Actions @('read') -Mode 'data')
)) {
    Assert-Throws { Test-Plan (New-TestPlan @($change)) } 'Plano recusado'
}
Assert-Throws {
    Invoke-CheckedNative -Executable $env:ComSpec -Arguments @('/c', 'exit', '7') -Label 'Teste nativo'
} 'codigo 7'

# Simular a interface nativa e inspecionar o escopo de toda chamada gcloud.
$ConfigurationName = 'spm-site-hml'
$Account = 'suporteti@spmnacional.org.br'
$ProjectId = 'site-institucional-510319'
$Region = 'southamerica-east1'
$Zone = 'southamerica-east1-a'
$NamePrefix = 'spm-hml'
$script:Gcloud = 'gcloud-nao-executar'
$script:Calls = New-Object 'Collections.Generic.List[object]'
$script:BillingEnabled = $false
$script:ConfigurationExists = $false
function Invoke-CheckedNative {
    param([string]$Executable, [string[]]$Arguments, [string]$Label, [switch]$Capture)
    $script:Calls.Add([pscustomobject]@{ executable = $Executable; arguments = $Arguments })
    $command = $Arguments -join ' '
    if ($command -like '*config configurations list*') {
        if ($script:ConfigurationExists) { return '[{"name":"spm-site-hml"}]' }
        return '[]'
    }
    if ($command -like '*config configurations create*') { $script:ConfigurationExists = $true; return }
    if ($command -like '*config configurations describe*') {
        return '{"properties":{"core":{"account":"suporteti@spmnacional.org.br","project":"site-institucional-510319"}}}'
    }
    if ($command -like '*auth list*') { return '[{"account":"suporteti@spmnacional.org.br"}]' }
    if ($command -like '*projects describe*' -and $command -notlike '*billing projects describe*') {
        return '{"projectId":"site-institucional-510319","lifecycleState":"ACTIVE","projectNumber":"123456"}'
    }
    if ($command -like '*billing projects describe*') {
        if ($script:BillingEnabled) { return '{"billingEnabled":true}' }
        return '{"billingEnabled":false}'
    }
    if ($command -like '*config set*') { return }
    throw 'Chamada inesperada no teste. Nenhum comando nativo foi executado.'
}
Assert-Throws { Get-HmlPreflight } 'Faturamento nao habilitado'
$script:BillingEnabled = $true
$preflight = Get-HmlPreflight
Assert-Check ($preflight.billing_enabled -eq $true) 'Preflight autorizado deveria retornar billing_enabled=true.'
foreach ($call in $script:Calls) {
    foreach ($required in @('--configuration=spm-site-hml', '--account=suporteti@spmnacional.org.br', '--project=site-institucional-510319')) {
        Assert-Check ($call.arguments -contains $required) 'Chamada gcloud fora da configuracao/conta/projeto explicitados.'
    }
    Assert-Check (-not (($call.arguments -join ' ') -match 'config configurations activate|application-default|auth login|services enable|buckets create')) 'Preflight nao pode ativar conta, mudar ADC ou criar recursos GCP.'
}
$creation = @($script:Calls | Where-Object { ($_.arguments -join ' ') -like '*config configurations create*' })
Assert-Check ($creation.Count -eq 1 -and $creation[0].arguments -contains '--no-activate') 'Configuracao nova deve ser criada uma vez, sem ativar.'

$testBase = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../tmp'))
$script:PrivateRoot = Join-Path $testBase ("hml-script-test-$([guid]::NewGuid().ToString('N'))")
try {
    Initialize-HmlPrivateDirectory
    Initialize-HmlPrivateDirectory
    $file = Write-HmlPrivateText -Name 'release.json' -Text '{"APP_IMAGE":"no-secret"}'
    $sameFile = Write-HmlPrivateText -Name 'release.json' -Text '{"APP_IMAGE":"still-no-secret"}'
    Assert-Check ($sameFile -eq $file) 'Repeticao deve preservar o destino privado sem exigir privilegios adicionais.'
    $acl = Get-Acl -LiteralPath $file
    Assert-Check $acl.AreAccessRulesProtected 'Arquivo privado deve impedir heranca ACL externa.'
    $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    foreach ($rule in $rules) {
        Assert-Check ($rule.IdentityReference.Value -in @($currentUser, 'S-1-5-18')) 'Arquivo privado deve ser acessivel somente pelo operador e SYSTEM.'
    }
    $bytes = [IO.File]::ReadAllBytes($file)
    Assert-Check ($bytes[0] -eq 123) 'Arquivo deve usar UTF8 sem BOM.'
    Assert-Throws { Write-HmlPrivateText -Name '../escape.txt' -Text 'x' } 'Nome de arquivo privado invalido'
} finally {
    $absoluteTestRoot = [IO.Path]::GetFullPath($script:PrivateRoot)
    $absoluteTestBase = $testBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $absoluteTestRoot.StartsWith($absoluteTestBase, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Limpeza do teste recusada: diretorio fora de tmp.'
    }
    if (Test-Path -LiteralPath $absoluteTestRoot) { Remove-Item -LiteralPath $absoluteTestRoot -Recurse -Force }
}
Write-Host "$script:Checks verificacoes passaram; nenhum recurso GCP foi criado."
