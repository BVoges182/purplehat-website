$env:Path = "C:\Program Files\nodejs;" + $env:Path
Set-Location $PSScriptRoot
npm.cmd run dev
