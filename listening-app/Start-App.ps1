$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$pythonExe = Join-Path $env:USERPROFILE '.pyenv/pyenv-win/versions/3.11.9/python.exe'
if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = 'python' }
try {
    $running = Invoke-RestMethod 'http://127.0.0.1:8765/api/health' -TimeoutSec 2
    if ($running.ok) { Start-Process 'http://127.0.0.1:8765'; exit }
} catch { }
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'dist/index.html'))) {
    npm.cmd install --cache .npm-cache --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
}
& $pythonExe -c 'import fastapi, uvicorn, youtube_transcript_api, requests'
if ($LASTEXITCODE -ne 0) {
    & $pythonExe -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed' }
}
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'data/audio/p01.wav'))) {
    & (Join-Path $PSScriptRoot 'scripts/make-audio.ps1')
}
$logDir = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Start-Process -FilePath $pythonExe -ArgumentList '-m uvicorn backend.server:app --host 127.0.0.1 --port 8765' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
for ($i=0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try { $health = Invoke-RestMethod 'http://127.0.0.1:8765/api/health' -TimeoutSec 1; if ($health.ok) { Start-Process 'http://127.0.0.1:8765'; exit } } catch { }
}
throw 'Server did not start. Check data/server-error.log.'
