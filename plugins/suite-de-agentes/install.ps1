<#
.SYNOPSIS
Installs Suite de Agentes plugin for OpenCode.
.DESCRIPTION
Copies plugin files to ~/.config/opencode/plugins/suite-de-agentes, installs production dependencies, and registers the server and TUI plugins in OpenCode configuration.
#>
param(
    [switch]$DryRun,
    [switch]$Uninstall,
    [string]$TargetDir = "",
    [string]$ConfigDir = "",
    [switch]$Help
)

if ($Help) {
    Write-Host "Suite de Agentes Installer (v1.1.0)"
    Write-Host "Usage: .\install.ps1 [-DryRun] [-Uninstall] [-TargetDir <path>] [-ConfigDir <path>]"
    exit 0
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeScript = Join-Path $ScriptDir "scripts\installer.mjs"

# Check Node.js prerequisite
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Error "Node.js (>= 24) is required to install Suite de Agentes, but was not found in PATH."
    exit 1
}

$argsList = @($NodeScript)
if ($DryRun) { $argsList += "--dry-run" }
if ($Uninstall) { $argsList += "--uninstall" }
if ($TargetDir) { $argsList += "--target-dir"; $argsList += $TargetDir }
if ($ConfigDir) { $argsList += "--config-dir"; $argsList += $ConfigDir }
$argsList += "--source-dir"
$argsList += $ScriptDir

& node @argsList
exit $LASTEXITCODE
