param(
  [string]$LogPath,
  [string]$Code,
  [string]$Detail,
  [string]$Release,
  [string]$Arch,
  [string]$Session,
  [string]$Updated,
  [switch]$NoUi
)

$ErrorActionPreference = 'Stop'
$log = $LogPath
if ([string]::IsNullOrWhiteSpace($log)) {
  $log = Join-Path $env:TEMP 'weprompt-installer-fallback-log.jsonl'
}
$statusPath = Join-Path $env:TEMP 'weprompt-installer-report.json'
$safeCode = if ($Code) { $Code -replace '[^A-Za-z0-9_-]', '_' } else { 'unknown' }
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$localExportPath = Join-Path $env:TEMP ("weprompt-installer-diagnostic-$safeCode-$stamp.txt")

function Write-StatusFile($status) {
  $json = $status | ConvertTo-Json -Compress -Depth 8
  [System.IO.File]::WriteAllText($statusPath, $json, (New-Object System.Text.UTF8Encoding $false))
}

function Write-InstallerLog([string]$event, [hashtable]$properties = @{}) {
  try {
    $payload = [ordered]@{
      schemaVersion = 1
      ts = (Get-Date -Format o)
      session = $Session
      version = $Release
      arch = $Arch
      updated = ($Updated -eq '1' -or $Updated -eq 'true')
      instDir = ''
      event = $event
    }
    foreach ($key in $properties.Keys) {
      $payload[$key] = $properties[$key]
    }
    Add-Content -LiteralPath $log -Encoding UTF8 -Value ($payload | ConvertTo-Json -Compress -Depth 8)
  } catch {
    # The status and export files remain authoritative when the original log is unwritable.
  }
}

function Get-BlockingDiagnostics([string]$detail) {
  if ([string]::IsNullOrWhiteSpace($detail)) {
    return ''
  }

  $marker = 'uninstallerDetail='
  $index = $detail.IndexOf($marker, [System.StringComparison]::Ordinal)
  if ($index -ge 0) {
    return $detail.Substring($index + $marker.Length).Trim()
  }

  return $detail.Trim()
}

function Get-LatestInstallerFailureContext {
  $context = [ordered]@{
    failedPath = ''
    outerInstallerPid = $null
  }
  try {
    if (-not (Test-Path -LiteralPath $log)) {
      return $context
    }
    $events = @(
      Get-Content -LiteralPath $log -ErrorAction SilentlyContinue |
        ForEach-Object {
          try {
            $_ | ConvertFrom-Json
          } catch {
            $null
          }
        } |
        Where-Object { $_ }
    )
    $failure = @($events | Where-Object { $_.event -eq 'failure' } | Select-Object -Last 1)[0]
    $lockers = @($events | Where-Object { $_.event -eq 'rm-lockers' } | Select-Object -Last 1)[0]
    if ($failure -and $failure.failedPath) {
      $context.failedPath = [string]$failure.failedPath
    } elseif ($lockers -and $lockers.target) {
      $context.failedPath = [string]$lockers.target
    }
    if ($lockers -and $null -ne $lockers.outerInstallerPid) {
      $context.outerInstallerPid = [int]$lockers.outerInstallerPid
    }
  } catch {
    Write-InstallerLog 'diagnostics-context-read-failed' @{ error = $_.Exception.Message }
  }
  return $context
}

function Get-OptionalHandleDiagnostics {
  $diagnostics = [ordered]@{
    available = $false
    used = $false
    reason = 'handle-not-found'
    command = ''
    target = ''
    pid = $null
    timedOut = $false
    exitCode = $null
    output = ''
    error = ''
  }

  $command = @(Get-Command handle.exe -ErrorAction SilentlyContinue | Select-Object -First 1)[0]
  if (-not $command) {
    return $diagnostics
  }

  $diagnostics.available = $true
  $diagnostics.command = [string]$command.Source
  $context = Get-LatestInstallerFailureContext
  $target = [string]$context.failedPath
  if ([string]::IsNullOrWhiteSpace($target)) {
    $diagnostics.reason = 'no-failed-path'
    return $diagnostics
  }

  $diagnostics.target = $target
  $processId = $context.outerInstallerPid
  $stdoutPath = Join-Path $env:TEMP ('weprompt-handle-' + [guid]::NewGuid().ToString('N') + '.out')
  $stderrPath = Join-Path $env:TEMP ('weprompt-handle-' + [guid]::NewGuid().ToString('N') + '.err')

  try {
    $arguments = @('-accepteula', '-nobanner')
    if ($null -ne $processId -and $processId -gt 0) {
      $diagnostics.pid = [int]$processId
      $arguments += @('-p', [string]$processId)
    }
    $arguments += $target
    $diagnostics.used = $true
    $diagnostics.reason = ''
    $process = Start-Process `
      -FilePath $command.Source `
      -ArgumentList $arguments `
      -WindowStyle Hidden `
      -PassThru `
      -RedirectStandardOutput $stdoutPath `
      -RedirectStandardError $stderrPath
    if (-not $process.WaitForExit(3000)) {
      $diagnostics.timedOut = $true
      $diagnostics.reason = 'timeout'
      try {
        $process.Kill()
      } catch {
      }
    } else {
      $diagnostics.exitCode = $process.ExitCode
    }
    $stdout = if (Test-Path -LiteralPath $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
    $output = (($stdout + [Environment]::NewLine + $stderr) -replace '[\x00-\x1F]', ' ').Trim()
    if ($output.Length -gt 4000) {
      $output = $output.Substring(0, 4000)
    }
    $diagnostics.output = $output
  } catch {
    $diagnostics.reason = 'failed'
    $diagnostics.error = $_.Exception.GetType().FullName + ': ' + $_.Exception.Message
  } finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }

  return $diagnostics
}

function Get-WrapperCode([string]$detail) {
  if (-not [string]::IsNullOrWhiteSpace($detail) -and $detail -match '(^|\s)wrapperCode=(E[0-9]+)') {
    return $Matches[2]
  }
  return ''
}

function New-DiagnosticText(
  [string]$code,
  [string]$wrapperCode,
  [string]$blockingDiagnostics,
  $handleDiagnostics
) {
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add('--------------------------------')
  $lines.Add('WePrompt installer failure ' + $code)
  $lines.Add('--------------------------------')
  $lines.Add('Release: ' + $Release)
  $lines.Add('Architecture: ' + $Arch)
  $lines.Add('Session: ' + $Session)
  if ($wrapperCode) {
    $lines.Add('Wrapper code: ' + $wrapperCode)
  }
  $lines.Add('Installer log: ' + $log)
  $lines.Add('')
  if ($blockingDiagnostics) {
    $lines.Add('Diagnostics:')
    foreach ($line in ($blockingDiagnostics -split "\r?\n")) {
      if ($line.Trim()) {
        $lines.Add($line.Trim())
      }
    }
    $lines.Add('')
  }
  $lines.Add('Local process-lock diagnostics:')
  $lines.Add(($handleDiagnostics | ConvertTo-Json -Depth 5))
  return ($lines -join [Environment]::NewLine)
}

try {
  $wrapperCode = Get-WrapperCode $Detail
  $blockingDiagnostics = Get-BlockingDiagnostics $Detail
  $handleDiagnostics = Get-OptionalHandleDiagnostics
  $copyText = New-DiagnosticText $Code $wrapperCode $blockingDiagnostics $handleDiagnostics
  [System.IO.File]::WriteAllText($localExportPath, $copyText, (New-Object System.Text.UTF8Encoding $false))

  Write-StatusFile ([ordered]@{
    status = 'exported'
    code = $Code
    wrapperCode = $wrapperCode
    session = $Session
    release = $Release
    logPath = $log
    localExportPath = $localExportPath
    blockingDiagnostics = $blockingDiagnostics
    handleDiagnostics = $handleDiagnostics
    copyText = $copyText
    at = (Get-Date -Format o)
  })
  Write-InstallerLog 'diagnostics-exported' @{
    code = $Code
    wrapperCode = $wrapperCode
    statusPath = $statusPath
    localExportPath = $localExportPath
  }

  if (-not $NoUi) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      ('WePrompt saved local installer diagnostics:' + [Environment]::NewLine + $localExportPath),
      'WePrompt installer diagnostics',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null
  }
  exit 0
} catch {
  $errorText = $_.Exception.GetType().FullName + ': ' + $_.Exception.Message
  try {
    Write-StatusFile ([ordered]@{
      status = 'failed'
      code = $Code
      session = $Session
      release = $Release
      logPath = $log
      localExportPath = $localExportPath
      error = $errorText
      at = (Get-Date -Format o)
    })
  } catch {
  }
  Write-InstallerLog 'diagnostics-export-failed' @{ code = $Code; error = $errorText }
  exit 1
}
