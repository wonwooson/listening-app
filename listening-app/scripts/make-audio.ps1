$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$pythonExe = Join-Path $env:USERPROFILE '.pyenv/pyenv-win/versions/3.11.9/python.exe'
if (!(Test-Path -LiteralPath $pythonExe)) { $pythonExe = 'python' }
Push-Location $appRoot
try {
    $items = (& $pythonExe -c "import json; from backend.content import EXERCISES; print(json.dumps(EXERCISES))") | ConvertFrom-Json
    $audioDir = Join-Path $appRoot 'data/audio'
    New-Item -ItemType Directory -Path $audioDir -Force | Out-Null
    Add-Type -AssemblyName System.Speech
    $speaker = [System.Speech.Synthesis.SpeechSynthesizer]::new()
    $voice = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
    if (!$voice) { throw 'English voice is not installed.' }
    $speaker.SelectVoice($voice.VoiceInfo.Name)
    foreach ($item in $items) {
        $audioPath = Join-Path $audioDir ($item.id + '.wav')
        if (!(Test-Path -LiteralPath $audioPath)) {
            $speaker.SetOutputToWaveFile($audioPath)
            $speaker.Speak($item.text)
            $speaker.SetOutputToNull()
        }
    }
    $speaker.Dispose()
    Write-Output ('Prepared ' + $items.Count + ' practice audio files.')
} finally { Pop-Location }
