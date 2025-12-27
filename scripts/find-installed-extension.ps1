param(
	[Parameter(Mandatory = $false)]
	[string]$Uuid,
	[Parameter(Mandatory = $false)]
	[string]$Name
)

$ErrorActionPreference = 'SilentlyContinue'

function Get-UserRoots {
	$roots = @()
	foreach ($p in @($env:APPDATA, $env:LOCALAPPDATA)) {
		if ($p -and (Test-Path $p)) { $roots += $p }
	}
	$docs = [Environment]::GetFolderPath('MyDocuments')
	if ($docs -and (Test-Path $docs)) { $roots += $docs }
	return $roots | Select-Object -Unique
}

function Get-ProgramRoots {
	$roots = @()
	foreach ($p in @('C:\Program Files', 'C:\Program Files (x86)')) {
		if (Test-Path $p) { $roots += $p }
	}
	return $roots
}

function Test-ExtensionJsonMatch([string]$path, [string]$uuid, [string]$name) {
	try {
		$raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
		$obj = $raw | ConvertFrom-Json
		if ($uuid -and ($obj.uuid -eq $uuid)) { return $true }
		if ($name -and ($obj.name -eq $name)) { return $true }
	} catch {
	}
	return $false
}

if (-not $Uuid -and -not $Name) {
	Write-Host 'Usage:'
	Write-Host '  pwsh -NoProfile -File scripts/find-installed-extension.ps1 -Uuid <32hex>'
	Write-Host '  pwsh -NoProfile -File scripts/find-installed-extension.ps1 -Name <ext-name>'
	exit 2
}

Write-Host "Searching installed extensions by $(@{Uuid=$Uuid;Name=$Name} | ConvertTo-Json -Compress)"

$roots = @()
$roots += Get-UserRoots

try {
	# Common default data dir for lceda-pro (user can change it in settings)
	$roots += (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'LCEDA-Pro')
} catch {}

$roots += Get-ProgramRoots
$roots = $roots | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$hits = @()
foreach ($root in $roots) {
	Write-Host ("- scanning: " + $root)
	$extJsons = Get-ChildItem -LiteralPath $root -Recurse -Force -File -Filter extension.json -ErrorAction SilentlyContinue
	foreach ($f in $extJsons) {
		if (Test-ExtensionJsonMatch $f.FullName $Uuid $Name) {
			$hits += $f.FullName
		}
	}
}

if (-not $hits.Count) {
	Write-Host 'No matching installed extension.json found under scanned roots.'
	Write-Host 'Tip: if you changed EDA data directory, re-run with -Name and add that directory to roots in this script.'
	exit 1
}

Write-Host 'Matches:'
$hits | ForEach-Object { Write-Host ('  ' + $_) }

Write-Host 'Candidate extension folders:'
$hits | ForEach-Object { Split-Path -Parent $_ } | Select-Object -Unique | ForEach-Object { Write-Host ('  ' + $_) }

