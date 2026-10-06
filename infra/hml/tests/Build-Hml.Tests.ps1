#Requires -Version 5.1
# Fake CLIs only: no Docker daemon, gcloud, credentials or cloud operations.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$scriptPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../Invoke-Hml.ps1'))
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | ForEach-Object { $_.Message } | Out-String) }
$functions = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)
. ([scriptblock]::Create(($functions | ForEach-Object { $_.Extent.Text }) -join "`n"))
$script:Checks = 0
function Assert-Check([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:Checks++
}
function Assert-Throws([scriptblock]$Operation, [string]$Expected) {
    $caught = $null
    try { $null = & $Operation } catch { $caught = $_.Exception.Message }
    Assert-Check ($caught -like "*$Expected*") "Esperava rejeicao '$Expected', recebido '$caught'."
}
$ConfigurationName = 'spm-site-hml'
$Account = 'suporteti@spmnacional.org.br'
$ProjectId = 'site-institucional-510319'
$Region = 'southamerica-east1'
$NamePrefix = 'spm-hml'
$ImageTag = 'synthetic76'
$script:Gcloud = 'BuildGcloudFixture'
$script:RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$testBase = Join-Path $script:RepositoryRoot 'tmp'
$script:PrivateRoot = Join-Path $testBase ("hml-build-test-$([guid]::NewGuid().ToString('N'))")
$script:Calls = New-Object 'Collections.Generic.List[object]'
$script:LoginInputs = New-Object 'Collections.Generic.List[string]'
$localEndpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine'
$repositoryUrl = 'southamerica-east1-docker.pkg.dev/site-institucional-510319/spm-hml-docker'
$expectedRepository = 'projects/site-institucional-510319/locations/southamerica-east1/repositories/spm-hml-docker'
$syntheticToken = 'synthetic-test-token-never-a-credential'
$savedEnvironment = @{}
foreach ($name in @('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
function Get-Command {
    [CmdletBinding()]
    param([string]$Name, [string]$CommandType)
    if ($Name -ne 'docker.exe' -or $CommandType -ne 'Application') {
        throw 'Unexpected executable lookup; real CLIs are forbidden in this fixture.'
    }
    return [pscustomobject]@{ Source = 'BuildDockerFixture' }
}
function Add-FixtureCall([string]$Executable, [string[]]$Arguments) {
    $script:Calls.Add([pscustomobject]@{
        executable = $Executable; arguments = $Arguments
        host = [Environment]::GetEnvironmentVariable('DOCKER_HOST', 'Process')
        context = [Environment]::GetEnvironmentVariable('DOCKER_CONTEXT', 'Process')
        config = [Environment]::GetEnvironmentVariable('DOCKER_CONFIG', 'Process')
    })
}
function Invoke-CheckedNative {
    param([string]$Executable, [string[]]$Arguments, [string]$Label, [switch]$Capture)
    Add-FixtureCall $Executable $Arguments
    if ($Executable -eq 'BuildGcloudFixture') {
        if ($Arguments -contains 'repositories' -and $Arguments -contains 'describe') {
            return (ConvertTo-Json @{ name = $script:RepositoryName; format = 'DOCKER' } -Compress)
        }
        if ($Arguments -contains 'print-access-token') { return $syntheticToken }
        if ($Arguments -contains 'images' -and $Arguments -contains 'describe') {
            $tagged = @($Arguments | Where-Object { $_ -like '*-docker.pkg.dev/*' })[0]
            $hex = if ($tagged -like '*/spm-hml-postgres:*') { 'c' } elseif ($tagged -like '*/spm-hml-migrate:*') { 'b' } else { 'a' }
            return (ConvertTo-Json @{ image_summary = @{ digest = 'sha256:' + ($hex * 64) } } -Compress)
        }
    } elseif ($Executable -eq 'BuildDockerFixture') {
        if ($Arguments[0] -eq 'context') { return $script:ContextEndpoint }
        if ($Arguments[0] -eq 'image' -and $Arguments[1] -eq 'inspect') {
            if ($Arguments[2] -eq '--format={{.Os}}/{{.Architecture}}') {
                if ($Arguments[-1] -eq 'postgres.fixture') { return $script:PostgresPlatform }
                return 'linux/amd64'
            }
            if ($Arguments[2] -eq '--format={{json .Config.Labels}}') {
                return (ConvertTo-Json @{ 'org.spmnacional.postgres-version' = $script:PostgresVersion } -Compress)
            }
        }
        if ($Arguments[0] -in @('tag', 'build', 'push')) { return }
    }
    throw 'Unexpected simulated CLI invocation. No native command was executed.'
}
function BuildDockerFixture {
    process {
        if ($args[0] -ne 'login') { throw 'Only simulated Docker login may invoke this function.' }
        Add-FixtureCall 'BuildDockerFixture' @($args)
        $script:LoginInputs.Add([string]$_)
        $global:LASTEXITCODE = $script:LoginExit
    }
}
function Reset-Fixture {
    $script:Calls.Clear()
    $script:LoginInputs.Clear()
    $script:RepositoryName = $expectedRepository
    $script:ContextEndpoint = $localEndpoint
    $script:PostgresPlatform = 'linux/amd64'
    $script:PostgresVersion = '18.6'
    $script:LoginExit = 0
    $script:AppLocalImage = 'app.fixture'
    $script:MigratorLocalImage = 'migrator.fixture'
    $script:PostgresLocalImage = 'postgres.fixture'
    [Environment]::SetEnvironmentVariable('DOCKER_CONTEXT', $null, 'Process')
    $env:DOCKER_HOST = $localEndpoint
    $env:DOCKER_CONFIG = 'operator-config-fixture-not-read'
}
function Mutating-DockerCalls {
    return @($script:Calls | Where-Object {
        $_.executable -eq 'BuildDockerFixture' -and $_.arguments[0] -in @('tag', 'build', 'push', 'login')
    })
}
try {
    Assert-Check (@($ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq 'PostgresLocalImage' }).Count -eq 1) 'Optional PostgreSQL parameter missing.'
    foreach ($endpoint in @('tcp://192.0.2.10:2375', 'ssh://remote@example.invalid', 'unix:///var/run/docker.sock', 'npipe:////remote/pipe/docker_engine')) {
        Reset-Fixture
        $env:DOCKER_HOST = $endpoint
        Assert-Throws { Invoke-HmlBuild } 'Docker local do Windows'
        Assert-Check ($script:Calls.Count -eq 0) 'Remote endpoint must fail before daemon requests, tags or pushes.'
    }
    Reset-Fixture
    $env:DOCKER_CONTEXT = 'fixture-remote'
    $script:ContextEndpoint = 'tcp://192.0.2.11:2375'
    Assert-Throws { Invoke-HmlBuild } 'Docker local do Windows'
    Assert-Check ($script:Calls.Count -eq 1 -and $script:Calls[0].arguments[0] -eq 'context' -and $script:Calls[0].arguments -contains 'fixture-remote') 'Selected context must take precedence over local DOCKER_HOST.'
    Assert-Check (@(Mutating-DockerCalls).Count -eq 0) 'Remote context must never reach tag/build/login/push.'
    foreach ($version in @('17.9', '', '18.6 ', '18.6.0')) {
        Reset-Fixture
        $script:PostgresVersion = $version
        Assert-Throws { Invoke-HmlBuild } 'postgres-version=18.6 exatamente'
        Assert-Check (@(Mutating-DockerCalls).Count -eq 0) 'Invalid PostgreSQL label must fail before tagging any image.'
        Assert-Check ($env:DOCKER_HOST -eq $localEndpoint -and $env:DOCKER_CONFIG -eq 'operator-config-fixture-not-read') 'Environment must be restored on validation failure.'
    }
    Reset-Fixture
    $script:PostgresPlatform = 'linux/arm64'
    Assert-Throws { Invoke-HmlBuild } 'linux/amd64'
    Assert-Check (@(Mutating-DockerCalls).Count -eq 0) 'Invalid PostgreSQL architecture must prevent all mutations.'
    foreach ($repository in @($expectedRepository.Replace('510319', '999999'), $expectedRepository.Replace('southamerica-east1', 'us-central1'), $expectedRepository.Replace('spm-hml-docker', 'other-docker'))) {
        Reset-Fixture
        $script:RepositoryName = $repository
        Assert-Throws { Invoke-HmlBuild } 'fora do projeto/regiao/prefixo'
        Assert-Check (@(Mutating-DockerCalls).Count -eq 0) 'Repository outside the selected HML scope must not be published.'
    }
    Reset-Fixture
    # A local context intentionally overrides an inherited remote host. The
    # pinned endpoint is used thereafter and all original values are restored.
    $env:DOCKER_CONTEXT = 'fixture-local'
    $env:DOCKER_HOST = 'ssh://ignored@example.invalid'
    $release = Invoke-HmlBuild
    Assert-Check ($release.APP_IMAGE -eq "$repositoryUrl/spm-hml-site@sha256:$('a' * 64)") 'App digest outside the HML repository.'
    Assert-Check ($release.MIGRATOR_IMAGE -eq "$repositoryUrl/spm-hml-migrate@sha256:$('b' * 64)") 'Migrator digest outside the HML repository.'
    Assert-Check ($release.POSTGRES_IMAGE -eq "$repositoryUrl/spm-hml-postgres@sha256:$('c' * 64)") 'PostgreSQL digest must use the fixed package in the same repository.'
    $tags = @($script:Calls | Where-Object { $_.arguments[0] -eq 'tag' })
    $pushes = @($script:Calls | Where-Object { $_.arguments[0] -eq 'push' })
    Assert-Check ($tags.Count -eq 3 -and $pushes.Count -eq 3) 'Optional PostgreSQL must publish exactly three artifacts.'
    foreach ($call in $script:Calls) {
        Assert-Check (-not ($call.arguments -contains $syntheticToken)) 'Token must never appear in CLI arguments.'
        if ($call.executable -eq 'BuildGcloudFixture') {
            foreach ($flag in @('--configuration=spm-site-hml', '--account=suporteti@spmnacional.org.br', '--project=site-institucional-510319', '--quiet')) {
                Assert-Check ($call.arguments -contains $flag) 'Gcloud must keep explicit configuration/account/project scope.'
            }
        } elseif ($call.arguments[0] -ne 'context') {
            Assert-Check ($call.host -eq $localEndpoint -and -not $call.context) 'Every daemon operation must use the validated local endpoint.'
        }
    }
    Assert-Check ($script:LoginInputs.Count -eq 1 -and $script:LoginInputs[0] -eq $syntheticToken) 'Registry token must be delivered by stdin only.'
    $login = @($script:Calls | Where-Object { $_.arguments[0] -eq 'login' })[0]
    Assert-Check ($login.arguments -contains '--password-stdin' -and $login.arguments[-1] -eq 'southamerica-east1-docker.pkg.dev') 'Login must target the regional registry using stdin.'
    Assert-Check ($env:DOCKER_HOST -eq 'ssh://ignored@example.invalid' -and $env:DOCKER_CONTEXT -eq 'fixture-local' -and $env:DOCKER_CONFIG -eq 'operator-config-fixture-not-read') 'Original Docker settings must remain intact.'
    Assert-Check (-not (Test-Path -LiteralPath $login.config)) 'Temporary Docker credentials directory must be removed.'
    $diskRelease = Get-Content -Raw -LiteralPath (Join-Path $script:PrivateRoot 'release.json') | ConvertFrom-Json
    $diskEnv = [IO.File]::ReadAllLines((Join-Path $script:PrivateRoot 'release.env'))
    Assert-Check ($diskRelease.POSTGRES_IMAGE -eq $release.POSTGRES_IMAGE -and $diskEnv.Count -eq 3 -and $diskEnv[2] -eq "POSTGRES_IMAGE=$($release.POSTGRES_IMAGE)") 'Both protected release files must contain the third immutable digest.'
    $labelIndex = 0
    $firstTagIndex = -1
    for ($index = 0; $index -lt $script:Calls.Count; $index++) {
        if ($script:Calls[$index].arguments -contains '--format={{json .Config.Labels}}') { $labelIndex = $index }
        if ($firstTagIndex -eq -1 -and $script:Calls[$index].arguments[0] -eq 'tag') { $firstTagIndex = $index }
    }
    Assert-Check ($labelIndex -lt $firstTagIndex) 'PostgreSQL label must be validated before the first tag.'
    Reset-Fixture
    $script:PostgresLocalImage = ''
    $release = Invoke-HmlBuild
    Assert-Check ($null -eq (Get-Field $release 'POSTGRES_IMAGE')) 'Default build must preserve its original two-image release.'
    Assert-Check (@($script:Calls | Where-Object { $_.arguments[0] -eq 'tag' }).Count -eq 2 -and @($script:Calls | Where-Object { $_.arguments[0] -eq 'push' }).Count -eq 2) 'Default build must publish only app and migrator.'
    Assert-Check ([IO.File]::ReadAllLines((Join-Path $script:PrivateRoot 'release.env')).Count -eq 2) 'Default release.env must retain exactly two images.'
    Reset-Fixture
    $script:PostgresLocalImage = ''
    $script:AppLocalImage = ''
    $script:MigratorLocalImage = ''
    $null = Invoke-HmlBuild
    $builds = @($script:Calls | Where-Object { $_.arguments[0] -eq 'build' })
    Assert-Check ($builds.Count -eq 2 -and $builds[0].arguments -contains 'runner' -and $builds[1].arguments -contains 'migrator') 'Original Dockerfile target builds must remain available.'
    Reset-Fixture
    $script:LoginExit = 9
    Assert-Throws { Invoke-HmlBuild } 'codigo 9'
    Assert-Check (@($script:Calls | Where-Object { $_.arguments[0] -eq 'push' }).Count -eq 0) 'Failed login must never publish images.'
    Assert-Check ($env:DOCKER_HOST -eq $localEndpoint -and $env:DOCKER_CONFIG -eq 'operator-config-fixture-not-read') 'Docker environment must be restored after login failure.'
} finally {
    foreach ($name in $savedEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
    }
    $absoluteTestRoot = [IO.Path]::GetFullPath($script:PrivateRoot)
    $absoluteTestBase = [IO.Path]::GetFullPath($testBase).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $absoluteTestRoot.StartsWith($absoluteTestBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe fixture cleanup outside tmp.' }
    if (Test-Path -LiteralPath $absoluteTestRoot) { Remove-Item -LiteralPath $absoluteTestRoot -Recurse -Force }
}
Write-Host "$script:Checks build publisher checks passed; fake CLIs only, no Docker daemon or GCP."
