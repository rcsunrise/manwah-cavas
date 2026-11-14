# manwah-cavas

## 运行
- 本地服务：`npx tsx server.ts`，端口 3000（launch.json 名称 `manwah-dev`）。**不监听文件变化，改了 server/ 必须重启。**
- Vite 会监听 server/ 文件，一改就整页刷新浏览器 → **生成进行中不要改 server/ 下文件**，否则请求中断且点数照扣。
- 类型检查 `npx tsc --noEmit`；测试 `npx vitest run <文件>`，全量只在提交前跑。
- Windows 下 Python 读写中文：脚本写成文件，用 `python -X utf8` 运行。

## 模板 A 海报（server/services/posterTemplate/，路由 /api/poster-templates）
流程：概念（posterConcept.ts，文本模型）→ 主场景（/template-a/hero，网关生图 gpt-image-2.6-flare-c，**每张 3000 点**）→ 细节定位与裁切（detailCrop.ts，视觉模型 box_2d）→ 真实字体排版（templateA.ts + posterFonts.ts，sharp/Pango，Noto Serif/Sans SC）。
- 画布 2048×1536，主场景占 76.5%，底部三栏细节；标题按 productBox 避让，背景杂时加衬底。
- 场景方向库 sceneDirections.ts：按产品轮换未用过的方向；namesCollide 防撞名（同字集合算撞）。
- 前端：useCreativeCanvasWorkspace.ts 的 handleGenerateTemplatePoster / handleAddProductNode；按产品节点加锁，多产品可并发。只有主产品节点（img-node-1 / product-image-node-1）带 DNA 和企划，其他产品以图片为准。
- 对话框附件“加为新产品”，一次最多 4 张。

## 面料色卡海报（模板 C，server/services/posterTemplate/textilePoster.ts + textileConcept.ts，路由 /api/poster-templates/textile/*）
- 和“沙发面料海报”（fabric*，模板 B）不是一回事：这个是纯面料——本地面料文件夹里选一款做主色，同文件夹自动配色，大面料特写 + 名称说明 + 色卡 + 氛围图拼块。
- 三种版式 slant 斜切 / hex 六边形 / circle 圆形，坐标全在 TEXTILE_LAYOUTS；画布 2000×1414。底色 deriveBackground 取自主面料，文字是真实字体。
- analyzeFabric 自动避开面料样卡照片上的白色标签纸，取与标签同色的干净区域；标签型号由视觉模型在 /textile/concept 里读出。
- compose 不出图不扣点；生成时氛围图默认 AI 出 3 张（textileMoods 不填=3，每张 3000 点，确认卡片写明），textileMoods=0 改用面料特写，textileMoodUrls 用用户发的图。
- 氛围拼贴（moodCollage）：compose 前用视觉模型定位每张图里的人物，有人物的做底图、裁切保住人物、小图避开人物；避不开就改成并排拼贴。大图/色卡按纹理尺度取图（textureFill），颗粒与参考图一致。
- 脚本里直接调这些服务要 `npx tsx --env-file=.env`，否则视觉模型没凭据会静默回退。
- 前端：useCreativeCanvasWorkspace.ts 的 handleGenerateTextilePoster / handleEditTextilePoster（动作 textile_poster / textile_edit）；素材卡“设为主色 · 面料海报”按钮；配色挑选 src/utils/textilePalette.ts。节点 id `template-poster-c-*`，templatePoster.template === 'C'，已存面料原图 URL，改版式/文字/底色只重新排版。
- 对话里含“面料/色卡/配色/模板海报”的“做一张……海报”不再被 isPosterLayoutIntent 拦截。

## 本地素材文件夹（本机调试兜底）
- 浏览器 showDirectoryPicker 在内嵌浏览器/受保护目录（桌面、文档、下载、用户目录、盘符根）会 AbortError，云端 Chrome 正常。
- 本机调试用素材面板里的“输入路径读取”：server/routes/localFolderRoutes.ts（/api/local-folder/*）让服务端按路径读；只在非生产环境 + 回环地址启用，云端部署永远 404。改了这个路由要重启服务。

## 已知问题
- Supabase 网络常 ECONNRESET，上传/读取会卡，重试即可。
- 对话里说“做一张……海报”会被 isPosterLayoutIntent 关键词拦截，回复写死的“2650 本地素材”提示；要用“模板 A 海报”按钮或节点上的“模板海报”。
- 同一批不同产品可能撞同一场景方向（尚未做批内互斥）。
- 生成卡片的操作按钮偶尔被挤成竖排文字（未处理）。

## 规矩
- 不代填密码，登录由用户本人完成。
- 不删除/清空画布，要从零跑就新建空画布。
- 不推送、不合并 main，除非用户明确要求。
- 省额度：能读文字就不截图，看海报先缩小，大文件先 Grep 再按行读。
