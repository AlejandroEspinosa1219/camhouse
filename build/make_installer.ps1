$ErrorActionPreference = 'Stop'
$root = 'c:\Users\aespi\Automatizaciones\camhouse'
$staging = Join-Path $env:TEMP 'camhouse_pkg_v120'
$payloadZip = Join-Path $root 'build\payload.zip'
$installerExe = Join-Path $root 'CamHouse_Instalador.exe'
$installerZip = Join-Path $root 'CamHouse_Instalador.zip'

Write-Host 'Cleaning old build artifacts...'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
if (Test-Path $payloadZip) { Remove-Item $payloadZip -Force }
if (Test-Path $installerExe) { Remove-Item $installerExe -Force }
if (Test-Path $installerZip) { Remove-Item $installerZip -Force }

Write-Host 'Staging files...'
New-Item -ItemType Directory -Path $staging | Out-Null
New-Item -ItemType Directory -Path (Join-Path $staging 'data') | Out-Null

Copy-Item (Join-Path $root 'src') (Join-Path $staging 'src') -Recurse -Force
Copy-Item (Join-Path $root 'public') (Join-Path $staging 'public') -Recurse -Force
Copy-Item (Join-Path $root 'runtime') (Join-Path $staging 'runtime') -Recurse -Force
Copy-Item (Join-Path $root 'node_modules') (Join-Path $staging 'node_modules') -Recurse -Force
Copy-Item (Join-Path $root 'data\knowledge_base.json') (Join-Path $staging 'data\knowledge_base.json') -Force
Copy-Item (Join-Path $root 'package.json') $staging -Force
Copy-Item (Join-Path $root 'package-lock.json') $staging -Force
Copy-Item (Join-Path $root '.env') $staging -Force
Copy-Item (Join-Path $root 'camhouse.ico') $staging -Force
Copy-Item (Join-Path $root 'CamHouse.exe') $staging -Force
Copy-Item (Join-Path $root 'version.json') $staging -Force
if (Test-Path (Join-Path $root 'Iniciar_CamHouse.bat')) { Copy-Item (Join-Path $root 'Iniciar_CamHouse.bat') $staging -Force }
if (Test-Path (Join-Path $root 'Crear_Acceso_Directo.vbs')) { Copy-Item (Join-Path $root 'Crear_Acceso_Directo.vbs') $staging -Force }

Write-Host 'Creating payload.zip...'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($staging, $payloadZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Write-Host 'Compiling CamHouse_Instalador.exe with C# csc.exe...'
$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$iconPath = Join-Path $root 'camhouse.ico'
$installerCs = Join-Path $root 'build\Installer.cs'
& $csc /nologo /target:winexe "/out:$installerExe" "/win32icon:$iconPath" "/resource:$payloadZip,payload.zip" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.dll "$installerCs"

Write-Host 'Packaging CamHouse_Instalador.zip...'
$tempZipStage = Join-Path $env:TEMP 'camhouse_inst_zip'
if (Test-Path $tempZipStage) { Remove-Item $tempZipStage -Recurse -Force }
New-Item -ItemType Directory -Path $tempZipStage | Out-Null
Copy-Item $installerExe $tempZipStage -Force
[System.IO.Compression.ZipFile]::CreateFromDirectory($tempZipStage, $installerZip, [System.IO.Compression.CompressionLevel]::Optimal, $false)

Remove-Item $staging -Recurse -Force
Remove-Item $tempZipStage -Recurse -Force
Remove-Item $payloadZip -Force

Get-Item $installerExe, $installerZip | Select-Object Name, Length, LastWriteTime
