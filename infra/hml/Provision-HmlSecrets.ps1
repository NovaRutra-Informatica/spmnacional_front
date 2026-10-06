#Requires -Version 5.1
<#
.SYNOPSIS
Prepara os sete segredos internos da HML, sem rotacionar versoes existentes.
.DESCRIPTION
O padrao consulta somente metadata remota e prepara arquivos locais protegidos.
-Publish publica apenas cofres sem nenhuma versao, usando --data-file. OAuth,
Calendar, SMTP e declaracao MFA ficam fora deste script. O material local completo
permite retomar uma publicacao interrompida sem gerar outras senhas.
.EXAMPLE
.\infra\hml\Provision-HmlSecrets.ps1
.EXAMPLE
.\infra\hml\Provision-HmlSecrets.ps1 -Publish
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[a-z][a-z0-9-]+$')]
    [string]$ConfigurationName = 'spm-site-hml',
    [ValidatePattern('^[^\s@]+@[^\s@]+$')]
    [string]$Account = 'suporteti@spmnacional.org.br',
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string]$ProjectId = 'site-institucional-510319',
    [ValidatePattern('^spm-hml(?:-[a-z0-9]+)*$')]
    [ValidateLength(7, 21)]
    [string]$NamePrefix = 'spm-hml',
    [ValidatePattern('^caddy:2(?:\.[0-9]+){0,2}-alpine(?:@sha256:[a-f0-9]{64})?$')]
    [string]$CaddyImage = 'caddy:2-alpine',
    [switch]$Publish
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$script:SecretsPrivateRoot = Join-Path $PSScriptRoot '.private'
$script:CoreSecretNames = @(
    'POSTGRES_PASSWORD', 'DATABASE_URL', 'RUNTIME_DATABASE_URL', 'AUTH_SECRET',
    'ENCRYPTION_KEY', 'CRON_SECRET', 'HML_BASIC_AUTH_HASH'
)

function Get-SecretField {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property) { return $property.Value }
    return $null
}

function Invoke-SecretGcloud {
    param([string[]]$Arguments, [string]$Label)
    $scopedArguments = @(
        "--configuration=$ConfigurationName", "--account=$Account", "--project=$ProjectId", '--quiet'
    ) + $Arguments
    Initialize-SecretPrivateDirectory
    $errorName = "hml-cli-$([guid]::NewGuid().ToString('N')).stderr"
    $errorPath = Write-SecretPrivateFile -Name $errorName -Text ''
    try {
        # Nao misturar stderr ao JSON: ferramentas podem imprimir resultados
        # extras ate com --format. Ambos os canais sao capturados sem exibir.
        $ErrorActionPreference = 'Continue'
        $output = @(& $script:SecretsGcloud @scopedArguments 2>$errorPath)
        $nativeExit = $LASTEXITCODE
        if ($nativeExit -ne 0) { throw "$Label falhou (codigo $nativeExit). Nenhum valor foi exibido." }
        return ($output -join "`n")
    } finally {
        if (Test-Path -LiteralPath $errorPath) { Remove-Item -LiteralPath $errorPath -Force }
    }
}

function Assert-SecretProject {
    $config = ConvertFrom-Json (Invoke-SecretGcloud -Arguments @(
        'config', 'configurations', 'describe', $ConfigurationName, '--format=json(properties.core.account,properties.core.project)'
    ) -Label 'Validacao da configuracao HML')
    $core = Get-SecretField (Get-SecretField $config 'properties') 'core'
    if ((Get-SecretField $core 'account') -ne $Account -or (Get-SecretField $core 'project') -ne $ProjectId) {
        throw 'Configuracao gcloud diferente da conta/projeto HML solicitado.'
    }
    $project = ConvertFrom-Json (Invoke-SecretGcloud -Arguments @(
        'projects', 'describe', $ProjectId, '--format=json(projectId,lifecycleState,projectNumber)'
    ) -Label 'Validacao do projeto HML')
    if ($project.projectId -ne $ProjectId -or $project.lifecycleState -ne 'ACTIVE') {
        throw 'Projeto HML inexistente, inativo ou diferente do solicitado.'
    }
    $script:SecretsProjectNumber = [string]$project.projectNumber
    if ($script:SecretsProjectNumber -notmatch '^[0-9]+$') { throw 'Numero do projeto HML invalido.' }
}

function Initialize-SecretPrivateDirectory {
    if ($env:OS -ne 'Windows_NT') { throw 'Este script requer ACL do Windows.' }
    if (-not (Test-Path -LiteralPath $script:SecretsPrivateRoot)) {
        $null = New-Item -ItemType Directory -Path $script:SecretsPrivateRoot
    }
    if ((Get-Item -LiteralPath $script:SecretsPrivateRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'A pasta privada nao pode ser junction/symlink.'
    }
    $acl = Get-Acl -LiteralPath $script:SecretsPrivateRoot
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl.SetSecurityDescriptorSddlForm("D:P(A;OICI;FA;;;$sid)(A;OICI;FA;;;SY)", [Security.AccessControl.AccessControlSections]::Access)
    if ($PSVersionTable.PSVersion.Major -le 5) { [IO.Directory]::SetAccessControl($script:SecretsPrivateRoot, $acl) }
    else { [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $script:SecretsPrivateRoot), $acl) }
}

function Protect-SecretFile {
    param([string]$Path)
    if ((Get-Item -LiteralPath $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'Arquivo privado nao pode ser symlink.'
    }
    $acl = Get-Acl -LiteralPath $Path
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl.SetSecurityDescriptorSddlForm("D:P(A;;FA;;;$sid)(A;;FA;;;SY)", [Security.AccessControl.AccessControlSections]::Access)
    if ($PSVersionTable.PSVersion.Major -le 5) { [IO.File]::SetAccessControl($Path, $acl) }
    else { [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $Path), $acl) }
}

function Write-SecretPrivateFile {
    param([string]$Name, [string]$Text)
    if ([IO.Path]::GetFileName($Name) -ne $Name) { throw 'Nome de arquivo privado invalido.' }
    $path = Join-Path $script:SecretsPrivateRoot $Name
    if (Test-Path -LiteralPath $path) { Protect-SecretFile -Path $path }
    $temporary = Join-Path $script:SecretsPrivateRoot ("$Name.writing-$([guid]::NewGuid().ToString('N'))")
    $backup = Join-Path $script:SecretsPrivateRoot ("$Name.previous-$([guid]::NewGuid().ToString('N'))")
    try {
        [IO.File]::WriteAllText($temporary, $Text, (New-Object Text.UTF8Encoding($false)))
        Protect-SecretFile -Path $temporary
        if (Test-Path -LiteralPath $path) { [IO.File]::Replace($temporary, $path, $backup) }
        else { [IO.File]::Move($temporary, $path) }
        Protect-SecretFile -Path $path
        return $path
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
        if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
    }
}

function New-SecretRandomText {
    param([int]$Bytes = 32, [switch]$Base64)
    $buffer = New-Object byte[] $Bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($buffer)
        if ($Base64) { return [Convert]::ToBase64String($buffer) }
        return [BitConverter]::ToString($buffer).Replace('-', '').ToLowerInvariant()
    } finally {
        [Array]::Clear($buffer, 0, $buffer.Length)
        $rng.Dispose()
    }
}

function New-SecretBasicHash {
    param([string]$Password)
    if ($Password -cnotmatch '\A[a-f0-9]{48}\z') { throw 'Senha Basic HML invalida.' }
    if ($CaddyImage -cnotmatch '\Acaddy:2(?:\.[0-9]+){0,2}-alpine(?:@sha256:[a-f0-9]{64})?\z') { throw 'Imagem Caddy invalida.' }
    $docker = (Get-Command docker.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $arguments = @(
        'run', '--rm', '--pull=never', '--network=none', '-i', $CaddyImage,
        'caddy', 'hash-password', '--algorithm', 'bcrypt'
    )
    $process = New-Object Diagnostics.Process
    try {
        $start = New-Object Diagnostics.ProcessStartInfo
        $start.FileName = $docker
        # Todos os tokens sao fixos ou a imagem validada acima; nenhuma senha em argv.
        $start.Arguments = $arguments -join ' '
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardInput = $true
        $start.RedirectStandardOutput = $true
        $start.RedirectStandardError = $true
        $process.StartInfo = $start
        $null = $process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        # Caddy ReadBytes('\n') exige LF e remove so esse byte. WriteLine/pipeline
        # no Windows acrescentam CRLF: o CR acabaria fazendo parte da senha.
        # O unico canal da senha e stdin: nao ha --plaintext, env ou volume montado.
        $inputBytes = [Text.Encoding]::UTF8.GetBytes($Password + "`n")
        try {
            # BaseStream funciona tambem no .NET Framework do Windows PowerShell 5.1.
            $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
            $process.StandardInput.BaseStream.Flush()
            $process.StandardInput.BaseStream.Close()
        } finally { [Array]::Clear($inputBytes, 0, $inputBytes.Length) }
        if (-not $process.WaitForExit(60000)) {
            $process.Kill()
            $null = $process.WaitForExit(5000)
            throw 'timeout'
        }
        $hashOutput = $stdout.GetAwaiter().GetResult().Trim()
        $null = $stderr.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0 -or $hashOutput -notmatch '^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$') { throw 'bcrypt' }
        return $hashOutput
    } catch {
        # Capturar erros nativos sem exibir stdout/stderr ou material sensivel.
        throw 'Caddy nao gerou bcrypt. Confirme Docker e a imagem Caddy local; nenhum dado foi exibido.'
    } finally {
        $process.Dispose()
    }
}

function Assert-SecretBundle {
    param($Bundle)
    try {
        if ($Bundle.schema -ne 1 -or $Bundle.project_id -ne $ProjectId -or $Bundle.name_prefix -ne $NamePrefix) {
            throw 'destino'
        }
        $secrets = $Bundle.secrets
        if (@($secrets.PSObject.Properties.Name).Count -ne $script:CoreSecretNames.Count) { throw 'conjunto' }
        foreach ($name in $script:CoreSecretNames) {
            $value = Get-SecretField $secrets $name
            if ($value -isnot [string] -or -not $value) { throw 'valor' }
        }
        $ownerPassword = $secrets.POSTGRES_PASSWORD
        if ($ownerPassword -notmatch '^[a-f0-9]{64}$') { throw 'owner' }
        if ($secrets.DATABASE_URL -cne "postgresql://spm:$ownerPassword@localhost/spmnacional?host=/var/run/postgresql&schema=public") { throw 'url-owner' }
        if ($secrets.RUNTIME_DATABASE_URL -cnotmatch '^postgresql://spm_app:([a-f0-9]{64})@localhost/spmnacional\?host=/var/run/postgresql&schema=public$') { throw 'url-runtime' }
        $runtimePassword = $Matches[1]
        if ($runtimePassword -ceq $ownerPassword) { throw 'senhas-iguais' }
        foreach ($name in @('AUTH_SECRET', 'CRON_SECRET')) {
            if ((Get-SecretField $secrets $name) -notmatch '^[a-f0-9]{64}$') { throw 'chave' }
        }
        $independent = @($ownerPassword, $runtimePassword, $secrets.AUTH_SECRET, $secrets.CRON_SECRET)
        if (@($independent | Select-Object -Unique).Count -ne $independent.Count) { throw 'chaves-iguais' }
        $encryption = [Convert]::FromBase64String($secrets.ENCRYPTION_KEY)
        if ($encryption.Length -ne 32 -or [Convert]::ToBase64String($encryption) -cne $secrets.ENCRYPTION_KEY) { throw 'criptografia' }
        if ($Bundle.basic_password -notmatch '^[a-f0-9]{48}$' -or $secrets.HML_BASIC_AUTH_HASH -notmatch '^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$') { throw 'basic' }
    } catch {
        # Excecoes JSON/URL/Base64 podem carregar trechos de valores: nunca expor.
        throw 'Material local core7 invalido, inconsistente ou pertencente a outro projeto. Nenhum valor foi exibido.'
    }
}

function New-SecretBundle {
    $ownerPassword = New-SecretRandomText
    $runtimePassword = New-SecretRandomText
    $basicPassword = New-SecretRandomText -Bytes 24
    $secrets = [pscustomobject][ordered]@{
        POSTGRES_PASSWORD = $ownerPassword
        DATABASE_URL = "postgresql://spm:$ownerPassword@localhost/spmnacional?host=/var/run/postgresql&schema=public"
        RUNTIME_DATABASE_URL = "postgresql://spm_app:$runtimePassword@localhost/spmnacional?host=/var/run/postgresql&schema=public"
        AUTH_SECRET = (New-SecretRandomText)
        ENCRYPTION_KEY = (New-SecretRandomText -Base64)
        CRON_SECRET = (New-SecretRandomText)
        HML_BASIC_AUTH_HASH = (New-SecretBasicHash -Password $basicPassword)
    }
    $bundle = [pscustomobject][ordered]@{
        schema = 1; project_id = $ProjectId; name_prefix = $NamePrefix
        generated_at_utc = [DateTime]::UtcNow.ToString('o')
        basic_password = $basicPassword; secrets = $secrets
    }
    Assert-SecretBundle $bundle
    return $bundle
}

function Get-CoreSecretVersion {
    param([string]$Name)
    if ($Name -notin $script:CoreSecretNames) { throw 'Somente os sete segredos internos HML sao suportados.' }
    $secretId = "$NamePrefix-$($Name.ToLowerInvariant().Replace('_', '-'))"
    $versions = ConvertFrom-Json (Invoke-SecretGcloud -Arguments @(
        'secrets', 'versions', 'list', $secretId, '--format=json(name,state)'
    ) -Label "Metadata de $Name")
    if (@($versions).Count -eq 0) { return $null }
    $latest = $null
    $maximum = [int64]0
    foreach ($version in $versions) {
        $versionName = Get-SecretField $version 'name'
        $number = Get-CoreVersionNumber -VersionName $versionName -SecretId $secretId
        if ($number -gt $maximum) { $maximum = $number; $latest = $version }
    }
    if ($null -eq $latest -or (Get-SecretField $latest 'state') -ne 'ENABLED') {
        throw "O cofre $Name ja tem versao desativada/destruida mais recente. Recupere a versao manualmente; este script nao rotaciona chaves."
    }
    return $maximum
}

function Get-CoreVersionNumber {
    param([string]$VersionName, [string]$SecretId)
    $pattern = "^projects/(?:$([regex]::Escape($ProjectId))|$([regex]::Escape($script:SecretsProjectNumber)))/secrets/$([regex]::Escape($SecretId))/versions/([0-9]+)$"
    if ($VersionName -notmatch $pattern) { throw 'Metadata de versao fora do projeto/cofre HML solicitado.' }
    $number = [int64]$Matches[1]
    if ($number -lt 1) { throw 'Numero de versao HML invalido.' }
    return $number
}

function Get-CoreSecretDecision {
    param([hashtable]$Versions, [bool]$LocalBundleExists)
    $existing = @($script:CoreSecretNames | Where-Object { $null -ne $Versions[$_] })
    if ($existing.Count -eq $script:CoreSecretNames.Count) { return 'preserve-all' }
    if ($existing.Count -gt 0 -and -not $LocalBundleExists) {
        throw 'Core7 remoto parcial e material local ausente. Recupere o conjunto local original antes de continuar; nenhuma chave sera gerada ou sobrescrita.'
    }
    if ($LocalBundleExists) { return 'reuse-local' }
    return 'generate-local'
}

function Invoke-CoreSecretProvision {
    param([switch]$DoPublish)
    Initialize-SecretPrivateDirectory
    $lockPath = Join-Path $script:SecretsPrivateRoot 'hml-core-secrets.lock'
    if (Test-Path -LiteralPath $lockPath) { Protect-SecretFile -Path $lockPath }
    $lock = $null
    try {
        try { $lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
        catch { throw 'Outro processo esta preparando os segredos HML. Espere sua conclusao e execute novamente.' }
        $versions = @{}
        foreach ($name in $script:CoreSecretNames) { $versions[$name] = Get-CoreSecretVersion -Name $name }
        $bundlePath = Join-Path $script:SecretsPrivateRoot 'hml-core-secrets.json'
        $decision = Get-CoreSecretDecision -Versions $versions -LocalBundleExists (Test-Path -LiteralPath $bundlePath)
        if ($decision -ne 'preserve-all') {
            if ($decision -eq 'reuse-local') {
                Protect-SecretFile -Path $bundlePath
                try { $bundle = ConvertFrom-Json ([IO.File]::ReadAllText($bundlePath)) }
                catch { throw 'Arquivo local core7 invalido; nenhum conteudo foi exibido.' }
                Assert-SecretBundle $bundle
            } else {
                $leftovers = @(
                    @($script:CoreSecretNames | ForEach-Object { Join-Path $script:SecretsPrivateRoot "hml-secret-$_.txt" }) +
                    @(Join-Path $script:SecretsPrivateRoot 'hml-basic-auth-password.txt') |
                    Where-Object { Test-Path -LiteralPath $_ }
                )
                if ($leftovers.Count) { throw 'Fragmentos locais core7 sem o conjunto original. Recupere o bundle antes de gerar; nenhum arquivo sera sobrescrito.' }
                $bundle = New-SecretBundle
                $null = Write-SecretPrivateFile -Name 'hml-core-secrets.json' -Text (ConvertTo-Json $bundle -Depth 8)
            }
            $null = Write-SecretPrivateFile -Name 'hml-basic-auth-password.txt' -Text $bundle.basic_password
        }
        $report = @()
        foreach ($name in $script:CoreSecretNames) {
            $secretId = "$NamePrefix-$($name.ToLowerInvariant().Replace('_', '-'))"
            if ($null -ne $versions[$name]) {
                $report += [pscustomobject]@{ name = $secretId; version = $versions[$name]; status = 'preserved' }
                continue
            }
            $dataFile = Write-SecretPrivateFile -Name "hml-secret-$name.txt" -Text (Get-SecretField $bundle.secrets $name)
            if (-not $DoPublish) {
                $report += [pscustomobject]@{ name = $secretId; version = $null; status = 'ready-local' }
                continue
            }
            # Nunca adicionar outra versao caso um operador tenha publicado apos
            # a revisao inicial. Uma nova execucao preservara o material remoto.
            if ($null -ne (Get-CoreSecretVersion -Name $name)) {
                throw "O cofre $name recebeu uma versao durante esta execucao. Publicacao interrompida para evitar rotacao; revise metadata e execute novamente."
            }
            $null = Invoke-SecretGcloud -Arguments @(
                'secrets', 'versions', 'add', $secretId, "--data-file=$dataFile", '--format=value(name)'
            ) -Label "Publicacao de $name"
            # Nao analisar a resposta de uma mutacao. Se esta leitura falhar,
            # a proxima execucao vera a versao existente e nao a rotacionara.
            $number = Get-CoreSecretVersion -Name $name
            if ($null -eq $number) { throw "Publicacao de $name concluida, mas metadata nao confirmou a versao. Revise o cofre antes de continuar." }
            $report += [pscustomobject]@{ name = $secretId; version = $number; status = 'published' }
        }
        return $report
    } finally {
        if ($null -ne $lock) { $lock.Dispose() }
    }
}

try {
    $gcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
    if ($null -eq $gcloudCommand) { $gcloudCommand = Get-Command gcloud -ErrorAction Stop }
    $script:SecretsGcloud = $gcloudCommand.Source
    Assert-SecretProject
    $report = @(Invoke-CoreSecretProvision -DoPublish:$Publish)
    ConvertTo-Json -InputObject $report -Depth 5
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
