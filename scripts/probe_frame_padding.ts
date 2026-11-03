// 本地验证视频首帧补边：把一张图按目标画幅补边并上传，打印公网链接
// 用法: npx tsx scripts/probe_frame_padding.ts <图片路径> [16:9]
import '../server/loadEnv';
import fs from 'fs';
import { VideoSourceImageResolver } from '../server/services/video/videoSourceImageResolver';

async function main() {
  const [file, ratio = '16:9'] = process.argv.slice(2);
  if (!file) throw new Error('请提供图片路径');
  const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(file).toString('base64')}`;
  const url = await VideoSourceImageResolver.resolveFrameForRatio(dataUrl, ratio);
  console.log(url);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
