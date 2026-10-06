#requires -Version 7.0
[CmdletBinding()]
param([switch]$Apply)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$hmlBillingAccount = '01C2C2-797E64-F65A13'
$hmlProject = 'site-institucional-510319'
$hmlProjectNumber = '114929512155'
$hmlDisplayName = 'SPM HML - BRL100 mensal'
$hmlScope = @(
    '--configuration=spm-site-hml'
    '--account=suporteti@spmnacional.org.br'
    "--project=$hmlProject"
    '--quiet'
)
$hmlBudgetCreate = @(
    'billing', 'budgets', 'create'
    "--billing-account=$hmlBillingAccount"
    "--display-name=$hmlDisplayName"
    '--budget-amount=100BRL'
    "--filter-projects=projects/$hmlProjectNumber"
    '--calendar-period=month'
    '--credit-types-treatment=exclude-all-credits'
    '--ownership-scope=billing-account'
    '--threshold-rule=percent=0.50,basis=current-spend'
    '--threshold-rule=percent=0.90,basis=current-spend'
    '--threshold-rule=percent=1.00,basis=current-spend'
    '--threshold-rule=percent=1.00,basis=forecasted-spend'
    '--format=json'
)

function Invoke-HmlBudgetJson([string[]]$CommandArguments) {
    $hmlOutput = & gcloud @hmlScope @CommandArguments
    if ($LASTEXITCODE -ne 0) {
        throw 'gcloud falhou; nenhum orçamento será criado após uma leitura inválida.'
    }
    return ConvertFrom-Json -InputObject ($hmlOutput -join [Environment]::NewLine)
}

function Get-HmlBudgetProperty($Object, [string]$Name, $Default = $null) {
    if ($null -eq $Object) { return $Default }
    $hmlProperty = $Object.PSObject.Properties[$Name]
    if ($null -eq $hmlProperty) { return $Default }
    return $hmlProperty.Value
}

function Assert-HmlBudget($Budget) {
    $hmlFilter = Get-HmlBudgetProperty $Budget 'budgetFilter'
    $hmlProjects = @(Get-HmlBudgetProperty $hmlFilter 'projects' @())
    $hmlAmount = Get-HmlBudgetProperty (Get-HmlBudgetProperty $Budget 'amount') 'specifiedAmount'
    $hmlNotifications = Get-HmlBudgetProperty $Budget 'notificationsRule'
    $hmlRules = @(Get-HmlBudgetProperty $Budget 'thresholdRules' @())
    $hmlActualRules = @($hmlRules | ForEach-Object {
        $hmlBasis = Get-HmlBudgetProperty $_ 'spendBasis' 'CURRENT_SPEND'
        $hmlPercent = [decimal](Get-HmlBudgetProperty $_ 'thresholdPercent')
        "$hmlBasis/$($hmlPercent.ToString('0.################', [Globalization.CultureInfo]::InvariantCulture))"
    } | Sort-Object)
    $hmlExpectedRules = @('CURRENT_SPEND/0.5', 'CURRENT_SPEND/0.9', 'CURRENT_SPEND/1', 'FORECASTED_SPEND/1')
    $hmlExtraFilters = @('services', 'labels', 'subaccounts', 'resourceAncestors', 'creditTypes', 'customPeriod')
    $hmlHasExtraFilters = @($hmlExtraFilters | Where-Object {
        $null -ne (Get-HmlBudgetProperty $hmlFilter $_)
    }).Count -gt 0
    $hmlValid = (
        (Get-HmlBudgetProperty $Budget 'displayName') -eq $hmlDisplayName -and
        $hmlProjects.Count -eq 1 -and
        $hmlProjects[0] -in @("projects/$hmlProject", "projects/$hmlProjectNumber") -and
        (Get-HmlBudgetProperty $hmlFilter 'calendarPeriod') -eq 'MONTH' -and
        (Get-HmlBudgetProperty $hmlFilter 'creditTypesTreatment') -eq 'EXCLUDE_ALL_CREDITS' -and
        -not $hmlHasExtraFilters -and
        (Get-HmlBudgetProperty $hmlAmount 'currencyCode') -eq 'BRL' -and
        [decimal](Get-HmlBudgetProperty $hmlAmount 'units' '-1') -eq 100 -and
        [decimal](Get-HmlBudgetProperty $hmlAmount 'nanos' '0') -eq 0 -and
        ($hmlActualRules -join ',') -eq ($hmlExpectedRules -join ',') -and
        -not (Get-HmlBudgetProperty $hmlNotifications 'disableDefaultIamRecipients' $false) -and
        -not (Get-HmlBudgetProperty $hmlNotifications 'pubsubTopic' '') -and
        @(Get-HmlBudgetProperty $hmlNotifications 'monitoringNotificationChannels' @()).Count -eq 0 -and
        (Get-HmlBudgetProperty $Budget 'ownershipScope') -eq 'BILLING_ACCOUNT'
    )
    if (-not $hmlValid) {
        throw 'Orçamento retornado/existente diverge do plano HML; revise-o. Nenhum orçamento existente será alterado.'
    }
}

if (-not $Apply) {
    Get-Content -LiteralPath (Join-Path $PSScriptRoot 'hml-budget.expected.json') -Raw
    Write-Output 'Prévia local. Para aplicar este orçamento isolado, execute novamente com -Apply.'
    $hmlQuoted = @($hmlScope + $hmlBudgetCreate | ForEach-Object { "'" + $_.Replace("'", "''") + "'" })
    Write-Output ('gcloud ' + ($hmlQuoted -join ' '))
    return
}

$hmlAccount = Invoke-HmlBudgetJson @('billing', 'accounts', 'describe', $hmlBillingAccount, '--format=json(name,open,currencyCode)')
$hmlProjectBilling = Invoke-HmlBudgetJson @('billing', 'projects', 'describe', $hmlProject, '--format=json')
if (-not $hmlAccount.open -or $hmlAccount.currencyCode -ne 'BRL' -or
    -not $hmlProjectBilling.billingEnabled -or
    $hmlProjectBilling.billingAccountName -ne "billingAccounts/$hmlBillingAccount") {
    throw 'Conta aberta em BRL e faturamento do projeto HML devem coincidir com o plano.'
}

$hmlEnabled = @(Invoke-HmlBudgetJson @('services', 'list', '--enabled', '--filter=config.name=billingbudgets.googleapis.com', '--format=json(config.name)'))
if ($hmlEnabled.Count -eq 0) {
    & gcloud @hmlScope services enable billingbudgets.googleapis.com
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível habilitar a API gratuita de orçamentos.' }
}

$hmlBudgets = @(Invoke-HmlBudgetJson @('billing', 'budgets', 'list', "--billing-account=$hmlBillingAccount", '--format=json'))
$hmlMatching = @($hmlBudgets | Where-Object { $_.displayName -eq $hmlDisplayName })
if ($hmlMatching.Count -gt 1) { throw 'Há orçamentos duplicados com este nome; revise-os antes de criar outro.' }
if ($hmlMatching.Count -eq 1) {
    Assert-HmlBudget $hmlMatching[0]
    $hmlMatching[0] | ConvertTo-Json -Depth 12
    Write-Output 'Orçamento HML correspondente já existe; nenhuma alteração realizada.'
    return
}
$hmlCreated = Invoke-HmlBudgetJson $hmlBudgetCreate
Assert-HmlBudget $hmlCreated
$hmlCreated | ConvertTo-Json -Depth 12
