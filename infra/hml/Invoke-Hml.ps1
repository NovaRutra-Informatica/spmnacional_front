#Requires -Version 5.1
<#
.SYNOPSIS
Preflight, infraestrutura e imagens da HML em Sao Paulo.
.DESCRIPTION
Nao ativa configuracoes gcloud nem altera ADC. Infrastructure so cria recursos
com -Apply; um plano sem -Apply precisa de bucket de estado existente.
Configure/Deploy e versoes de secrets sao etapas separadas, depois de configurar
OAuth, dominio HTTPS e a politica real de MFA. Nenhum segredo entra em argumentos,
metadata Terraform ou release.json.
.EXAMPLE
.\infra\hml\Invoke-Hml.ps1 -Action Preflight
.EXAMPLE
.\infra\hml\Invoke-Hml.ps1 -Action Infrastructure -Apply
.EXAMPLE
.\infra\hml\Invoke-Hml.ps1 -Action Build
.EXAMPLE
.\infra\hml\Invoke-Hml.ps1 -Action Build -AppLocalImage spmnacional-front:runner -MigratorLocalImage spmnacional-front:migrator -PostgresLocalImage spmnacional-postgres:secure76
#>
[CmdletBinding()]
param(
    [ValidateSet('Preflight', 'Infrastructure', 'Build')]
    [string]$Action = 'Preflight',
    [ValidatePattern('^[a-z][a-z0-9-]+$')]
    [string]$ConfigurationName = 'spm-site-hml',
    [ValidatePattern('^[^\s@]+@[^\s@]+$')]
    [string]$Account = 'suporteti@spmnacional.org.br',
    [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
    [string]$ProjectId = 'site-institucional-510319',
    [ValidateSet('southamerica-east1')]
    [string]$Region = 'southamerica-east1',
    [ValidateSet('southamerica-east1-a', 'southamerica-east1-b', 'southamerica-east1-c')]
    [string]$Zone = 'southamerica-east1-a',
    [ValidatePattern('^spm-hml(?:-[a-z0-9]+)*$')]
    [ValidateLength(7, 21)]
    [string]$NamePrefix = 'spm-hml',
    [string]$TerraformVariablesFile,
    [ValidatePattern('^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$')]
    [string]$ImageTag,
    [string]$AppLocalImage,
    [string]$MigratorLocalImage,
    [string]$PostgresLocalImage,
    [switch]$Apply
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$script:PrivateRoot = Join-Path $PSScriptRoot '.private'
$script:TerraformRoot = Join-Path $PSScriptRoot 'terraform'
$script:RepositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))

function Get-Field {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $null }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -ne $property) { return $property.Value }
    return $null
}

function Invoke-CheckedNative {
    param([string]$Executable, [string[]]$Arguments, [string]$Label, [switch]$Capture)
    # PS 5.1 pode transformar stderr nativo em ErrorRecord. O codigo de saida,
    # conferido imediatamente, decide sucesso; stderr continua visivel.
    $ErrorActionPreference = 'Continue'
    $nativeOutput = @(& $Executable @Arguments)
    $nativeExit = $LASTEXITCODE
    if ($nativeExit -ne 0) { throw "$Label falhou (codigo $nativeExit)." }
    if ($Capture) { return ($nativeOutput -join "`n") }
    foreach ($line in $nativeOutput) { Write-Host $line }
}

function Invoke-HmlGcloud {
    param([string[]]$Arguments, [string]$Label, [switch]$Capture)
    $scopedArguments = @(
        "--configuration=$ConfigurationName", "--account=$Account", "--project=$ProjectId", '--quiet'
    ) + $Arguments
    Invoke-CheckedNative -Executable $script:Gcloud -Arguments $scopedArguments -Label $Label -Capture:$Capture
}

function Initialize-HmlConfiguration {
    $configs = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
        'config', 'configurations', 'list', '--format=json'
    ) -Label 'Listagem das configuracoes gcloud' -Capture)
    $matching = @($configs | Where-Object { (Get-Field $_ 'name') -eq $ConfigurationName })
    if ($matching.Count -eq 0) {
        Invoke-HmlGcloud -Arguments @(
            'config', 'configurations', 'create', $ConfigurationName, '--no-activate'
        ) -Label 'Criacao da configuracao HML sem ativacao'
        Invoke-HmlGcloud -Arguments @('config', 'set', 'account', $Account) -Label 'Conta da configuracao HML'
        Invoke-HmlGcloud -Arguments @('config', 'set', 'project', $ProjectId) -Label 'Projeto da configuracao HML'
    }
    $config = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
        'config', 'configurations', 'describe', $ConfigurationName, '--format=json'
    ) -Label 'Validacao da configuracao HML' -Capture)
    $core = Get-Field (Get-Field $config 'properties') 'core'
    if ((Get-Field $core 'account') -ne $Account -or (Get-Field $core 'project') -ne $ProjectId) {
        throw 'A configuracao nomeada pertence a outra conta/projeto. Use uma configuracao HML separada com os parametros corretos.'
    }
}

function Get-HmlPreflight {
    Initialize-HmlConfiguration
    $accounts = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
        'auth', 'list', '--format=json'
    ) -Label 'Verificacao das contas autenticadas' -Capture)
    if (@($accounts | Where-Object { (Get-Field $_ 'account') -eq $Account }).Count -ne 1) {
        throw "A conta $Account precisa de login no CLI usando --configuration=$ConfigurationName. Este script nao troca contas nem executa login ADC."
    }
    $project = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
        'projects', 'describe', $ProjectId, '--format=json'
    ) -Label 'Leitura do projeto HML' -Capture)
    if ($project.projectId -ne $ProjectId -or $project.lifecycleState -ne 'ACTIVE') {
        throw 'O projeto retornado nao corresponde ao projeto HML ativo solicitado.'
    }
    $billing = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
        'billing', 'projects', 'describe', $ProjectId, '--format=json'
    ) -Label 'Verificacao de faturamento do projeto HML' -Capture)
    if ((Get-Field $billing 'billingEnabled') -ne $true) {
        throw "Faturamento nao habilitado em $ProjectId. Vincule a conta de faturamento antes de Infrastructure/Build; nenhum recurso GCP foi criado por esta execucao."
    }
    return [pscustomobject][ordered]@{
        configuration = $ConfigurationName
        account = $Account
        project_id = $ProjectId
        project_number = [string]$project.projectNumber
        billing_enabled = $true
        region = $Region
        zone = $Zone
        name_prefix = $NamePrefix
    }
}

function Initialize-HmlPrivateDirectory {
    if ($env:OS -ne 'Windows_NT') { throw 'Este script protege arquivos por ACL do Windows. Execute no PowerShell do Windows.' }
    if (-not (Test-Path -LiteralPath $script:PrivateRoot)) {
        $null = New-Item -ItemType Directory -Path $script:PrivateRoot
    }
    $privateDirectory = Get-Item -LiteralPath $script:PrivateRoot -Force
    if ($privateDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'A pasta .private deve ser um diretorio real, sem junction/symlink.'
    }
    $acl = Get-Acl -LiteralPath $script:PrivateRoot
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $acl.SetSecurityDescriptorSddlForm("D:P(A;OICI;FA;;;$sid)(A;OICI;FA;;;SY)", [Security.AccessControl.AccessControlSections]::Access)
    if ($PSVersionTable.PSVersion.Major -le 5) { [IO.Directory]::SetAccessControl($script:PrivateRoot, $acl) }
    else { [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $script:PrivateRoot), $acl) }
}

function Write-HmlPrivateText {
    param([string]$Name, [string]$Text)
    if ([IO.Path]::GetFileName($Name) -ne $Name) { throw 'Nome de arquivo privado invalido.' }
    $path = Join-Path $script:PrivateRoot $Name
    if (Test-Path -LiteralPath $path) {
        if ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Arquivo privado nao pode ser symlink.'
        }
    }
    [IO.File]::WriteAllText($path, $Text, (New-Object Text.UTF8Encoding($false)))
    $fileAcl = Get-Acl -LiteralPath $path
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $fileAcl.SetSecurityDescriptorSddlForm("D:P(A;;FA;;;$sid)(A;;FA;;;SY)", [Security.AccessControl.AccessControlSections]::Access)
    if ($PSVersionTable.PSVersion.Major -le 5) { [IO.File]::SetAccessControl($path, $fileAcl) }
    else { [IO.FileSystemAclExtensions]::SetAccessControl((Get-Item -LiteralPath $path), $fileAcl) }
    return $path
}

function Assert-HmlPlan {
    param($Plan, [string]$ExpectedProject, [string]$ExpectedPrefix, [string]$ExpectedRegion, [string]$ExpectedZone, [string]$ExpectedProjectNumber)
    $variables = Get-Field $Plan 'variables'
    foreach ($expected in @{
        project_id = $ExpectedProject; name_prefix = $ExpectedPrefix
        region = $ExpectedRegion; zone = $ExpectedZone
    }.GetEnumerator()) {
        if ((Get-Field (Get-Field $variables $expected.Key) 'value') -ne $expected.Value) {
            throw "Plano recusado: variavel $($expected.Key) diverge do destino HML solicitado."
        }
    }
    $allowedAddresses = @(
        'google_project_service.apis', 'google_compute_network.hml', 'google_compute_subnetwork.hml',
        'google_compute_firewall.web', 'google_compute_firewall.iap_ssh', 'google_compute_address.hml',
        'google_service_account.vm', 'google_artifact_registry_repository.docker',
        'google_artifact_registry_repository_iam_member.vm_pull', 'google_storage_bucket.uploads',
        'google_storage_bucket.backups', 'google_storage_bucket_iam_member.vm_uploads',
        'google_storage_bucket_iam_member.vm_backup_create', 'google_secret_manager_secret.app',
        'google_secret_manager_secret_iam_member.vm_secrets', 'google_project_iam_custom_role.vm_apis',
        'google_project_iam_custom_role.schedule', 'google_project_iam_member.vm_apis',
        'google_project_iam_member.schedule', 'google_compute_resource_policy.schedule',
        'google_compute_disk.boot', 'google_compute_instance.hml'
    )
    $apis = @(
        'compute.googleapis.com', 'storage.googleapis.com', 'artifactregistry.googleapis.com',
        'secretmanager.googleapis.com', 'iam.googleapis.com', 'serviceusage.googleapis.com',
        'cloudresourcemanager.googleapis.com', 'translate.googleapis.com', 'calendar-json.googleapis.com',
        'apikeys.googleapis.com', 'iap.googleapis.com', 'oslogin.googleapis.com'
    )
    $namedResources = @{
        'google_compute_network.hml' = @('name', "$ExpectedPrefix-vpc")
        'google_compute_subnetwork.hml' = @('name', "$ExpectedPrefix-subnet")
        'google_compute_firewall.web' = @('name', "$ExpectedPrefix-https")
        'google_compute_firewall.iap_ssh' = @('name', "$ExpectedPrefix-iap-ssh")
        'google_compute_address.hml' = @('name', "$ExpectedPrefix-ipv4")
        'google_service_account.vm' = @('account_id', "$ExpectedPrefix-vm")
        'google_artifact_registry_repository.docker' = @('repository_id', "$ExpectedPrefix-docker")
        'google_storage_bucket.uploads' = @('name', "$ExpectedProject-$ExpectedPrefix-uploads")
        'google_storage_bucket.backups' = @('name', "$ExpectedProject-$ExpectedPrefix-backups")
        'google_compute_resource_policy.schedule' = @('name', "$ExpectedPrefix-schedule")
        'google_compute_disk.boot' = @('name', "$ExpectedPrefix-disk")
        'google_compute_instance.hml' = @('name', "$ExpectedPrefix-vm")
        'google_project_iam_custom_role.vm_apis' = @('role_id', "$($ExpectedPrefix.Replace('-', '_'))_translate")
        'google_project_iam_custom_role.schedule' = @('role_id', "$($ExpectedPrefix.Replace('-', '_'))_schedule")
    }
    foreach ($resource in @(Get-Field $Plan 'resource_changes')) {
        if ($null -eq $resource) { continue }
        $actions = @($resource.change.actions)
        if ($actions -contains 'delete') { throw "Plano recusado: exclusao/substituicao de $($resource.address)." }
        if (@($actions | Where-Object { $_ -notin @('create', 'update', 'read', 'no-op') }).Count) {
            throw 'Plano recusado: acao Terraform desconhecida.'
        }
        if ($resource.mode -eq 'data') {
            if ($resource.address -ne 'data.google_project.current') { throw 'Plano recusado: fonte de dados fora do contrato HML.' }
            continue
        }
        $address = $resource.address.Split('[')[0]
        if ($address -notin $allowedAddresses) { throw "Plano recusado: recurso fora do contrato HML ($address)." }
        $after = $resource.change.after
        $resourceProject = Get-Field $after 'project'
        if ($resourceProject -and $resourceProject -ne $ExpectedProject) { throw 'Plano recusado: recurso em outro projeto.' }
        foreach ($location in @('region', 'location', 'zone')) {
            $actual = Get-Field $after $location
            if ($actual -and $actual -ne $(if ($location -eq 'zone') { $ExpectedZone } else { $ExpectedRegion })) {
                throw 'Plano recusado: recurso fora da regiao/zona HML.'
            }
        }
        if ($namedResources.ContainsKey($address)) {
            $identity = $namedResources[$address]
            if ((Get-Field $after $identity[0]) -ne $identity[1]) { throw "Plano recusado: nome fora do prefixo HML ($address)." }
        }
        if ($address -eq 'google_project_service.apis' -and (Get-Field $after 'service') -notin $apis) {
            throw 'Plano recusado: API fora das integracoes previstas.'
        }
        if ($address -eq 'google_secret_manager_secret.app') {
            $secretId = Get-Field $after 'secret_id'
            $secretSuffixes = @(
                'postgres-password', 'database-url', 'runtime-database-url', 'auth-secret', 'encryption-key',
                'cron-secret', 'google-oauth-client-id', 'google-oauth-client-secret',
                'google-calendar-api-key', 'smtp-password', 'hml-basic-auth-hash'
            )
            if ($secretId -notin @($secretSuffixes | ForEach-Object { "$ExpectedPrefix-$_" })) {
                throw 'Plano recusado: cofre fora do prefixo/contrato HML.'
            }
        }
        if ($address -match '_iam_member\.') {
            $expectedFields = @{
                member = "serviceAccount:$ExpectedPrefix-vm@$ExpectedProject.iam.gserviceaccount.com"
            }
            switch ($address) {
                'google_artifact_registry_repository_iam_member.vm_pull' {
                    $expectedFields.role = 'roles/artifactregistry.reader'
                    $expectedFields.repository = "$ExpectedPrefix-docker"
                }
                'google_storage_bucket_iam_member.vm_uploads' {
                    $expectedFields.role = 'roles/storage.objectUser'
                    $expectedFields.bucket = "$ExpectedProject-$ExpectedPrefix-uploads"
                }
                'google_storage_bucket_iam_member.vm_backup_create' {
                    $expectedFields.role = 'roles/storage.objectCreator'
                    $expectedFields.bucket = "$ExpectedProject-$ExpectedPrefix-backups"
                }
                'google_secret_manager_secret_iam_member.vm_secrets' {
                    $expectedFields.role = 'roles/secretmanager.secretAccessor'
                    $secretResource = Get-Field $after 'secret_id'
                    if ($secretResource -and $secretResource -notmatch "^projects/$([regex]::Escape($ExpectedProject))/secrets/$([regex]::Escape($ExpectedPrefix))-" ) {
                        throw 'Plano recusado: IAM em cofre fora da HML.'
                    }
                }
                'google_project_iam_member.vm_apis' {
                    $expectedFields.role = "projects/$ExpectedProject/roles/$($ExpectedPrefix.Replace('-', '_'))_translate"
                }
                'google_project_iam_member.schedule' {
                    if (-not $ExpectedProjectNumber) { throw 'Plano recusado: numero do projeto necessario para validar o agente Compute.' }
                    $expectedFields.member = "serviceAccount:service-$ExpectedProjectNumber@compute-system.iam.gserviceaccount.com"
                    $expectedFields.role = "projects/$ExpectedProject/roles/$($ExpectedPrefix.Replace('-', '_'))_schedule"
                    $conditions = @(Get-Field $after 'condition')
                    $expression = "resource.type == 'compute.googleapis.com/Instance' && resource.name == 'projects/$ExpectedProject/zones/$ExpectedZone/instances/$ExpectedPrefix-vm'"
                    if ($conditions.Count -ne 1 -or (Get-Field $conditions[0] 'expression') -ne $expression) {
                        throw 'Plano recusado: agendamento deve ter permissao somente na VM HML.'
                    }
                }
            }
            foreach ($field in $expectedFields.GetEnumerator()) {
                $actual = Get-Field $after $field.Key
                $unknown = Get-Field (Get-Field $resource.change 'after_unknown') $field.Key
                if (($null -ne $actual -and $actual -ne $field.Value) -or ($null -eq $actual -and $unknown -ne $true)) {
                    throw 'Plano recusado: permissao IAM fora do escopo minimo da HML.'
                }
            }
        }
    }
}

function Get-HmlStateBucket {
    param([string]$BucketName, [string]$ProjectNumber)
    $storageEnabled = Invoke-HmlGcloud -Arguments @(
        'services', 'list', '--enabled', '--filter=config.name=storage.googleapis.com', '--format=value(config.name)'
    ) -Label 'Verificacao da API Storage' -Capture
    if ($storageEnabled.Trim() -ne 'storage.googleapis.com') {
        if (-not $Apply) { throw 'API Storage desativada. Infrastructure -Apply permite habilita-la; sem -Apply nenhum recurso e criado.' }
        Invoke-HmlGcloud -Arguments @('services', 'enable', 'storage.googleapis.com') -Label 'API Storage para o backend'
    }
    $buckets = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
        'storage', 'buckets', 'list', "--filter=name=$BucketName", '--format=json'
    ) -Label 'Verificacao do bucket de estado' -Capture)
    if (@($buckets).Count -eq 0) {
        if (-not $Apply) { throw 'Bucket de estado ausente. Infrastructure -Apply permite seu bootstrap; sem -Apply nenhum recurso e criado.' }
        Invoke-HmlGcloud -Arguments @(
            'storage', 'buckets', 'create', "gs://$BucketName", "--location=$Region",
            '--uniform-bucket-level-access', '--public-access-prevention', '--default-storage-class=STANDARD'
        ) -Label 'Criacao do bucket privado de estado HML'
        Invoke-HmlGcloud -Arguments @(
            'storage', 'buckets', 'update', "gs://$BucketName", '--versioning'
        ) -Label 'Versionamento do estado HML'
    }
    $bucket = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
        'storage', 'buckets', 'describe', "gs://$BucketName", '--raw', '--format=json'
    ) -Label 'Validacao das protecoes do estado HML' -Capture)
    $iam = Get-Field $bucket 'iamConfiguration'
    $ubla = Get-Field $iam 'uniformBucketLevelAccess'
    if (
        [string](Get-Field $bucket 'projectNumber') -ne $ProjectNumber -or
        (Get-Field $bucket 'name') -ne $BucketName -or
        (Get-Field $bucket 'location') -ine $Region -or
        (Get-Field $ubla 'enabled') -ne $true -or
        (Get-Field $iam 'publicAccessPrevention') -ne 'enforced' -or
        (Get-Field (Get-Field $bucket 'versioning') 'enabled') -ne $true
    ) { throw 'Bucket de estado recusado: confirme projeto, Sao Paulo, UBLA, acesso publico impedido e versionamento.' }
}

function Invoke-HmlInfrastructure {
    param($Preflight)
    if ($env:TF_LOG -or $env:TF_LOG_PROVIDER -or $env:TF_LOG_PATH) {
        throw 'Desative os logs de depuracao do Terraform para nao registrar tokens transientes.'
    }
    if (@(Get-ChildItem Env: | Where-Object { $_.Name -like 'TF_CLI_ARGS*' -and $_.Value }).Count) {
        throw 'Remova TF_CLI_ARGS desta sessao: os argumentos Terraform devem ser somente os validados por este script.'
    }
    $script:Terraform = (Get-Command terraform -CommandType Application -ErrorAction Stop).Source
    Initialize-HmlPrivateDirectory
    $stateBucket = "$ProjectId-$NamePrefix-tfstate"
    Get-HmlStateBucket -BucketName $stateBucket -ProjectNumber $Preflight.project_number
    $oldToken = [Environment]::GetEnvironmentVariable('GOOGLE_OAUTH_ACCESS_TOKEN', 'Process')
    $oldDataDirectory = [Environment]::GetEnvironmentVariable('TF_DATA_DIR', 'Process')
    try {
        $env:GOOGLE_OAUTH_ACCESS_TOKEN = (Invoke-HmlGcloud -Arguments @(
            'auth', 'print-access-token'
        ) -Label 'Token transiente para Terraform' -Capture).Trim()
        if (-not $env:GOOGLE_OAUTH_ACCESS_TOKEN) { throw 'CLI nao retornou token para o Terraform.' }
        $env:TF_DATA_DIR = Join-Path $script:PrivateRoot 'terraform-data'
        if ((Test-Path -LiteralPath $env:TF_DATA_DIR) -and
            ((Get-Item -LiteralPath $env:TF_DATA_DIR -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'TF_DATA_DIR privado nao pode ser junction/symlink.'
        }
        $terraformArguments = @("-chdir=$script:TerraformRoot")
        Invoke-CheckedNative -Executable $script:Terraform -Arguments ($terraformArguments + @(
            'init', '-input=false', '-reconfigure', "-backend-config=bucket=$stateBucket"
        )) -Label 'Inicializacao do Terraform HML'
        $planPath = Join-Path $script:PrivateRoot ("hml-$([guid]::NewGuid().ToString('N')).tfplan")
        $planArguments = @('plan', '-input=false', '-lock-timeout=120s', "-out=$planPath")
        if ($TerraformVariablesFile) {
            $variablesPath = (Resolve-Path -LiteralPath $TerraformVariablesFile -ErrorAction Stop).ProviderPath
            $planArguments += "-var-file=$variablesPath"
        }
        # Estes quatro argumentos prevalecem sobre qualquer tfvars informado.
        $planArguments += @(
            "-var=project_id=$ProjectId", "-var=region=$Region", "-var=zone=$Zone", "-var=name_prefix=$NamePrefix"
        )
        Invoke-CheckedNative -Executable $script:Terraform -Arguments ($terraformArguments + $planArguments) -Label 'Plano Terraform HML'
        $planJson = Invoke-CheckedNative -Executable $script:Terraform -Arguments ($terraformArguments + @(
            'show', '-json', $planPath
        )) -Label 'Inspecao do plano Terraform HML' -Capture
        if ($planJson.Contains($env:GOOGLE_OAUTH_ACCESS_TOKEN)) { throw 'Plano recusado: token foi serializado. Nao aplique este plano.' }
        Assert-HmlPlan -Plan (ConvertFrom-Json $planJson) -ExpectedProject $ProjectId -ExpectedPrefix $NamePrefix -ExpectedRegion $Region -ExpectedZone $Zone -ExpectedProjectNumber $Preflight.project_number
        $null = Write-HmlPrivateText -Name 'hml.plan.json' -Text $planJson
        if ($Apply) {
            # Novo token evita expirar durante init/download/plan. Nunca vai a argv/state.
            $env:GOOGLE_OAUTH_ACCESS_TOKEN = (Invoke-HmlGcloud -Arguments @(
                'auth', 'print-access-token'
            ) -Label 'Renovacao transiente do token Terraform' -Capture).Trim()
            Invoke-CheckedNative -Executable $script:Terraform -Arguments ($terraformArguments + @(
                'apply', '-input=false', '-lock-timeout=120s', $planPath
            )) -Label 'Aplicacao do plano HML validado'
            $outputs = Invoke-CheckedNative -Executable $script:Terraform -Arguments ($terraformArguments + @(
                'output', '-json'
            )) -Label 'Saidas da infraestrutura HML' -Capture
            $null = Write-HmlPrivateText -Name 'infrastructure.outputs.json' -Text $outputs
        }
        return [pscustomobject][ordered]@{
            action = 'Infrastructure'; project_id = $ProjectId; applied = [bool]$Apply
            state_bucket = $stateBucket; state_prefix = 'spmnacional/hml'; plan_file = $planPath
        }
    } finally {
        [Environment]::SetEnvironmentVariable('GOOGLE_OAUTH_ACCESS_TOKEN', $oldToken, 'Process')
        [Environment]::SetEnvironmentVariable('TF_DATA_DIR', $oldDataDirectory, 'Process')
    }
}

function Invoke-HmlBuild {
    $docker = (Get-Command docker.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $oldDockerConfig = [Environment]::GetEnvironmentVariable('DOCKER_CONFIG', 'Process')
    $oldDockerHost = [Environment]::GetEnvironmentVariable('DOCKER_HOST', 'Process')
    $oldDockerContext = [Environment]::GetEnvironmentVariable('DOCKER_CONTEXT', 'Process')
    if ($oldDockerContext) {
        # DOCKER_CONTEXT prevalece sobre DOCKER_HOST. Apenas metadata local do
        # contexto pode ser lida antes de aceitar o daemon; nenhuma tag/build.
        $engineEndpoint = (Invoke-CheckedNative -Executable $docker -Arguments @(
            'context', 'inspect', $oldDockerContext, '--format={{.Endpoints.docker.Host}}'
        ) -Label 'Endpoint local do Docker' -Capture).Trim()
    } elseif ($oldDockerHost) {
        $engineEndpoint = $oldDockerHost
    } else {
        $engineEndpoint = (Invoke-CheckedNative -Executable $docker -Arguments @(
            'context', 'inspect', '--format={{.Endpoints.docker.Host}}'
        ) -Label 'Endpoint local do Docker' -Capture).Trim()
    }
    if ($engineEndpoint -notmatch '^npipe:////\./pipe/[A-Za-z0-9._-]+$') {
        throw 'Build HML exige o Docker local do Windows (endpoint named pipe), sem alterar contextos remotos.'
    }
    $dockerPrivate = $null
    try {
        # Fixar o endpoint e remover somente a selecao de contexto deste processo
        # antes de qualquer inspecao da imagem, tag, build ou push.
        $env:DOCKER_HOST = $engineEndpoint
        [Environment]::SetEnvironmentVariable('DOCKER_CONTEXT', $null, 'Process')
        Initialize-HmlPrivateDirectory
        $repositoryId = "$NamePrefix-docker"
        $repository = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
            'artifacts', 'repositories', 'describe', $repositoryId, "--location=$Region", '--format=json'
        ) -Label 'Repositorio Docker da HML' -Capture)
        if ($repository.name -ne "projects/$ProjectId/locations/$Region/repositories/$repositoryId" -or $repository.format -ne 'DOCKER') {
            throw 'Repositorio Docker fora do projeto/regiao/prefixo HML.'
        }
        $registry = "$Region-docker.pkg.dev"
        $repositoryUrl = "$registry/$ProjectId/$repositoryId"
        $tag = $ImageTag
        if (-not $tag) { $tag = "hml-$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))" }
        $appTagged = "$repositoryUrl/$NamePrefix-site`:$tag"
        $migratorTagged = "$repositoryUrl/$NamePrefix-migrate`:$tag"
        $images = @(
            @{ Existing = $AppLocalImage; Target = 'runner'; Tagged = $appTagged },
            @{ Existing = $MigratorLocalImage; Target = 'migrator'; Tagged = $migratorTagged }
        )
        if ($PostgresLocalImage) {
            $images += @{ Existing = $PostgresLocalImage; Target = 'postgres'; Tagged = "$repositoryUrl/spm-hml-postgres`:$tag" }
        }
        # Validar todas as imagens existentes antes da primeira mutacao Docker. Um
        # PostgreSQL incorreto nao pode deixar tags ou uploads parciais da release.
        foreach ($image in $images) {
            if ($image.Existing) {
                $platform = Invoke-CheckedNative -Executable $docker -Arguments @(
                    'image', 'inspect', '--format={{.Os}}/{{.Architecture}}', $image.Existing
                ) -Label "Imagem local $($image.Target)" -Capture
                if ($platform.Trim() -ne 'linux/amd64') { throw 'A VM HML exige imagens linux/amd64.' }
                if ($image.Target -eq 'postgres') {
                    # Template sem aspas internas: o marshalling nativo do PS 5.1
                    # remove aspas Go dentro dos argumentos. Nunca ler Config.Env.
                    $postgresLabels = ConvertFrom-Json (Invoke-CheckedNative -Executable $docker -Arguments @(
                        'image', 'inspect', '--format={{json .Config.Labels}}', $image.Existing
                    ) -Label 'Versao da imagem local PostgreSQL' -Capture)
                    if ((Get-Field $postgresLabels 'org.spmnacional.postgres-version') -cne '18.6') {
                        throw 'A imagem local PostgreSQL deve declarar org.spmnacional.postgres-version=18.6 exatamente.'
                    }
                }
            }
        }
        foreach ($image in $images) {
            if ($image.Existing) {
                Invoke-CheckedNative -Executable $docker -Arguments @('tag', $image.Existing, $image.Tagged) -Label "Tag HML $($image.Target)"
            } else {
                Invoke-CheckedNative -Executable $docker -Arguments @(
                    'build', '--platform=linux/amd64', '--target', $image.Target,
                    '--tag', $image.Tagged, '--file', (Join-Path $script:RepositoryRoot 'Dockerfile'), $script:RepositoryRoot
                ) -Label "Build local da imagem $($image.Target)"
            }
        }
        $dockerPrivate = Join-Path $script:PrivateRoot ("docker-$([guid]::NewGuid().ToString('N'))")
        $null = New-Item -ItemType Directory -Path $dockerPrivate
        $env:DOCKER_CONFIG = $dockerPrivate
        $registryToken = (Invoke-HmlGcloud -Arguments @('auth', 'print-access-token') -Label 'Token transiente do registry' -Capture).Trim()
        if (-not $registryToken) { throw 'CLI nao retornou token para o registry.' }
        $ErrorActionPreference = 'Continue'
        $loginOutput = @($registryToken | & $docker login --username oauth2accesstoken --password-stdin $registry)
        $loginExit = $LASTEXITCODE
        $registryToken = $null
        $ErrorActionPreference = 'Stop'
        if ($loginExit -ne 0) { throw "Login transiente do registry falhou (codigo $loginExit)." }
        foreach ($line in $loginOutput) { Write-Host $line }
        foreach ($image in $images) {
            Invoke-CheckedNative -Executable $docker -Arguments @('push', $image.Tagged) -Label 'Publicacao da imagem HML'
        }
        $digests = @()
        foreach ($image in $images) {
            $details = ConvertFrom-Json (Invoke-HmlGcloud -Arguments @(
                'artifacts', 'docker', 'images', 'describe', $image.Tagged, '--format=json'
            ) -Label 'Digest imutavel da imagem publicada' -Capture)
            $digest = Get-Field (Get-Field $details 'image_summary') 'digest'
            if ($digest -notmatch '^sha256:[a-f0-9]{64}$') { throw 'Registry nao retornou digest SHA256 valido.' }
            $imagePath = $image.Tagged.Substring(0, $image.Tagged.LastIndexOf(':'))
            $digests += "$imagePath@$digest"
        }
        $releaseValues = [ordered]@{
            action = 'Build'; project_id = $ProjectId; region = $Region; name_prefix = $NamePrefix
            artifact_registry_repo = $repositoryUrl; created_at_utc = [DateTime]::UtcNow.ToString('o')
            tag = $tag; APP_IMAGE = $digests[0]; MIGRATOR_IMAGE = $digests[1]
        }
        $releaseEnv = "APP_IMAGE=$($digests[0])`nMIGRATOR_IMAGE=$($digests[1])`n"
        if ($PostgresLocalImage) {
            $releaseValues['POSTGRES_IMAGE'] = $digests[2]
            $releaseEnv += "POSTGRES_IMAGE=$($digests[2])`n"
        }
        $release = [pscustomobject]$releaseValues
        $releaseJson = ConvertTo-Json $release -Depth 10
        $null = Write-HmlPrivateText -Name 'release.json' -Text $releaseJson
        $null = Write-HmlPrivateText -Name 'release.env' -Text $releaseEnv
        return $release
    } finally {
        $registryToken = $null
        [Environment]::SetEnvironmentVariable('DOCKER_CONFIG', $oldDockerConfig, 'Process')
        [Environment]::SetEnvironmentVariable('DOCKER_HOST', $oldDockerHost, 'Process')
        [Environment]::SetEnvironmentVariable('DOCKER_CONTEXT', $oldDockerContext, 'Process')
        # Toda remocao recursiva valida o alvo absoluto dentro da pasta privada.
        if ($dockerPrivate) {
            $resolvedPrivate = [IO.Path]::GetFullPath($script:PrivateRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
            $resolvedDocker = [IO.Path]::GetFullPath($dockerPrivate)
            if (-not $resolvedDocker.StartsWith($resolvedPrivate, [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Diretorio temporario Docker fora da pasta privada; limpeza recusada.'
            }
            if (Test-Path -LiteralPath $resolvedDocker) { Remove-Item -LiteralPath $resolvedDocker -Recurse -Force }
        }
    }
}

try {
    if ($Apply -and $Action -ne 'Infrastructure') { throw '-Apply so e valido com -Action Infrastructure.' }
    $gcloudCommand = Get-Command gcloud.cmd -ErrorAction SilentlyContinue
    if ($null -eq $gcloudCommand) { $gcloudCommand = Get-Command gcloud -ErrorAction Stop }
    $script:Gcloud = $gcloudCommand.Source
    $preflight = Get-HmlPreflight
    $result = switch ($Action) {
        'Preflight' { $preflight }
        'Infrastructure' { Invoke-HmlInfrastructure -Preflight $preflight }
        'Build' { Invoke-HmlBuild }
    }
    ConvertTo-Json $result -Depth 20
} catch {
    Write-Error -Message $_.Exception.Message -ErrorAction Continue
    exit 1
}
