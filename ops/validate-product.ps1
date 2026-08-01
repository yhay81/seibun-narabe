[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$WorkerPath = Join-Path $RepoRoot "src\worker.tsx"
$DomainPath = Join-Path $RepoRoot "src\domain\nutrients.ts"
$MigrationPath = Join-Path $RepoRoot "migrations\0001_telemetry.sql"
$AppPath = Join-Path $RepoRoot "public\app.js"
$StylesPath = Join-Path $RepoRoot "public\styles.css"
$FoodsPath = Join-Path $RepoRoot "public\foods.json"
$SourcePath = Join-Path $RepoRoot "SOURCE.md"
$WranglerPath = Join-Path $RepoRoot "wrangler.jsonc"
$PublicDirectory = Join-Path $RepoRoot "public"

$RequiredFiles = @(
    "DECISIONS.md", "EXPERIMENT.md", "LICENSE", "METRICS.md", "PRIVACY.md", "README.md", "SECURITY.md", "SOURCE.md", "STACK.md",
    ".github\workflows\ci.yml", "migrations\0001_telemetry.sql", "ops\product-metrics.ps1", "ops\product-metrics.sql",
    "ops\submit-indexnow.ps1", "public\app.js", "public\favicon.svg", "public\foods.json", "public\manifest.webmanifest", "public\og.svg", "public\robots.txt",
    "src\domain\nutrients.ts", "src\worker.tsx", "test\nutrients.test.ts", "test\surface.test.ts"
)
foreach ($RelativePath in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $RelativePath))) { throw "Missing required release file: $RelativePath" }
}

$Worker = Get-Content -Raw -LiteralPath $WorkerPath
$Domain = Get-Content -Raw -LiteralPath $DomainPath
$Migration = Get-Content -Raw -LiteralPath $MigrationPath
$App = Get-Content -Raw -LiteralPath $AppPath
$Styles = Get-Content -Raw -LiteralPath $StylesPath
$Source = Get-Content -Raw -LiteralPath $SourcePath
$Wrangler = Get-Content -Raw -LiteralPath $WranglerPath
$Foods = Get-Content -Raw -LiteralPath $FoodsPath | ConvertFrom-Json
$ProductSurface = @($Worker, $App) -join "`n"

if (-not $Worker.Contains('class="scale-scene"') -or -not $Worker.Contains('class="nutrition-slip"') -or -not $Worker.Contains('class="comparison-cards"') -or -not $Worker.Contains('class="nutrient-board"') -or -not $App.Contains('card.className = "food-card"') -or -not $App.Contains('card.className = "comparison-card"') -or -not $App.Contains('track.className = "bar-track"')) { throw "Expected the scale, nutrition label, food tray, and comparison-bar visual system" }
if ($ProductSurface -match '(?i)public validation|success criteria|experiment|仮説|成功条件|市場スコア|移行候補|収益性') { throw "Research copy must not appear on the product surface" }
if ($Styles -match '(?i)gradient') { throw "Product CSS must not use gradients" }
if ($Styles -match '(?s)h1\s*\{[^}]*font-size:\s*(?:[4-9]\d|[1-9]\d{2})px') { throw "Primary heading is too large" }
if ($ProductSurface -match '(?i)innerHTML|eval\(|new Function|dangerouslySetInnerHTML') { throw "Food data must not be interpreted as markup or code" }
if (-not $Worker.Contains('app.post("/api/telemetry"') -or $Worker.Contains('app.post("/api/search"') -or -not $App.Contains('fetch("/foods.json"')) { throw "Food search must stay in the browser" }
if ($App -match 'history\.(pushState|replaceState)|location\.search\s*=') { throw "Comparison details must not enter product URLs" }
if ($Migration -match '(?i)food_id|query|search_term|selected_food|gram_value|nutrient_value|email|phone_number|telephone|advertising_id|password') { throw "Food details, contact, advertising, and authentication data do not belong in telemetry storage" }
if (-not $Migration.Contains("CHECK(event_name IN") -or -not $Worker.Contains("35 * 86400")) { throw "Expected allowlisted telemetry and 35-day retention" }
if (-not $Domain.Contains('text === "Tr"') -or -not $Domain.Contains('text === "(Tr)"') -or -not $Domain.Contains("Math.min(2000, Math.max(1")) { throw "Expected preserved special values and bounded amounts" }
if (-not $Source.Contains("文部科学省") -or -not $Source.Contains("令和8年3月27日正誤反映版") -or -not $Source.Contains("政府標準利用規約2.0") -or -not $Source.Contains("加工内容")) { throw "Official source, use terms, corrected date, and transformation are incomplete" }
if (-not $App.Contains('slice(0, 4)') -or -not $App.Contains('selected.length >= 4')) { throw "Expected a four-food local comparison limit" }
if ($ProductSurface -match '(?i)better-auth|betterAuth') { throw "Account authentication is not needed for local comparisons" }
if ($Wrangler.Contains("00000000-0000-0000-0000-000000000000")) { throw "The production D1 database ID has not been configured" }
if ($Foods.source.foodCount -ne 2538 -or $Foods.foods.Count -ne 2538 -or $Foods.nutrients.Count -ne 14 -or @($Foods.groups.PSObject.Properties).Count -ne 18) { throw "Official food dataset dimensions are incorrect" }
if ($Foods.source.sha256 -ne "0d5a77077dd6cd91cbc2e6e317b8b218a38728c409eed452f1c10635a0d3099c") { throw "Official source hash is incorrect" }
if ((Get-Item -LiteralPath (Join-Path $PublicDirectory "foods.json")).Length -gt 700000) { throw "Food dataset exceeds the static delivery budget" }
if ((Get-Item -LiteralPath (Join-Path $PublicDirectory "og.svg")).Length -lt 1500) { throw "Expected a product-specific OG SVG larger than 1.5 KB" }
if ((Get-Item -LiteralPath $AppPath).Length -lt 12000) { throw "Expected a substantial food-comparison client" }

$KeyFiles = @(Get-ChildItem -LiteralPath $PublicDirectory -File | Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" })
if ($KeyFiles.Count -ne 1) { throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)" }
$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) { throw "IndexNow key file name and content do not match" }

Write-Output "Product release contract is satisfied"
