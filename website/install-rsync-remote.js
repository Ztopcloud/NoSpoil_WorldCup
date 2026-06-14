/**
 * install-rsync-remote.js
 *
 * 在远端服务器安装 rsync，并验证安装结果。
 * 用法:
 *   node website/install-rsync-remote.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath)) {
  fs.readFileSync(dotenvPath, 'utf8').split('\n').forEach((line) => {
    const [k, ...v] = line.split('=');
    if (k && !process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
  });
}

const host = process.env.RSYNC_HOST;
const user = process.env.RSYNC_USER || 'root';
const port = process.env.RSYNC_PORT || '22';

if (!host) {
  console.error('请先在 website/.env 中配置 RSYNC_HOST');
  process.exit(1);
}

const userHost = `${user}@${host}`;
const remoteScript = [
  'set -e',
  'if command -v rsync >/dev/null 2>&1; then',
  '  echo "rsync already installed"',
  'elif command -v apt-get >/dev/null 2>&1; then',
  '  apt-get update && apt-get install -y rsync',
  'elif command -v dnf >/dev/null 2>&1; then',
  '  dnf install -y rsync',
  'elif command -v yum >/dev/null 2>&1; then',
  '  yum install -y rsync',
  'elif command -v apk >/dev/null 2>&1; then',
  '  apk add rsync',
  'else',
  '  echo "未识别到 apt/dnf/yum/apk，请手动安装 rsync"',
  '  exit 1',
  'fi',
  'echo "---"',
  'command -v rsync',
  'rsync --version | head -n 1'
].join('; ');

const cmd = `ssh -p ${port} -o StrictHostKeyChecking=no ${userHost} "${remoteScript}"`;

console.log(`🔧 正在检查并安装远端 rsync: ${userHost}`);

try {
  execSync(cmd, { stdio: 'inherit' });
  console.log('✅ 远端 rsync 已就绪，现在可以重新运行 node gx');
} catch (err) {
  console.error('❌ 远端 rsync 安装失败，请根据上面的输出检查服务器环境');
  process.exit(1);
}
