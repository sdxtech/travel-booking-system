param([switch]$Clear)

$ErrorActionPreference = 'Stop'
if ($Clear) {
    foreach ($variableName in @('TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET')) {
        [Environment]::SetEnvironmentVariable($variableName, $null, 'User')
        Remove-Item "Env:$variableName" -ErrorAction SilentlyContinue
    }
    Write-Host 'Telegram development secrets removed. Restart the backend.'
    exit 0
}

$secureToken = Read-Host 'Paste the BookingDriverBot token from BotFather' -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
try {
    $botToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}
if ($botToken -notmatch '^\d+:[A-Za-z0-9_-]+$') { throw 'Invalid Telegram bot token format.' }
$webhookSecret = [Environment]::GetEnvironmentVariable('TELEGRAM_WEBHOOK_SECRET', 'User')
if ($webhookSecret -notmatch '^[A-Za-z0-9_-]{32,256}$') {
    $secretBytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($secretBytes) } finally { $random.Dispose() }
    $webhookSecret = [BitConverter]::ToString($secretBytes).Replace('-', '').ToLowerInvariant()
}
[Environment]::SetEnvironmentVariable('TELEGRAM_BOT_TOKEN', $botToken, 'User')
[Environment]::SetEnvironmentVariable('TELEGRAM_WEBHOOK_SECRET', $webhookSecret, 'User')
$env:TELEGRAM_BOT_TOKEN = $botToken
$env:TELEGRAM_WEBHOOK_SECRET = $webhookSecret
Write-Host 'Telegram secrets saved outside the repository. Open a new terminal and restart the backend.'
Write-Host 'Next, register the public HTTPS backend webhook using backend/setup_telegram_webhook.py.'
