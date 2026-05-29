$log = "D:\medicab\medicabinet3\server_out.txt"
Remove-Item $log -Force -ErrorAction SilentlyContinue
$p = Start-Process -FilePath node -ArgumentList ".\node_modules\tsx\dist\cli.mjs server.ts" -WorkingDirectory "D:\medicab\medicabinet3" -RedirectStandardOutput $log -NoNewWindow -PassThru
Start-Sleep 8
Get-Content $log
Write-Host "READY"
