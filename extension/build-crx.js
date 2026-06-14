/**
 * build-crx.js - 将扩展打包为 CRX 文件 (支持 CRX3 格式)
 *
 * 用法: node extension/build-crx.js [version]
 * 输出: website/public/scgs-tv-extension.crx
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const extensionDir = path.join(repoRoot, 'extension');
const pemFile = path.join(extensionDir, 'nospoil-key.pem');
const pubFile = path.join(extensionDir, 'nospoil-key.pub');

// 输出
const publicDir = path.join(repoRoot, 'website', 'public');
const crxOutput = path.join(publicDir, 'scgs-tv-extension.crx');
const xmlOutput = path.join(publicDir, 'updates.xml');

const version = process.argv[2];

function loadOrGenerateKey() {
  if (fs.existsSync(pemFile)) {
    const privPem = fs.readFileSync(pemFile, 'utf8');
    const privKey = crypto.createPrivateKey(privPem);
    const pubKey = crypto.createPublicKey(privKey);
    const pubDer = pubKey.export({ type: 'spki', format: 'der' });
    fs.writeFileSync(pubFile, pubDer);
    return { privateKey: privKey, publicKey: pubKey, publicDer: pubDer };
  }

  // 生成 RSA-2048 密钥对
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  fs.writeFileSync(pemFile, privateKey, 'utf8');
  const pubKey = crypto.createPublicKey(publicKey);
  const pubDer = pubKey.export({ type: 'spki', format: 'der' });
  fs.writeFileSync(pubFile, pubDer);

  console.log('🔑 已生成新的 RSA 密钥对');
  return { privateKey: crypto.createPrivateKey(privateKey), publicKey: pubKey, publicDer: pubDer };
}

function getExtensionId(publicDer) {
  // Chromium extension ID = first 128 bits of SHA-256 of public key (DER/SPKI)
  // encoded as a-p lowercase (hex digits mapped: 0->a, 1->b, ..., 9->j, a->k, ..., f->p)
  const hash = crypto.createHash('sha256').update(publicDer).digest();
  const idHex = hash.slice(0, 16); // first 128 bits = 16 bytes
  const map = 'abcdefghijklmnop';
  return Array.from(idHex)
    .map((b) => map[b >> 4] + map[b & 0x0f])
    .join('');
}

// ────────────────────────────────────
// Minimal Protobuf encoder for CRX3
// ────────────────────────────────────
function encodeVarint(value) {
  const bytes = [];
  let v = BigInt(value);
  while (v > 127n) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}

function encodeField(fieldNumber, wireType, data) {
  const tag = encodeVarint((fieldNumber << 3) | wireType);
  if (wireType === 2) {
    // length-delimited
    const length = encodeVarint(data.length);
    return Buffer.concat([tag, length, data]);
  }
  return Buffer.concat([tag, data]);
}

function encodeMessage(fields) {
  const parts = [];
  for (const [fieldNum, wireType, data] of fields) {
    parts.push(encodeField(fieldNum, wireType, data));
  }
  return Buffer.concat(parts);
}

function buildCrx3Header(signedHeaderData, publicDer, signature) {
  // AsymmetricKeyProof (field 2, repeated)
  const proofPubKey = encodeField(1, 2, publicDer);
  const proofSig = encodeField(2, 2, signature);
  const proof = encodeMessage([
    [1, 2, publicDer],
    [2, 2, signature]
  ]);

  // CrxFileHeader
  const header = encodeMessage([
    [2, 2, proof],                    // sha256_with_rsa = 2
    [10000, 2, signedHeaderData]      // signed_header_data = 10000
  ]);

  return header;
}

function buildCrx3(zipData, publicDer, privateKey) {
  // SignedData: crx_id = SHA-256 of public key (first 16 bytes)
  const crxId = crypto.createHash('sha256').update(publicDer).digest().slice(0, 16);
  const signedData = encodeMessage([
    [1, 2, crxId]  // crx_id = 1
  ]);

  // Sign signed_data with RSA-SHA256
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signedData);
  const signature = sign.sign({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING });

  // Build header
  const header = buildCrx3Header(signedData, publicDer, signature);

  // CRX3 file format:
  // magic "Cr24" (4 bytes)
  // version = 3 (4 bytes, little-endian)
  // header_length (4 bytes, little-endian)
  // header (protobuf)
  // zip_data
  const magic = Buffer.from('Cr24', 'ascii');
  const versionBuf = Buffer.alloc(4);
  versionBuf.writeUInt32LE(3, 0);
  const headerLenBuf = Buffer.alloc(4);
  headerLenBuf.writeUInt32LE(header.length, 0);

  return Buffer.concat([magic, versionBuf, headerLenBuf, header, zipData]);
}

function zipDirectory(sourceDir, outputPath, excludeNames = []) {
  const excludeSet = new Set(excludeNames);

  // 使用 PowerShell Compress-Archive
  if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });

  // 创建临时暂存目录，排除不需要的文件
  const tmpDir = path.join(repoRoot, '.tmp', 'crx-staging');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  function copyDir(srcDir, dstDir) {
    fs.mkdirSync(dstDir, { recursive: true });
    fs.readdirSync(srcDir, { withFileTypes: true }).forEach((entry) => {
      if (excludeSet.has(entry.name)) return;
      const src = path.join(srcDir, entry.name);
      const dst = path.join(dstDir, entry.name);
      if (entry.isDirectory()) {
        copyDir(src, dst);
      } else {
        fs.copyFileSync(src, dst);
      }
    });
  }

  copyDir(sourceDir, tmpDir);

  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${tmpDir}\\*' -DestinationPath '${outputPath}' -CompressionLevel Optimal -Force"`,
    { stdio: 'pipe', cwd: repoRoot }
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return fs.readFileSync(outputPath);
}

function generateUpdatesXml(extensionId, crxUrl) {
  return `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${extensionId}'>
    <updatecheck codebase='${crxUrl}' version='${version}' />
  </app>
</gupdate>
`;
}

function main() {
  if (!version) {
    console.error('请指定版本号，例如: node extension/build-crx.js 0.1.9');
    process.exit(1);
  }

  console.log(`🔨 构建 CRX v${version} ...`);

  // 1. 加载或生成密钥
  const { privateKey, publicDer } = loadOrGenerateKey();

  // 2. 计算 extension ID
  const extensionId = getExtensionId(publicDer);
  console.log(`📛 Extension ID: ${extensionId}`);

  // 3. 打包 ZIP（排除 firefox 目录和构建脚本）
  const zipPath = path.join(repoRoot, '.tmp', 'extension-temp.zip');
  const zipData = zipDirectory(extensionDir, zipPath, ['firefox', 'build-crx.js', 'nospoil-key.pem', 'nospoil-key.pub', 'README.md']);

  // 4. 构建 CRX3
  const crxData = buildCrx3(zipData, publicDer, privateKey);

  // 5. 写入 CRX 文件
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(crxOutput, crxData);
  console.log(`✅ CRX 已输出: ${crxOutput} (${(crxData.length / 1024).toFixed(1)} KiB)`);

  // 6. 生成 updates.xml
  const crxUrl = 'https://scgs.tv/public/scgs-tv-extension.crx';
  const xml = generateUpdatesXml(extensionId, crxUrl);
  fs.writeFileSync(xmlOutput, xml, 'utf8');
  console.log(`✅ updates.xml 已输出: ${xmlOutput}`);

  // 7. 清理临时文件
  fs.rmSync(zipPath, { force: true });

  console.log('\n📋 下一步:');
  console.log('  1. 更新 manifest.json 添加: "update_url": "https://scgs.tv/public/updates.xml"');
  console.log('  2. CRX 和 updates.xml 已生成在 website/public/ 目录');
  console.log('  3. 运行 node website/deploy.js 部署到服务器');
}

main();
