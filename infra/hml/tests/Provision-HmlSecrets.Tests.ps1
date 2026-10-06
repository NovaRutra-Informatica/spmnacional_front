#Requires -Version 5.1
param([switch]$TestDocker)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
$scriptPath = Join-Path $PSScriptRoot '../Provision-HmlSecrets.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile(
    [IO.Path]::GetFullPath($scriptPath), [ref]$tokens, [ref]$parseErrors
)
if ($parseErrors.Count) { throw ($parseErrors | ForEach-Object { $_.Message } | Out-String) }
$functions = $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $false)
. ([scriptblock]::Create(($functions | ForEach-Object { $_.Extent.Text }) -join "`n"))
$ConfigurationName = 'spm-site-hml'
$Account = 'suporteti@spmnacional.org.br'
$ProjectId = 'site-institucional-510319'
$NamePrefix = 'spm-hml'
$CaddyImage = 'caddy:2-alpine'
$script:SecretsProjectNumber = '123456'
$script:CoreSecretNames = @('POSTGRES_PASSWORD', 'DATABASE_URL', 'RUNTIME_DATABASE_URL', 'AUTH_SECRET', 'ENCRYPTION_KEY', 'CRON_SECRET', 'HML_BASIC_AUTH_HASH')
$script:Checks = 0
$testBase = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../tmp'))
$script:SecretsPrivateRoot = Join-Path $testBase ("hml-secret-test-$([guid]::NewGuid().ToString('N'))")
function Assert-Check {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
    $script:Checks++
}
function Assert-Throws {
    param([scriptblock]$Operation, [string]$Expected)
    $caught = $null
    try { $null = & $Operation } catch { $caught = $_.Exception.Message }
    Assert-Check ($caught -like "*$Expected*") "Esperava rejeicao '$Expected', recebido '$caught'."
}

# Provar o escopo nativo sem chamar um CLI real.
$script:NativeArguments = @()
function SecretNativeFixture {
    $script:NativeArguments = @($args)
    $global:LASTEXITCODE = 0
    return '{}'
}
$script:SecretsGcloud = 'SecretNativeFixture'
$null = Invoke-SecretGcloud -Arguments @('secrets', 'versions', 'list', 'spm-hml-auth-secret', '--format=json(name,state)') -Label 'Teste metadata'
foreach ($flag in @('--configuration=spm-site-hml', '--account=suporteti@spmnacional.org.br', '--project=site-institucional-510319')) {
    Assert-Check ($script:NativeArguments -contains $flag) 'Gcloud deve explicitar configuracao, conta e projeto.'
}
function SecretNativeFixture { $global:LASTEXITCODE = 9; return 'never-display-native-output' }
Assert-Throws { Invoke-SecretGcloud -Arguments @('auth', 'list') -Label 'Teste nativo' } 'codigo 9'

foreach ($invalidPassword in @(('a' * 47), ('A' * 48), (('a' * 48) + "`n"), (('a' * 48) + "`r"))) {
    Assert-Throws { New-SecretBasicHash -Password $invalidPassword } 'Senha Basic HML invalida'
}

if ($TestDocker) {
    # Um Caddy real, sem rede externa, prova correspondencia de senha e hash.
    # A amostra e publica/sintetica; nenhuma credencial real ou GCP e consultado.
    function Invoke-CaddyFixture {
        param([string[]]$Arguments, [string]$InputText = '')
        $process = New-Object Diagnostics.Process
        try {
            $start = New-Object Diagnostics.ProcessStartInfo
            $start.FileName = (Get-Command docker.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
            foreach ($argument in $Arguments) {
                if ($argument.Contains('"') -or $argument.EndsWith('\')) { throw 'Token inesperado no fixture Docker.' }
            }
            $start.Arguments = ($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
            $start.UseShellExecute = $false
            $start.CreateNoWindow = $true
            $start.RedirectStandardInput = $true
            $start.RedirectStandardOutput = $true
            $start.RedirectStandardError = $true
            $process.StartInfo = $start
            $null = $process.Start()
            $stdout = $process.StandardOutput.ReadToEndAsync()
            $stderr = $process.StandardError.ReadToEndAsync()
            $inputBytes = [Text.Encoding]::UTF8.GetBytes($InputText)
            $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
            $process.StandardInput.BaseStream.Flush()
            $process.StandardInput.BaseStream.Close()
            if (-not $process.WaitForExit(60000)) {
                $process.Kill()
                $null = $process.WaitForExit(5000)
                throw 'Timeout no fixture Caddy.'
            }
            return [pscustomobject]@{
                ExitCode = $process.ExitCode
                Output = $stdout.GetAwaiter().GetResult()
                Error = $stderr.GetAwaiter().GetResult()
            }
        } finally { $process.Dispose() }
    }
    function Get-CaddyFixtureStatus {
        param([string]$Route, [string]$Password, [switch]$NoAuth)
        $header = ''
        if (-not $NoAuth) {
            $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("hml:$Password"))
            $header = "--header='Authorization: Basic $encoded'"
        }
        # O header transita somente pelo stdin de docker exec, nunca em argv.
        $shell = "wget -S -O /dev/null $header http://127.0.0.1:8080/$Route 2>&1`n"
        $result = Invoke-CaddyFixture @('exec', '-i', $containerName, 'sh') $shell
        $matches = [regex]::Matches(($result.Output + $result.Error), 'HTTP/1\.[01] ([0-9]{3})')
        if ($matches.Count -eq 0) { return 0 }
        if (@($matches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique).Count -ne 1) { throw 'Fixture retornou statuses HTTP divergentes.' }
        return [int]$matches[0].Groups[1].Value
    }
    $syntheticPassword = 'a' * 48
    $hash = New-SecretBasicHash -Password $syntheticPassword
    Assert-Check ($hash -match '^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$') 'Caddy local deve produzir bcrypt valido por stdin.'
    $legacy = Invoke-CaddyFixture @('run', '--rm', '--pull=never', '--network=none', '-i', $CaddyImage, 'caddy', 'hash-password', '--algorithm', 'bcrypt') ($syntheticPassword + "`r`n")
    Assert-Check ($legacy.ExitCode -eq 0) 'Reprodutor CRLF deve gerar hash.'
    $legacyHash = $legacy.Output.Trim()
    Assert-Check ($legacyHash -match '^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$') 'Reprodutor CRLF deve retornar bcrypt valido.'
    $withoutLf = Invoke-CaddyFixture @('run', '--rm', '--pull=never', '--network=none', '-i', $CaddyImage, 'caddy', 'hash-password', '--algorithm', 'bcrypt') $syntheticPassword
    Assert-Check ($withoutLf.ExitCode -ne 0) 'Caddy exige LF antes do EOF; zero LF nao e uma correcao valida.'
    $fixturePath = Write-SecretPrivateFile -Name 'caddy-basic-test.Caddyfile' -Text (@'
{
    admin off
    auto_https off
}
:8080 {
    handle /fixed {
        basic_auth {
            hml FIXED_HASH
        }
        respond "ok"
    }
    handle /legacy {
        basic_auth {
            hml LEGACY_HASH
        }
        respond "ok"
    }
}
'@.Replace('FIXED_HASH', $hash).Replace('LEGACY_HASH', $legacyHash))
    $containerName = 'spm-hml-basic-test-' + [guid]::NewGuid().ToString('N')
    try {
        $started = Invoke-CaddyFixture @('run', '--rm', '--pull=never', '--network=none', '-d', '--name', $containerName, '--volume', "${fixturePath}:/etc/caddy/Caddyfile:ro", $CaddyImage)
        Assert-Check ($started.ExitCode -eq 0) 'Fixture Caddy precisa iniciar sem rede externa.'
        $initialStatus = 0
        for ($attempt = 0; $attempt -lt 20 -and $initialStatus -eq 0; $attempt++) {
            $initialStatus = Get-CaddyFixtureStatus -Route 'fixed' -NoAuth
            if ($initialStatus -eq 0) { Start-Sleep -Milliseconds 100 }
        }
        Assert-Check ($initialStatus -eq 401) 'Caddy deve negar acesso sem Basic Auth.'
        Assert-Check ((Get-CaddyFixtureStatus 'fixed' ('b' * 48)) -eq 401) 'Hash corrigido deve negar senha diferente.'
        Assert-Check ((Get-CaddyFixtureStatus 'fixed' $syntheticPassword) -eq 200) 'Hash corrigido deve aceitar exatamente os 48 caracteres, sem CR.'
        Assert-Check ((Get-CaddyFixtureStatus 'fixed' ($syntheticPassword + "`r")) -eq 401) 'Hash corrigido deve negar CR adicional.'
        Assert-Check ((Get-CaddyFixtureStatus 'legacy' $syntheticPassword) -eq 401) 'Hash CRLF reproduz o bug: senha exata deve ser negada.'
        Assert-Check ((Get-CaddyFixtureStatus 'legacy' ($syntheticPassword + "`r")) -eq 200) 'Hash CRLF autentica somente com CR adicional.'
    } finally {
        $null = Invoke-CaddyFixture @('rm', '--force', $containerName)
        if (Test-Path -LiteralPath $fixturePath) { Remove-Item -LiteralPath $fixturePath -Force }
        $hash = $null
        $legacyHash = $null
        $syntheticPassword = $null
    }
}
$script:HashCalls = 0
function New-SecretBasicHash {
    param([string]$Password)
    $script:HashCalls++
    Assert-Check ($Password -match '^[a-f0-9]{48}$') 'Senha Basic precisa de 24 bytes aleatorios.'
    return ('$2b$14$' + ('A' * 53))
}

$first = New-SecretBundle
Assert-SecretBundle $first
Assert-Check ($first.secrets.POSTGRES_PASSWORD -ne (New-SecretRandomText)) 'RNG deve gerar valores independentes.'
Assert-Check ([Convert]::FromBase64String($first.secrets.ENCRYPTION_KEY).Length -eq 32) 'Criptografia precisa de 32 bytes canonicos.'
Assert-Check ($first.secrets.DATABASE_URL.Contains('@localhost/spmnacional?host=/var/run/postgresql&schema=public')) 'SQL precisa do socket privado no banco spmnacional.'
foreach ($mutation in @('project', 'runtime-password', 'url-host', 'auth-duplicate', 'base64', 'extra-secret')) {
    $invalid = ConvertFrom-Json (ConvertTo-Json $first -Depth 8)
    switch ($mutation) {
        'project' { $invalid.project_id = 'outro-projeto' }
        'runtime-password' { $invalid.secrets.RUNTIME_DATABASE_URL = $invalid.secrets.DATABASE_URL.Replace('spm:', 'spm_app:') }
        'url-host' { $invalid.secrets.DATABASE_URL = $invalid.secrets.DATABASE_URL.Replace('@localhost/', '@db/') }
        'auth-duplicate' { $invalid.secrets.AUTH_SECRET = $invalid.secrets.CRON_SECRET }
        'base64' { $invalid.secrets.ENCRYPTION_KEY = 'sensitive-invalid-do-not-print' }
        'extra-secret' { $invalid.secrets | Add-Member -NotePropertyName GOOGLE_OAUTH_CLIENT_SECRET -NotePropertyValue 'outside-core7' }
    }
    Assert-Throws { Assert-SecretBundle $invalid } 'Material local core7 invalido'
}
Assert-Throws { Get-CoreVersionNumber 'projects/999999/secrets/spm-hml-auth-secret/versions/1' 'spm-hml-auth-secret' } 'fora do projeto'
Assert-Throws { Get-CoreSecretVersion 'GOOGLE_OAUTH_CLIENT_SECRET' } 'Somente os sete'

$originalInvoker = (Get-Item Function:\Invoke-SecretGcloud).ScriptBlock
$script:Remote = @{}
$script:RemoteState = 'ENABLED'
$script:AddCalls = 0
$script:FailAddNumber = 0
$script:RecordedArguments = New-Object 'Collections.Generic.List[object]'
function Invoke-SecretGcloud {
    param([string[]]$Arguments, [string]$Label)
    $script:RecordedArguments.Add([pscustomobject]@{ arguments = $Arguments })
    if ($Arguments[0] -ne 'secrets' -or $Arguments[1] -ne 'versions') { throw 'Teste tentou comando fora de metadata/publicacao core7.' }
    if ($Arguments[2] -eq 'list') {
        Assert-Check ($Arguments[3] -match '^spm-hml-[a-z-]+$') 'versions list exige o ID do segredo como argumento posicional.'
        Assert-Check (@($Arguments | Where-Object { $_ -like '--secret=*' }).Count -eq 0) 'versions list nao aceita --secret.'
        $secretId = $Arguments[3]
        if (-not $script:Remote.ContainsKey($secretId)) { return '[]' }
        return ConvertTo-Json -InputObject @([pscustomobject]@{
            name = "projects/123456/secrets/$secretId/versions/$($script:Remote[$secretId])"
            state = $script:RemoteState
        })
    }
    if ($Arguments[2] -eq 'add') {
        $script:AddCalls++
        if ($script:FailAddNumber -eq $script:AddCalls) { throw 'Falha sintetica antes da publicacao.' }
        $secretId = $Arguments[3]
        $dataFlag = @($Arguments | Where-Object { $_ -like '--data-file=*' })
        Assert-Check ($dataFlag.Count -eq 1) 'Publicacao exige --data-file.'
        $file = $dataFlag[0].Substring(12)
        $contents = [IO.File]::ReadAllText($file)
        Assert-Check (-not (($Arguments -join ' ').Contains($contents))) 'O segredo nao pode estar em argv.'
        Assert-Check ((Get-Acl -LiteralPath $file).AreAccessRulesProtected) 'Arquivo enviado deve estar protegido por ACL.'
        Assert-Check (-not $script:Remote.ContainsKey($secretId)) 'Publicacao nao pode rotacionar um cofre existente.'
        $script:Remote[$secretId] = 1
        return ConvertTo-Json ([pscustomobject]@{ name = "projects/123456/secrets/$secretId/versions/1" })
    }
    throw 'Chamada inesperada no teste.'
}

try {
    # Um conjunto parcial sem o original local nunca inicia geracao.
    $beforeHash = $script:HashCalls
    $script:Remote['spm-hml-auth-secret'] = 1
    Assert-Throws { Invoke-CoreSecretProvision } 'remoto parcial e material local ausente'
    Assert-Check ($script:HashCalls -eq $beforeHash) 'Conjunto parcial nao pode gerar chaves novas.'
    Assert-Check ($script:AddCalls -eq 0) 'Conjunto parcial nao pode publicar.'

    # Se todos existem, preservar tambem sem material local.
    foreach ($name in $script:CoreSecretNames) { $script:Remote["spm-hml-$($name.ToLowerInvariant().Replace('_', '-'))"] = 1 }
    $preserved = @(Invoke-CoreSecretProvision -DoPublish)
    Assert-Check ($preserved.Count -eq 7 -and @($preserved | Where-Object { $_.status -ne 'preserved' }).Count -eq 0) 'Todos os sete cofres existentes devem ser preservados.'
    Assert-Check ($script:AddCalls -eq 0 -and $script:HashCalls -eq $beforeHash) 'Preservacao nao pode gerar nem publicar.'
    $script:Remote.Clear()

    # Preview gera um bundle completo, arquivos protegidos, nenhuma versao remota.
    $preview = @(Invoke-CoreSecretProvision)
    Assert-Check ($preview.Count -eq 7 -and $script:AddCalls -eq 0) 'Preview deve preparar sete segredos sem publicar.'
    $bundleFile = Join-Path $script:SecretsPrivateRoot 'hml-core-secrets.json'
    $originalText = [IO.File]::ReadAllText($bundleFile)
    $bundle = ConvertFrom-Json $originalText
    Assert-SecretBundle $bundle
    $previewAgain = @(Invoke-CoreSecretProvision)
    Assert-Check ([IO.File]::ReadAllText($bundleFile) -ceq $originalText) 'Segundo preview deve reutilizar as mesmas chaves.'
    foreach ($secretProperty in $bundle.secrets.PSObject.Properties) {
        Assert-Check (-not (ConvertTo-Json $preview -Depth 5).Contains([string]$secretProperty.Value)) 'Relatorio nao pode incluir valores.'
    }
    $passwordFile = Join-Path $script:SecretsPrivateRoot 'hml-basic-auth-password.txt'
    Assert-Check ([IO.File]::ReadAllText($passwordFile) -ceq $bundle.basic_password) 'Senha Basic deve ficar somente no arquivo privado.'
    Assert-Check ([IO.File]::ReadAllBytes($passwordFile)[0] -ne 239) 'Arquivo de segredo deve ser UTF8 sem BOM.'
    $rules = (Get-Acl -LiteralPath $passwordFile).GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    foreach ($rule in $rules) { Assert-Check ($rule.IdentityReference.Value -in @($currentUser, 'S-1-5-18')) 'ACL deve permitir somente operador e SYSTEM.' }

    # Uma interrupcao depois de duas versoes deve retomar cinco, sem rotacao.
    $script:FailAddNumber = 3
    Assert-Throws { Invoke-CoreSecretProvision -DoPublish } 'Falha sintetica'
    Assert-Check ($script:Remote.Count -eq 2) 'Interrupcao sintetica deve preservar as duas publicacoes concluídas.'
    $script:FailAddNumber = 0
    $completed = @(Invoke-CoreSecretProvision -DoPublish)
    Assert-Check ($script:Remote.Count -eq 7) 'Retomada deve completar core7.'
    Assert-Check (@($completed | Where-Object { $_.status -eq 'published' }).Count -eq 5) 'Retomada publica somente os cinco cofres ausentes.'
    $beforeAdds = $script:AddCalls
    $null = Invoke-CoreSecretProvision -DoPublish
    Assert-Check ($script:AddCalls -eq $beforeAdds) 'Execucao repetida nao deve criar outra versao.'
    Assert-Check ([IO.File]::ReadAllText($bundleFile) -ceq $originalText) 'Publicacao nao deve mudar senhas/URLs do banco.'
    $script:RemoteState = 'DISABLED'
    Assert-Throws { Get-CoreSecretVersion 'AUTH_SECRET' } 'nao rotaciona'
    $script:RemoteState = 'ENABLED'
    Assert-Throws { Write-SecretPrivateFile '../escape.txt' 'x' } 'Nome de arquivo privado invalido'
} finally {
    $target = [IO.Path]::GetFullPath($script:SecretsPrivateRoot)
    $expectedBase = $testBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $target.StartsWith($expectedBase, [StringComparison]::OrdinalIgnoreCase)) { throw 'Limpeza recusada fora do diretorio tmp.' }
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
    Set-Item Function:\Invoke-SecretGcloud -Value $originalInvoker
}
Write-Host "$script:Checks verificacoes passaram; nenhum comando GCP real foi executado."
