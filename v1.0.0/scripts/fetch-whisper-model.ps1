# 拉取 whisper 模型 ggml-small-q5_1.bin（HF 镜像），按 sha256 校验，幂等
$ErrorActionPreference = 'Stop'
$modelName = 'ggml-small-q5_1.bin'
$url = "https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/$modelName"
$sha = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb'
$target = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\resources\whisper'))
$dest = Join-Path $target $modelName

function Test-Model($file) {
  if (-not (Test-Path -LiteralPath $file)) { return $false }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLower() -eq $sha
}

if (Test-Model $dest) {
  Write-Host "[whisper] 模型已就绪，跳过: $dest"
  exit 0
}

New-Item -ItemType Directory -Force -Path $target | Out-Null
$tmp = "$dest.download"
Write-Host "[whisper] 下载 $url"
& curl.exe -L --fail --retry 3 -o $tmp $url
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  throw "whisper 模型下载失败（可设 http_proxy/https_proxy 后重试）: $url"
}

if (-not (Test-Model $tmp)) {
  Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  throw "whisper 模型校验失败: $dest"
}

Move-Item -LiteralPath $tmp -Destination $dest -Force
Write-Host "[whisper] 完成: $dest"
