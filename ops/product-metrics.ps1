[CmdletBinding()]
param([switch]$Local)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$SqlPath = Join-Path $PSScriptRoot "product-metrics.sql"
$Wrangler = Join-Path $RepoRoot "node_modules\.bin\wrangler.cmd"
$Target = if ($Local) { "--local" } else { "--remote" }
$Sql = (Get-Content $SqlPath) -join " "

$Output = & $Wrangler d1 execute seibun-narabe $Target --json --command $Sql
if ($LASTEXITCODE -ne 0) { throw "D1 metrics query failed with exit code $LASTEXITCODE" }
$Payload = ($Output -join [Environment]::NewLine) | ConvertFrom-Json
$Row = $Payload[0].results[0]
if (-not $Row) { throw "D1 metrics query returned no result" }

function Get-Percent {
    param([int]$Numerator, [int]$Denominator)
    if ($Denominator -eq 0) { return $null }
    return [Math]::Round(($Numerator / $Denominator) * 100, 1)
}

$Users = [int]$Row.users
[ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    service = "seibun-narabe"
    environment = if ($Local) { "local" } else { "production" }
    funnel = [ordered]@{
        users = $Users
        searchers = [int]$Row.searchers
        comparers = [int]$Row.comparers
        amount_changers = [int]$Row.amount_changers
        copiers = [int]$Row.copiers
        savers = [int]$Row.savers
        returned = [int]$Row.returned
        comparers_7d = [int]$Row.comparers_7d
        copiers_7d = [int]$Row.copiers_7d
        qa_rows = [int]$Row.qa_rows
    }
    rates = [ordered]@{
        search_percent = Get-Percent ([int]$Row.searchers) $Users
        comparison_percent = Get-Percent ([int]$Row.comparers) $Users
        amount_change_percent = Get-Percent ([int]$Row.amount_changers) $Users
        copy_percent = Get-Percent ([int]$Row.copiers) $Users
        return_percent = Get-Percent ([int]$Row.returned) $Users
    }
} | ConvertTo-Json -Depth 4
