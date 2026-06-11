# 时差观赛 Windows App

This folder contains the source for the Windows desktop launcher.

## What it does

- Opens `https://scgs.tv/` in Microsoft Edge app-window mode.
- Loads the local `extension` folder for the Edge app session.
- Falls back to the default browser if Edge is unavailable, with a warning that
  helper features will not be loaded.
- Shows a warning if the user runs the executable without the bundled
  `extension` folder.

The distributable package should keep the launcher and extension together:

```text
时差观赛-Windows/
  时差观赛.exe
  extension/
    manifest.json
    content.js
    style.css
    icons/
```

## Build

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File windows-app\build-windows.ps1
```

This is a lightweight desktop wrapper that starts Edge app-window mode and loads
the local extension for that Edge session. Users do not need to install the
extension manually in the browser extensions page.
