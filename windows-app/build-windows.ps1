$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$appName = -join ([char[]](0x65F6, 0x5DEE, 0x89C2, 0x8D5B))
$readmeName = (-join ([char[]](0x4F7F, 0x7528, 0x8BF4, 0x660E))) + ".txt"
$distDir = Join-Path $repoRoot ("dist\" + $appName + "-Windows")
$sourceFile = Join-Path $PSScriptRoot "NoSpoilWorldCupLauncher.cs"
$iconPng = Join-Path $repoRoot "website\assets\iconblu.png"
$iconDir = Join-Path $PSScriptRoot "assets"
$iconIco = Join-Path $iconDir "app.ico"
$exePath = Join-Path $distDir ($appName + ".exe")
$zipPath = Join-Path $repoRoot ("dist\" + $appName + "-Windows.zip")
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeIcon
{
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool DestroyIcon(IntPtr hIcon);
}
"@

$bitmap = New-Object System.Drawing.Bitmap($iconPng)
try {
    $hIcon = $bitmap.GetHicon()
    try {
        $icon = [System.Drawing.Icon]::FromHandle($hIcon)
        try {
            $stream = [System.IO.File]::Create($iconIco)
            try {
                $icon.Save($stream)
            } finally {
                $stream.Dispose()
            }
        } finally {
            $icon.Dispose()
        }
    } finally {
        [NativeIcon]::DestroyIcon($hIcon) | Out-Null
    }
} finally {
    $bitmap.Dispose()
}

& $cscPath `
    /nologo `
    /target:winexe `
    /platform:anycpu `
    /reference:System.Windows.Forms.dll `
    /win32icon:$iconIco `
    /out:$exePath `
    $sourceFile

New-Item -ItemType Directory -Force -Path (Join-Path $distDir "extension") | Out-Null
$extensionDistDir = Join-Path $distDir "extension"
Remove-Item -LiteralPath $extensionDistDir -Recurse -Force
New-Item -ItemType Directory -Force -Path $extensionDistDir | Out-Null
Get-ChildItem -Path (Join-Path $repoRoot "extension") -Force |
    Where-Object {
        $_.Name -notin @("firefox", "build-crx.js", "nospoil-key.pem", "nospoil-key.pub", "README.md")
    } |
    ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $extensionDistDir -Recurse -Force
    }
Copy-Item -Path (Join-Path $PSScriptRoot "PACKAGE_README.txt") -Destination (Join-Path $distDir $readmeName) -Force

Compress-Archive -Path (Join-Path $distDir "*") -DestinationPath $zipPath -Force

Get-Item $exePath, $zipPath | Select-Object FullName, Length, LastWriteTime
