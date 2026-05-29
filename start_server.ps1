$log = "D:\medicab\medicabinet3\server.log"
$workDir = "D:\medicab\medicabinet3"
$proc = Start-Process -NoNewWindow -FilePath "node" -ArgumentList ".\node_modules\tsx\dist\cli.mjs server.ts" -WorkingDirectory $workDir -RedirectStandardOutput $log -PassThru
$proc.Id | Out-File -FilePath "D:\medicab\medicabinet3\server_pid.txt"
Write-Host "Server PID: $($proc.Id)"
