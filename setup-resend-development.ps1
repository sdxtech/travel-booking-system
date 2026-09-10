param(
    [switch]$Clear
)

$ErrorActionPreference = 'Stop'
$variableName = 'RESEND_API_KEY'

if ($Clear) {
    [Environment]::SetEnvironmentVariable($variableName, $null, 'User')
    Remove-Item "Env:$variableName" -ErrorAction SilentlyContinue
    Write-Host 'Resend development API key removed from the Windows user environment.'
    exit 0
}

$secureKey = Read-Host 'Paste the new Resend development API key' -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)

try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}

if (-not $apiKey.StartsWith('re_') -or $apiKey.Length -lt 10) {
    throw 'Invalid Resend API key. The key must start with re_.'
}

[Environment]::SetEnvironmentVariable($variableName, $apiKey, 'User')
Set-Item "Env:$variableName" $apiKey

Write-Host 'Resend development API key saved outside the repository.'
Write-Host 'Close this terminal and open a new one so the key is loaded automatically.'
Write-Host 'Then, for Docker, run: docker compose --env-file .env.development up -d --build backend'
