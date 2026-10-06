# Teste isolado e repetível: PostgreSQL descartável, sem portas, volumes ou .env.
$ErrorActionPreference = 'Stop'
$roleTestName = 'spm-sql-role-test-' + [Guid]::NewGuid().ToString('N').Substring(0, 10)
$roleTestOwnerLabel = 'spm-test-owner=' + $roleTestName

function Invoke-RoleTestSql([string] $Statement, [string] $User = 'spm') {
    docker exec $roleTestName psql -U $User -d spm_test -v ON_ERROR_STOP=1 -c $Statement
    if ($LASTEXITCODE -ne 0) { throw 'Falha na consulta SQL do teste isolado.' }
}

try {
    docker run --detach --name $roleTestName --label $roleTestOwnerLabel `
        --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_USER=spm `
        --env POSTGRES_DB=spm_test postgres:18.6-alpine | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Não foi possível criar o PostgreSQL descartável.' }

    $roleTestReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        docker exec $roleTestName pg_isready -U spm -d spm_test *> $null
        if ($LASTEXITCODE -eq 0) { $roleTestReady = $true; break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $roleTestReady) { throw 'PostgreSQL de teste não iniciou.' }

    Invoke-RoleTestSql 'CREATE TABLE public._prisma_migrations (id text PRIMARY KEY); CREATE TABLE public.example (id serial PRIMARY KEY, title text NOT NULL);'
    Get-Content -Raw (Join-Path $PSScriptRoot 'provision-runtime-role.sql') |
        docker exec -i $roleTestName psql -U spm -d spm_test -v owner_role=spm -v runtime_role=spm_app
    if ($LASTEXITCODE -ne 0) { throw 'Provisionamento SQL falhou.' }
    Get-Content -Raw (Join-Path $PSScriptRoot 'verify-runtime-role.sql') |
        docker exec -i $roleTestName psql -U spm -d spm_test -v runtime_role=spm_app
    if ($LASTEXITCODE -ne 0) { throw 'Verificação de privilégios falhou.' }

    Invoke-RoleTestSql "INSERT INTO example(title) VALUES ('teste'); UPDATE example SET title = 'ok'; SELECT * FROM example; DELETE FROM example;" 'spm_app'
    Invoke-RoleTestSql 'CREATE TABLE future_example (id serial PRIMARY KEY, title text);'
    Invoke-RoleTestSql "INSERT INTO future_example(title) VALUES ('permissão futura');" 'spm_app'

    foreach ($forbiddenSql in @('CREATE TABLE forbidden_table (id int)', "INSERT INTO _prisma_migrations VALUES ('forbidden')", 'TRUNCATE example', 'DROP TABLE example')) {
        docker exec $roleTestName psql -U spm_app -d spm_test -v ON_ERROR_STOP=1 -c $forbiddenSql *> $null
        if ($LASTEXITCODE -eq 0) { throw "Privilégio proibido permitido: $forbiddenSql" }
    }
    Write-Output 'OK: CRUD existente/futuro permitido; DDL, TRUNCATE e alteração de migrações negados.'
} finally {
    # Só remove o contêiner criado por esta execução, após verificar sua etiqueta.
    $actualOwner = docker inspect --format '{{ index .Config.Labels "spm-test-owner" }}' $roleTestName 2>$null
    if ($actualOwner -eq $roleTestName) {
        docker rm --force $roleTestName | Out-Null
    }
}
