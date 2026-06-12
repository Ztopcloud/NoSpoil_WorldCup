/**
 * deploy.js - 增量部署 website/ 发布文件到服务器
 *
 * 用法：
 *   node website/deploy.js
 *   node website/deploy.js --apk
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

function toWslPath(winPath) {
  let result = winPath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(result)) {
    result = '/mnt/' + result[0].toLowerCase() + result.slice(2);
  }
  return result;
}
const chromiumZipFile = path.join(publicDir, 'scgs-tv-extension-chromium.zip');
const firefoxZipFile = path.join(publicDir, 'scgs-tv-extension-firefox.zip');
const chromiumAliasFiles = [
  path.join(publicDir, 'scgs-tv-extension.zip'),
  path.join(publicDir, 'nospoil-worldcup-extension.zip')
];

const EXTENSION_ALIAS_TARGETS = [
  'public/scgs-tv-extension-chromium.zip',
  'public/scgs-tv-extension-firefox.zip',
  'public/scgs-tv-extension.zip',
  'public/nospoil-worldcup-extension.zip'
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
const fileArgs = rawArgs.filter((arg) => arg !== '--apk');

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
  const sourceHash = crypto.createHash('sha256').update([
    directoryFingerprint(extensionDir, { excludeNames: ['firefox'] }),
    directoryFingerprint(firefoxExtensionDir)
  ].join('\n')).digest('hex');
  const previousHash = state.sources.extensionSourceHash || '';
  const zipsExist = [chromiumZipFile, firefoxZipFile, ...chromiumAliasFiles].every((file) => fs.existsSync(file));

  if (sourceHash === previousHash && zipsExist) {
    console.log('📦 扩展无变化，跳过重新打包');
    return { targets: EXTENSION_ALIAS_TARGETS, changed: false };
  }

  const chromiumStageDir = path.join(deployTempDir, 'chromium-extension');
  const firefoxStageDir = path.join(deployTempDir, 'firefox-extension');

  resetDir(chromiumStageDir);
  resetDir(firefoxStageDir);

  copyDirContents(extensionDir, chromiumStageDir, { excludeNames: ['firefox'] });
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

function filterChangedFiles(files, state) {
  return files.filter((file) => {
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
    const localPath = path.join(__dirname, file);
    if (!fs.existsSync(localPath) || fs.statSync(localPath).isDirectory()) return;
    state.deployed[file] = fileHash(localPath);
  });
}

function rsyncUpload(files) {
  if (files.length === 0) return { success: 0, fail: 0 };

  // 生成文件列表供 --files-from 使用（相对路径）
  const listFileWin = path.join(deployTempDir, 'upload-list.txt');
  fs.mkdirSync(deployTempDir, { recursive: true });
  fs.writeFileSync(listFileWin, files.join('\n'), 'utf8');

  const wslListFile = toWslPath(listFileWin);
  const wslSourceDir = toWslPath(__dirname);
  const wslKeyFile = toWslPath(sshKeyWin);

  const sshCmd = `ssh -i "${wslKeyFile}" -p ${port} -o StrictHostKeyChecking=no`;
  const cmd = `wsl rsync -avz --files-from="${wslListFile}" -e "${sshCmd}" "${wslSourceDir}/" "${userHost}:${target}/"`;

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

  const result = rsyncUpload(changedFiles);

  if (result.success > 0) {
    updateStateForSuccessfulUploads(state, changedFiles);
  }
  saveDeployState(state);
  console.log(`完成: ${result.success} 成功, ${result.fail} 失败`);
}

main();
