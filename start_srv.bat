@echo off
cd /d D:\medicab\medicabinet3
if exist server_out.txt del server_out.txt
start /B node .\node_modules\tsx\dist\cli.mjs server.ts > server_out.txt 2>&1
ping -n 8 127.0.0.1 > nul
type server_out.txt
