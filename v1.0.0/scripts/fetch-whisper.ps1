# 拉取 whisper.cpp 官方 v1.9.2 预编译 exe（含全套 DLL），幂等：exe 已存在则跳过
$ErrorActionPreference = 'Stop'
$zipUrl = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip'
$zipSha = '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a'
$target = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\resources\whisper'))
$exe = Join-Path $target 'whisper-cli.exe'

if (Test-Path -LiteralPath $exe) {
  Write-Host "[whisper] 已存在，跳过: $exe"
  exit 0
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'whisper-bin-x64.zip'
Write-Host "[whisper] 下载 $zipUrl"
& curl.exe -L --fail --retry 3 -o $tmp $zipUrl
if ($LASTEXITCODE -ne 0) { throw "whisper exe 下载失败（可设 http_proxy/https_proxy 后重试）: $zipUrl" }

$sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $tmp).Hash.ToLower()
if ($sha -ne $zipSha) { throw "whisper exe zip 校验失败: $sha != $zipSha" }

Expand-Archive -LiteralPath $tmp -DestinationPath $target -Force
Remove-Item -LiteralPath $tmp -Force

if (-not (Test-Path -LiteralPath $exe)) { throw "解压后未找到 $exe" }
Write-Host "[whisper] 完成: $exe"
