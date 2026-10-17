import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';

const CLOUD_HTTP_URL = process.env.MANWAH_CLOUD_URL || 'http://localhost:3000';
const CLOUD_WS_URL = CLOUD_HTTP_URL.replace(/^http/, 'ws') + '/ws/bridge-hub';

interface LocalFileItem {
  id: string;
  name: string;
  path: string;
  extension: string;
  size: number;
  category: string;
  last_modified: number;
  preview_base64?: string;
}

const SUPPORTED_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.psd', '.ai', '.mp4'];

function scanFolder(dirPath: string): LocalFileItem[] {
  const items: LocalFileItem[] = [];
  if (!fs.existsSync(dirPath)) return items;

  function traverse(current: string) {
    try {
      const files = fs.readdirSync(current, { withFileTypes: true });
      for (const file of files) {
        if (file.name.startsWith('.') || file.name === 'node_modules') continue;
        const fullPath = path.join(current, file.name);
        if (file.isDirectory()) {
          traverse(fullPath);
        } else if (file.isFile()) {
          const ext = path.extname(file.name).toLowerCase();
          if (SUPPORTED_EXTS.includes(ext)) {
            const stat = fs.statSync(fullPath);
            let category = 'other';
            if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) category = 'product_photo';
            else if (['.pdf', '.doc', '.docx'].includes(ext)) category = 'document';
            else if (['.psd', '.ai'].includes(ext)) category = 'design';
            else if (['.mp4', '.mov'].includes(ext)) category = 'video';

            let preview_base64: string | undefined = undefined;
            if (category === 'product_photo' && stat.size < 15 * 1024 * 1024) {
              try {
                const buf = fs.readFileSync(fullPath);
                preview_base64 = `data:image/${ext.replace('.', '')};base64,${buf.toString('base64')}`;
              } catch (e) {}
            }

            items.push({
              id: `f_${Buffer.from(fullPath).toString('base64').slice(0, 16)}`,
              name: file.name,
              path: fullPath,
              extension: ext.replace('.', ''),
              size: stat.size,
              category,
              last_modified: Math.floor(stat.mtimeMs / 1000),
              preview_base64
            });
          }
        }
      }
    } catch (e) {}
  }

  traverse(dirPath);
  return items;
}

async function main() {
  console.log('\n======================================================');
  console.log('   Manwah Cavas · Local Asset Bridge 本地素材连接器');
  console.log('======================================================\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string) => new Promise<string>(resolve => rl.question(query, resolve));

  // 1. Get Pair Code
  let pairCode = process.argv[2];
  if (!pairCode) {
    pairCode = await question('👉 请输入网页上显示的 6 位配对码 (如 499334): ');
  }

  if (!pairCode || pairCode.trim().length < 4) {
    console.error('❌ 配对码无效，退出');
    process.exit(1);
  }

  pairCode = pairCode.trim();

  // 2. Select Local Asset Directory
  let targetFolder = await question('👉 请输入本地授权的素材文件夹路径 [默认: D:\\设计资料]: ');
  targetFolder = targetFolder.trim() || 'D:\\设计资料';

  if (!fs.existsSync(targetFolder)) {
    console.log(`⚠️ 目录 ${targetFolder} 不存在，正在自动创建测试文件夹...`);
    try {
      fs.mkdirSync(targetFolder, { recursive: true });
    } catch (e) {
      targetFolder = process.cwd();
    }
  }

  console.log(`\n⏳ 正在连接云端配对 (${CLOUD_HTTP_URL})...`);

  // 3. Pair with Cloud
  try {
    const pairRes = await fetch(`${CLOUD_HTTP_URL}/api/bridge/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairCode,
        deviceName: `${process.env.COMPUTERNAME || 'Designer-PC'} (Windows)`,
        deviceFingerprint: `win_${Date.now()}`
      })
    });

    const pairData = await pairRes.json();
    if (!pairData.success) {
      console.error(`❌ 配对失败: ${pairData.error}`);
      process.exit(1);
    }

    const { deviceId, deviceToken } = pairData;
    console.log(`✅ 配对成功！已绑定设备 ID: ${deviceId}`);
    console.log(`📂 已授权本地目录: ${targetFolder}`);

    // 4. Connect WebSocket
    console.log(`🔗 正在建立 WebSocket 通道: ${CLOUD_WS_URL}`);
    const ws = new WebSocket(CLOUD_WS_URL);

    ws.on('open', () => {
      console.log('🎉 与云端 Relay Hub 握手成功！');
      ws.send(JSON.stringify({
        type: 'auth',
        deviceId,
        deviceToken,
        authorizedDirs: [targetFolder]
      }));

      // Keepalive heartbeat
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      }, 15000);
    });

    ws.on('message', (data: any) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth_response') {
          if (msg.success) {
            console.log('\n🟢 本地连接器已就绪！网页端智能对话已自动连通。');
            console.log('💡 现在可以在网页端智能对话中输入：“查找本地 2650” 体验秒级搜图。\n');
          } else {
            console.error('❌ 认证被拒绝:', msg.error);
          }
        }

        // Handle Cloud RPC Request
        if (msg.type === 'rpc_request') {
          const { requestId, action, payload } = msg;
          console.log(`📥 收到云端指令: ${action}`);

          if (action === 'search_local_assets') {
            const query = (payload.query || '').toLowerCase();
            const allItems = scanFolder(targetFolder);
            const filtered = allItems.filter(item =>
              !query || item.name.toLowerCase().includes(query) || item.path.toLowerCase().includes(query)
            ).slice(0, payload.limit || 8);

            console.log(`🔍 检索关键词 "${query}"，命中 ${filtered.length} 个文件`);

            ws.send(JSON.stringify({
              type: 'rpc_response',
              requestId,
              success: true,
              data: filtered
            }));
          } else if (action === 'stage_file_upload') {
            const filePath = payload.filePath;
            if (fs.existsSync(filePath)) {
              const buf = fs.readFileSync(filePath);
              const ext = path.extname(filePath).replace('.', '') || 'png';
              console.log(`📤 按需传输素材: ${filePath} (${(buf.length / 1024).toFixed(1)} KB)`);

              ws.send(JSON.stringify({
                type: 'rpc_response',
                requestId,
                success: true,
                data: {
                  fileName: path.basename(filePath),
                  fileSize: buf.length,
                  base64: `data:image/${ext};base64,${buf.toString('base64')}`
                }
              }));
            } else {
              ws.send(JSON.stringify({
                type: 'rpc_response',
                requestId,
                success: false,
                error: '文件不存在'
              }));
            }
          } else if (action === 'export_file_to_local') {
            const subfolder = payload.subfolder || '成品交付包';
            const exportDir = path.join(targetFolder, subfolder);
            if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

            const targetPath = path.join(exportDir, `poster_${Date.now()}.png`);
            const b64 = (payload.deliverableData || '').split(',').pop();
            if (b64) {
              fs.writeFileSync(targetPath, Buffer.from(b64, 'base64'));
              console.log(`💾 成功保存成品海报至本地: ${targetPath}`);
              ws.send(JSON.stringify({
                type: 'rpc_response',
                requestId,
                success: true,
                data: { savedPath: targetPath }
              }));
            } else {
              ws.send(JSON.stringify({
                type: 'rpc_response',
                requestId,
                success: false,
                error: '缺少有效图片数据'
              }));
            }
          }
        }
      } catch (e: any) {
        console.error('处理消息异常:', e);
      }
    });

    ws.on('close', () => {
      console.log('⚠️ 与云端的连接已断开，连接器已退出');
      process.exit(0);
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket 发生错误:', err.message);
    });

  } catch (err: any) {
    console.error('❌ 连接异常:', err.message);
  }
}

main();
