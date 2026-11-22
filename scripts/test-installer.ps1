# Installs and uninstalls the real installer on a disposable CI machine.
# It changes the current user's system (Run key, shortcuts), so it refuses to run elsewhere.
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'This test is meant for GitHub Actions only.' }

$setup = Join-Path $PSScriptRoot '..\release\SnowyEvening-Setup.exe'
$folder = Join-Path $env:LOCALAPPDATA 'Programs\snowy-evening'
$app = Join-Path $folder 'Snowy Evening.exe'
$cache = Join-Path $env:LOCALAPPDATA 'snowy-evening-updater'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$shortcuts = @('Desktop', 'Programs') | ForEach-Object {
  Join-Path ([Environment]::GetFolderPath($_)) 'Snowy Evening.lnk'
}

function Assert-True([bool] $value, [string] $message) {
  if (-not $value) { throw "FAILED: $message" }
  Write-Host "ok: $message"
}

function Invoke-Program([string] $file, [string[]] $arguments) {
  $process = Start-Process -FilePath $file -ArgumentList $arguments -PassThru
  if (-not $process.WaitForExit(180000)) { $process.Kill(); throw "$file timed out" }
  Assert-True ($process.ExitCode -eq 0) "$(Split-Path $file -Leaf) exits with 0"
}

Invoke-Program $setup @('/S')
Assert-True (Test-Path $app) 'the app is installed'
foreach ($shortcut in $shortcuts) { Assert-True (Test-Path $shortcut) "shortcut $shortcut" }
Assert-True (-not (Test-Path $cache)) 'no copy of the installer is left behind'
Invoke-Program $app @('--quit')

if (-not (Test-Path $runKey)) { New-Item -Path $runKey -Force | Out-Null }
Set-ItemProperty -Path $runKey -Name SnowyEvening -Value "`"$app`" --autostart"

Invoke-Program (Join-Path $folder 'Uninstall Snowy Evening.exe') @('/currentuser', '/S')
# The uninstaller continues from a temporary copy after the first process exits.
$watch = [Diagnostics.Stopwatch]::StartNew()
do {
  Start-Sleep -Seconds 1
  $left = @(@($folder) + $shortcuts | Where-Object { Test-Path $_ })
  $autostart = (Get-ItemProperty -Path $runKey).PSObject.Properties.Name -contains 'SnowyEvening'
} while (($left.Count -or $autostart) -and $watch.Elapsed.TotalSeconds -lt 60)

Assert-True ($left.Count -eq 0) "files and shortcuts are removed $left"
Assert-True (-not $autostart) 'the autostart entry is removed'
