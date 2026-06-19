/**
 * deploy.js - 增量部署 website/ 发布文件到服务器
 *
 * 用法：
 *   node website/deploy.js
 *   node website/deploy.js --apk
 *   node website/deploy.js --force
 *   node website/deploy.js index.html styles.css
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const publicDir = path.join(__dirname, 'public');
const publicApkFile = path.join(publicDir, '时差观赛.apk');
const extensionDir = path.join(repoRoot, 'extension');
const firefoxExtensionDir = path.join(extensionDir, 'firefox');
const deployTempDir = path.join(repoRoot, '.tmp', 'deploy-build');
const deployStateFile = path.join(__dirname, '.deploy-state.json');

// SSH 密钥路径（Windows 格式），用于 rsync 通过 WSL 连接
const sshKeyWin = path.join(require('os').homedir(), '.ssh', 'id_ed25519');
const sshKeyWsl = '/home/bond/.ssh/id_ed25519';

// 检测可用的 WSL 发行版（需要能访问 /mnt/c/ 的发行版）
function detectWslDistro() {
  try {
    const distros = ['Ubuntu', 'Ubuntu-22.04', 'Debian'];
    for (const d of distros) {
      try {
        execSync(`wsl -d ${d} ls /mnt/c/ >nul 2>&1`, { stdio: 'ignore' });
        return d;
      } catch (_) { /* 继续尝试下一个 */ }
    }
  } catch (_) { /* fallback */ }
  return ''; // 回退到默认 wsl
}
const WSL_DISTRO = detectWslDistro();
const WSL_CMD = WSL_DISTRO ? `wsl -d ${WSL_DISTRO}` : 'wsl';
let localRsyncChecked = false;

function toWslPath(winPath) {
  let result = winPath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(result)) {
    result = '/mnt/' + result[0].toLowerCase() + result.slice(2);
  }
  return result;
}
const chromiumZipFile = path.join(publicDir, 'scgs-tv-extension-chromium.zip');
const firefoxZipFile = path.join(publicDir, 'scgs-tv-extension-firefox.zip');
const crxFile = path.join(publicDir, 'scgs-tv-extension.crx');
const updatesXmlFile = path.join(publicDir, 'updates.xml');
const chromiumAliasFiles = [
  path.join(publicDir, 'scgs-tv-extension.zip'),
  path.join(publicDir, 'nospoil-worldcup-extension.zip')
];

const EXTENSION_ALIAS_TARGETS = [
  'public/scgs-tv-extension-chromium.zip',
  'public/scgs-tv-extension-firefox.zip',
  'public/scgs-tv-extension.zip',
  'public/nospoil-worldcup-extension.zip',
  'public/scgs-tv-extension.crx',
  'public/updates.xml'
];
const APK_TARGET = 'public/时差观赛.apk';
const DEFAULT_EXCLUDED_NAMES = new Set([
  '.env',
  '.deploy-state.json',
  'README.md',
  'admin-server.js',
  'baidu-submit.js',
  'auto-update.js',
  'fetch-replay-links.js',
  'deploy.js'
]);
const DEFAULT_EXCLUDED_DIRS = new Set(['src']);
const DEFAULT_EXCLUDED_PATHS = new Set([
  'data/matches.example.json',
  'public/plugin-download-placeholder.md'
]);

// 加载 .env
const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
  fs.readFileSync(dotenvPath, 'utf8').split('\n').forEach((line) => {
    const [k, ...v] = line.split('=');
    if (k && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
}

const host = process.env.RSYNC_HOST;
const user = process.env.RSYNC_USER || 'root';
const target = process.env.RSYNC_PATH;
const port = process.env.RSYNC_PORT || '22';

if (!host || !target) {
  console.error('请在 website/.env 中配置 RSYNC_HOST 和 RSYNC_PATH');
  process.exit(1);
}

const userHost = `${user}@${host}`;
const rawArgs = process.argv.slice(2);
const apkOnlyMode = rawArgs.includes('--apk');
const forceUploadMode = rawArgs.includes('--force');
const fileArgs = rawArgs.filter((arg) => arg !== '--apk' && arg !== '--force');

function loadDeployState() {
  if (!fs.existsSync(deployStateFile)) {
    return {
      deployed: {},
      sources: {}
    };
  }

  try {
    return JSON.parse(fs.readFileSync(deployStateFile, 'utf8'));
  } catch (err) {
    return {
      deployed: {},
      sources: {}
    };
  }
}

function saveDeployState(state) {
  fs.writeFileSync(deployStateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function fileHash(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function directoryFingerprint(dirPath, options = {}) {
  const excludeNames = new Set(options.excludeNames || []);
  const files = [];

  function walk(currentDir) {
    fs.readdirSync(currentDir, { withFileTypes: true }).forEach((entry) => {
      if (excludeNames.has(entry.name)) return;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        return;
      }

      const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
      files.push(`${relPath}:${fileHash(fullPath)}`);
    });
  }

  walk(dirPath);
  return crypto.createHash('sha256').update(files.sort().join('\n')).digest('hex');
}

function collectFilesRecursively(dir, predicate, results) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(dirExists(fullPath) ? fullPath : dir, predicate, results);
      return;
    }

    if (predicate(fullPath, entry.name)) {
      results.push(fullPath);
    }
  });
}

function dirExists(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function findLatestBuiltApk() {
  const searchRoots = [
    path.join(repoRoot, 'android-probe', 'app', 'build', 'outputs', 'apk', 'release'),
    path.join(repoRoot, 'android-probe', 'app', 'build', 'outputs', 'apk', 'debug')
  ];
  const apkFiles = [];

  searchRoots.forEach((root) => {
    if (!dirExists(root)) return;
    collectFilesRecursively(
      root,
      (fullPath, name) => name.endsWith('.apk') && !/androidTest/i.test(fullPath),
      apkFiles
    );
  });

  if (apkFiles.length === 0) return null;

  apkFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return apkFiles[0];
}

function syncLatestApkToPublic(state) {
  const latestApk = findLatestBuiltApk();
  if (!latestApk) {
    throw new Error('未找到 android-probe 构建产物中的 APK，请先打包安卓应用');
  }

  const sourceHash = fileHash(latestApk);
  const previousHash = state.sources.apkSourceHash || '';
  const publicHash = fs.existsSync(publicApkFile) ? fileHash(publicApkFile) : '';
  const changed = sourceHash !== previousHash || sourceHash !== publicHash;

  if (changed) {
    fs.mkdirSync(publicDir, { recursive: true });
    fs.copyFileSync(latestApk, publicApkFile);
    console.log(`📦 已同步 APK: ${latestApk} -> ${publicApkFile}`);
  } else {
    console.log(`📦 APK 无变化，沿用: ${publicApkFile}`);
  }

  state.sources.apkSourceHash = sourceHash;
  return { target: APK_TARGET, changed };
}

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirContents(sourceDir, targetDir, options = {}) {
  const excludeNames = new Set(options.excludeNames || []);
  fs.mkdirSync(targetDir, { recursive: true });

  fs.readdirSync(sourceDir, { withFileTypes: true }).forEach((entry) => {
    if (excludeNames.has(entry.name)) return;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirContents(sourcePath, targetPath, options);
      return;
    }

    fs.copyFileSync(sourcePath, targetPath);
  });
}

function buildZipFromDir(sourceDir, zipPath) {
  if (fs.existsSync(zipPath)) {
    fs.rmSync(zipPath, { force: true });
  }

  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${zipPath}' -Force"`,
    { stdio: 'pipe', cwd: repoRoot }
  );
}

function packageExtensionArchives(state) {
  const version = getExtensionVersion();
  const sourceHash = crypto.createHash('sha256').update([
    directoryFingerprint(extensionDir, { excludeNames: ['firefox', 'build-crx.js', 'nospoil-key.pem', 'nospoil-key.pub', 'README.md'] }),
    directoryFingerprint(firefoxExtensionDir),
    version
  ].join('\n')).digest('hex');
  const previousHash = state.sources.extensionSourceHash || '';
  const zipsExist = [chromiumZipFile, firefoxZipFile, ...chromiumAliasFiles, crxFile, updatesXmlFile].every((file) => fs.existsSync(file));

  if (sourceHash === previousHash && zipsExist) {
    console.log('📦 扩展无变化，跳过重新打包');
    return { targets: EXTENSION_ALIAS_TARGETS, changed: false };
  }

  // 1. 构建 CRX 和 updates.xml
  console.log(`🔨 构建扩展 CRX v${version} ...`);
  execSync(`node "${path.join(extensionDir, 'build-crx.js')}" ${version}`, {
    stdio: 'inherit',
    cwd: repoRoot
  });

  // 2. 打包 ZIP
  const chromiumStageDir = path.join(deployTempDir, 'chromium-extension');
  const firefoxStageDir = path.join(deployTempDir, 'firefox-extension');

  resetDir(chromiumStageDir);
  resetDir(firefoxStageDir);

  copyDirContents(extensionDir, chromiumStageDir, { excludeNames: ['firefox', 'build-crx.js', 'nospoil-key.pem', 'nospoil-key.pub', 'README.md'] });
  copyDirContents(firefoxExtensionDir, firefoxStageDir);
  fs.copyFileSync(path.join(extensionDir, 'content.js'), path.join(firefoxStageDir, 'content.js'));
  fs.copyFileSync(path.join(extensionDir, 'style.css'), path.join(firefoxStageDir, 'style.css'));

  buildZipFromDir(chromiumStageDir, chromiumZipFile);
  buildZipFromDir(firefoxStageDir, firefoxZipFile);
  chromiumAliasFiles.forEach((aliasPath) => {
    fs.copyFileSync(chromiumZipFile, aliasPath);
  });

  console.log(`📦 已打包扩展: ${chromiumZipFile}`);
  console.log(`📦 已打包扩展: ${firefoxZipFile}`);

  state.sources.extensionSourceHash = sourceHash;
  return { targets: EXTENSION_ALIAS_TARGETS, changed: true };
}

function getExtensionVersion() {
  const manifestPath = path.join(extensionDir, 'manifest.json');
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function shouldExcludeFile(name, relPath) {
  if (name.startsWith('.')) return true;
  if (DEFAULT_EXCLUDED_NAMES.has(name)) return true;
  if (DEFAULT_EXCLUDED_PATHS.has(relPath)) return true;
  if (name.endsWith('.bak.json')) return true;
  if (/^data\/matches\..+\.bak\.json$/i.test(relPath)) return true;
  return false;
}

function collectWebsitePublishFiles() {
  const results = [];

  function walk(currentDir) {
    fs.readdirSync(currentDir, { withFileTypes: true }).forEach((entry) => {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(__dirname, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDED_DIRS.has(entry.name)) return;
        walk(fullPath);
        return;
      }

      if (shouldExcludeFile(entry.name, relPath)) return;
      results.push(relPath);
    });
  }

  walk(__dirname);
  return results.sort();
}

function resolveRequestedFiles(files) {
  const resolved = [];
  files.forEach((file) => {
    const normalized = file.replace(/\\/g, '/').replace(/^website\//, '');
    const localPath = path.join(__dirname, normalized);

    if (!fs.existsSync(localPath)) {
      resolved.push(normalized);
      return;
    }

    if (fs.statSync(localPath).isDirectory()) {
      function walk(dirPath) {
        fs.readdirSync(dirPath, { withFileTypes: true }).forEach((entry) => {
          const fullPath = path.join(dirPath, entry.name);
          const relPath = path.relative(__dirname, fullPath).replace(/\\/g, '/');
          if (entry.isDirectory()) {
            walk(fullPath);
            return;
          }
          if (!shouldExcludeFile(entry.name, relPath)) {
            resolved.push(relPath);
          }
        });
      }
      walk(localPath);
      return;
    }

    resolved.push(normalized);
  });

  return Array.from(new Set(resolved)).sort();
}

function injectVersionIntoPluginHtml() {
  const pluginHtmlPath = path.join(__dirname, 'plugin.html');
  if (!fs.existsSync(pluginHtmlPath)) return null;

  const source = fs.readFileSync(pluginHtmlPath, 'utf8');
  const version = getExtensionVersion();
  const replaced = source.replace(/\{\{EXTENSION_VERSION\}\}/g, `v${version}`);

  if (replaced === source) return null; // no placeholder found, nothing to do

  const tempPath = path.join(deployTempDir, 'plugin.html');
  fs.mkdirSync(deployTempDir, { recursive: true });
  fs.writeFileSync(tempPath, replaced, 'utf8');
  return { tempPath, hash: crypto.createHash('sha256').update(replaced).digest('hex') };
}

function filterChangedFiles(files, state) {
  if (forceUploadMode) {
    return files;
  }

  // 对 plugin.html 做版本号注入，注入后始终标记为"已变更"以触发上传
  let pluginInjected = null;
  if (files.includes('plugin.html')) {
    pluginInjected = injectVersionIntoPluginHtml();
  }

  return files.filter((file) => {
    // plugin.html：如果注入成功，用注入后文件的 hash 来比较
    if (file === 'plugin.html' && pluginInjected) {
      return state.deployed[file] !== pluginInjected.hash;
    }

    const localPath = path.join(__dirname, file);
    if (!fs.existsSync(localPath) || fs.statSync(localPath).isDirectory()) {
      return true;
    }

    const currentHash = fileHash(localPath);
    return state.deployed[file] !== currentHash;
  });
}

function updateStateForSuccessfulUploads(state, files) {
  files.forEach((file) => {
    // plugin.html：如果存在注入版本，使用注入版本的 hash
    if (file === 'plugin.html') {
      const tempPath = path.join(deployTempDir, 'plugin.html');
      if (fs.existsSync(tempPath)) {
        state.deployed[file] = fileHash(tempPath);
        return;
      }
    }

    const localPath = path.join(__dirname, file);
    if (!fs.existsSync(localPath) || fs.statSync(localPath).isDirectory()) return;
    state.deployed[file] = fileHash(localPath);
  });
}

function remoteDirectoryFor(file) {
  const remoteDir = path.posix.dirname(file);
  return remoteDir === '.' ? `${userHost}:${target}/` : `${userHost}:${target}/${remoteDir}/`;
}

function ensureLocalRsyncAvailable() {
  if (localRsyncChecked) return;

  try {
    execSync(`${WSL_CMD} rsync --version`, { stdio: 'pipe' });
    localRsyncChecked = true;
  } catch (err) {
    const detail = err.stderr ? err.stderr.toString().trim() : err.message.trim();
    throw new Error(`LOCAL_RSYNC_UNAVAILABLE: 本机 WSL rsync 不可用。${detail}`);
  }
}

function prepareRsyncStage(files) {
  const stageDir = path.join(deployTempDir, 'rsync-stage');
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });
  const pluginInjected = files.includes('plugin.html') ? injectVersionIntoPluginHtml() : null;

  files.forEach((file) => {
    let sourcePath = path.join(__dirname, file);

    if (file === 'plugin.html') {
      if (pluginInjected && fs.existsSync(pluginInjected.tempPath)) sourcePath = pluginInjected.tempPath;
    }

    if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).isDirectory()) {
      throw new Error(`LOCAL_FILE_MISSING: ${file}`);
    }

    const targetPath = path.join(stageDir, file);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  });

  return stageDir;
}

function rsyncUpload(files) {
  if (files.length === 0) return { success: 0, fail: 0 };
  ensureLocalRsyncAvailable();

  // 生成文件列表供 --files-from 使用（相对路径）
  const listFileWin = path.join(deployTempDir, 'upload-list.txt');
  fs.mkdirSync(deployTempDir, { recursive: true });
  const stageDir = prepareRsyncStage(files);
  fs.writeFileSync(listFileWin, files.join('\n'), 'utf8');

  const wslListFile = toWslPath(listFileWin);
  const wslSourceDir = toWslPath(stageDir);
  const wslKeyFile = sshKeyWsl;

  const sshCmd = `ssh -i ${wslKeyFile} -p ${port} -o StrictHostKeyChecking=no`;
  const cmd = `${WSL_CMD} rsync -avz --files-from="${wslListFile}" -e "${sshCmd}" "${wslSourceDir}/" "${userHost}:${target}/"`;

  console.log(`\n📡 rsync 通过 WSL 传输中...\n`);

  try {
    const output = execSync(cmd, { stdio: 'pipe', encoding: 'utf8' });
    const lines = output.split('\n');
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !/^(sending|sent|total|receiving)/i.test(trimmed)) {
        console.log(`  ${trimmed}`);
      }
    });
    console.log('');
    return { success: files.length, fail: 0 };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    const msg = stderr || err.message.trim();
    throw new Error(msg);
  }
}

function scpUpload(files) {
  if (files.length === 0) return { success: 0, fail: 0 };

  console.log(`\n📡 scp 逐个上传中...\n`);

  let success = 0;
  let fail = 0;

  files.forEach((file) => {
    let localPath = path.join(__dirname, file);
    let remotePath = file;

    // 如果有 plugin.html 的注入版本，使用临时文件
    if (file === 'plugin.html') {
      const tempPath = path.join(deployTempDir, 'plugin.html');
      if (fs.existsSync(tempPath)) {
        localPath = tempPath;
      }
    }

    if (!fs.existsSync(localPath)) {
      console.log(`  ⏭ 跳过(不存在): ${file}`);
      return;
    }

    try {
      const keyFlag = sshKeyWin && fs.existsSync(sshKeyWin) ? ` -i "${sshKeyWin}"` : '';
      execSync(`scp${keyFlag} -P ${port} -o StrictHostKeyChecking=no "${localPath}" "${remoteDirectoryFor(remotePath)}"`, {
        stdio: 'pipe'
      });
      console.log(`  ✅ ${file}`);
      success++;
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : '';
      const msg = stderr || err.message.trim();
      console.log(`  ❌ ${file}: ${msg}`);
      fail++;
    }
  });

  return { success, fail };
}

function printRsyncInstallHint() {
  console.log('  提示: 这是远端服务器缺少 rsync，不是你本机命令输错了');
  console.log('  可运行: node website/install-rsync-remote.js');
}

function uploadFiles(files) {
  try {
    return rsyncUpload(files);
  } catch (err) {
    const msg = err.message || '';
    if (/^LOCAL_RSYNC_UNAVAILABLE:/.test(msg)) {
      console.log(`  ⚠ ${msg.replace(/^LOCAL_RSYNC_UNAVAILABLE:\s*/, '')}`);
      console.log('  ⚠ 自动回退到 scp 上传');
      return scpUpload(files);
    }

    if (/rsync: not found/i.test(msg)) {
      console.log('  ⚠ 当前链路缺少 rsync，自动回退到 scp');
      printRsyncInstallHint();
      return scpUpload(files);
    }

    console.error(`  ❌ rsync 失败: ${msg}`);
    return { success: 0, fail: files.length };
  }
}

function main() {
  const state = loadDeployState();

  let requestedFiles = [];
  if (fileArgs.length > 0) {
    requestedFiles = resolveRequestedFiles(fileArgs);
  } else if (apkOnlyMode) {
    const apkResult = syncLatestApkToPublic(state);
    requestedFiles = [apkResult.target];
  } else {
    const apkResult = syncLatestApkToPublic(state);
    const extensionResult = packageExtensionArchives(state);
    requestedFiles = collectWebsitePublishFiles();

    if (apkResult.changed && !requestedFiles.includes(apkResult.target)) {
      requestedFiles.push(apkResult.target);
    }

    if (extensionResult.changed) {
      extensionResult.targets.forEach((file) => {
        if (!requestedFiles.includes(file)) requestedFiles.push(file);
      });
    }
  }

  const changedFiles = filterChangedFiles(requestedFiles, state);

  if (requestedFiles.length === 0) {
    console.log('没有匹配到可部署的文件');
    return;
  }

  if (changedFiles.length === 0) {
    console.log('✅ 没有检测到文件变化，本次无需上传');
    saveDeployState(state);
    return;
  }

  console.log(`🚀 部署到 ${userHost}:${target}\n`);
  console.log(`本次准备上传 ${changedFiles.length} 个变更文件:\n  - ${changedFiles.join('\n  - ')}\n`);

  const result = uploadFiles(changedFiles);

  if (result.success > 0) {
    updateStateForSuccessfulUploads(state, changedFiles);
  }
  saveDeployState(state);
  console.log(`完成: ${result.success} 成功, ${result.fail} 失败`);
}

main();
