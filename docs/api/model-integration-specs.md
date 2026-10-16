# 新增模型技术对接与入参规格文档

> **【接入规则核心准则】**  
> 本系统（Manwah AI）的统一模型接入规则为**最高主规则**。  
> 任何业务模块、微服务或跨系统对接，**均以调用本系统统一网关 (`/api/gateway/generate-image`) 为标准接入方式**。  
> 若直接对接外部原厂（Google/OpenAI）或三方中转（VectorEngine/RouterHub/TianToken），本系统网关在尺寸换算、多图角色解析、心跳保活、持久化缓存及扣费审计上均有专有适配逻辑，具体差异详见[第五节：与外部原生接口的差异提示](#五与外部原生接口的差异提示必读)。

---

## 一、模型基本元数据与路由对照表

| 界面模型名称 | 内部模型标识 (Model ID / Alias) | 归属系列 (Family) | 传输协议 (Transport) | 支持渲染精度 (Resolution) | 支持画幅 (Aspect Ratio) | 特性支持 (Features) |
|---|---|---|---|---|---|---|
| **Nano Banana 2.1** | `gemini-nano-banana-2.1-preview`<br>`google/gemini-nano-banana-2.1-preview` | Google Gemini 家族 | `google_genai`<br>(`gemini_native`) | 1K, 2K, 4K | 1:1, 3:4, 4:3, 16:9, 9:16 | 极速响应、轻量计算、多图融合 |
| **GPT 2.5 Flare** | `openai/gpt-image-2.5-flare-c`<br>`gpt-image-2.5-flare-c` | OpenAI GPT 家族 | `openai_images` | 1K, 2K, 4K | 1:1, 3:4, 4:3, 16:9, 9:16 | 文生图、图生图、局部 Mask 重绘、高保真原画 |
| **GPT 2.5 Sunburst** | `openai/gpt-image-2.5-sunburst-c`<br>`gpt-image-2.5-sunburst-c` | OpenAI GPT 家族 | `openai_images` | 1K, 2K, 4K | 1:1, 3:4, 4:3, 16:9, 9:16 | 文生图、图生图、局部 Mask 重绘、旗舰级高光细节 |

---

## 二、调用方式 1：通过本项目统一中转网关调用（推荐）

本项目服务端已内置自适应路由网关 `/api/gateway/generate-image`，对上述两类协议进行了标准化抹平，统一接收 JSON 请求并返回标准数据格式。

* **请求路径**：`POST /api/gateway/generate-image`
* **Content-Type**：`application/json`
* **鉴权 Header**：
  ```http
  Authorization: Bearer <JWT_USER_TOKEN> 或 x-goog-api-key: <API_KEY>
  ```

### 1. 入参完整规格定义 (JSON Schema)

```typescript
interface GenerateImageRequestBody {
  /** 模型名称，例如: 'gemini-nano-banana-2.1-preview' | 'openai/gpt-image-2.5-flare-c' | 'openai/gpt-image-2.5-sunburst-c' */
  model: string;

  /** 生图提示词 (Prompt)，支持英文及中文 */
  prompt: string;

  /** 输出画幅比例，支持: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | 'Auto' */
  aspectRatio?: '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | string;

  /** 输出画质分辨率，支持: '1K' | '2K' | '4K' */
  resolution?: '1K' | '2K' | '4K';

  /** 随机种子，固定生成随机数 (可选) */
  seed?: number;

  /** 参考图片列表 (用于图生图、线稿垫图或多图参考) */
  images?: Array<{
    /** MIME 类型，例如: 'image/jpeg' | 'image/png' */
    mimeType: string;
    /** 图片 Base64 编码 (可带或不带 data:image/...;base64, 前缀) */
    data: string;
    /** 图片专属遮罩 (可选，局部重绘时生效) */
    maskDataUrl?: string;
  }>;

  /** 独立遮罩配置 (用于局部重绘 Mask Inpainting) */
  mask?: {
    mimeType?: string;
    data: string; // Base64 纯黑白遮罩，白色代表重绘区域
  };
}
```

### 2. 网关请求示例 (cURL)

```bash
# 示例：调用 GPT 2.5 Flare 生成 2K 4:3 沙发渲染图
curl -X POST "http://localhost:3000/api/gateway/generate-image" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -d '{
    "model": "openai/gpt-image-2.5-flare-c",
    "prompt": "Modern luxury leather sofa, cinematic studio lighting, crisp double-needle topstitching, 8k resolution, pure white background #FFFFFF",
    "resolution": "2K",
    "aspectRatio": "4:3",
    "seed": 1024
  }'
```

---

## 三、调用方式 2：直接对接底层上游协议（独立系统集成）

如果您需要在外部独立项目、Python 后台或微服务中直接调用上游中转商（如 VectorEngine / RouterHub / TianToken / Google），请根据模型所用协议分别配置：

### 协议 A：gemini-nano-banana-2.1-preview (Google GenAI 协议)

* **方法**：`POST`
* **URL**：`{BASE_URL}/v1beta/models/gemini-nano-banana-2.1-preview:generateContent`
  * 如果使用官方 Google 直连：`https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1-preview:generateContent?key={API_KEY}`
  * 如果使用中转网关：Header 中携带 `Authorization: Bearer {API_KEY}`

**Header**：
```http
Content-Type: application/json
Authorization: Bearer <API_KEY>
x-goog-api-key: <API_KEY>
```

**Body 格式**：
```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "商业级意式极简真皮沙发，纯白底色，高清工业产品摄影"
        },
        {
          "inlineData": {
            "mimeType": "image/jpeg",
            "data": "<BASE64_IMAGE_DATA_IF_IMAGE_TO_IMAGE>"
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "outputFormat": "image/png",
    "outputMimeType": "image/png",
    "responseModalities": ["IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    },
    "seed": 42
  }
}
```

---

### 协议 B：gpt-image-2.5-flare-c & gpt-image-2.5-sunburst-c (OpenAI Images 协议)

这两个模型使用 OpenAI 标准图像规格，支持 **文生图 (JSON)** 与 **图生图/局部重绘 (Multipart FormData)**。

#### 1. 文生图 (Text to Image)
* **方法**：`POST`
* **URL**：`{BASE_URL}/v1/images/generations`

**Header**：
```http
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

**Body 格式**：
```json
{
  "model": "gpt-image-2.5-flare-c", 
  "prompt": "A modern minimalist Italian leather sofa, high texture, sharp stitches, commercial catalog photo, pure white background #ffffff",
  "n": 1,
  "size": "2048x1536",
  "resolution": "2K",
  "aspect_ratio": "4:3"
}
```

**分辨率与尺寸对应参考**：
* **1K 档位**：1:1 为 `1024x1024`，4:3 为 `1024x768`，16:9 为 `1792x1024`
* **2K 档位**：1:1 为 `2048x2048`，4:3 为 `2048x1536`，16:9 为 `2048x1152`
* **4K 档位**：1:1 为 `4096x4096`，4:3 为 `4096x3072`，16:9 为 `4096x2304`

#### 2. 图生图与局部重绘 (Image Edit & Inpainting)
* **方法**：`POST`
* **URL**：`{BASE_URL}/v1/images/edits`

**Header**：
```http
Authorization: Bearer <API_KEY>
Content-Type: multipart/form-data
```

**FormData 键值对表**：

| 参数字段名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | String | 是 | `gpt-image-2.5-flare-c` 或 `gpt-image-2.5-sunburst-c` |
| `prompt` | String | 是 | 重绘指导指令，例如：“将沙发扶手区域皮革换为干邑色油蜡皮” |
| `image` | File / Binary | 是 | 原图图片二进制文件（PNG 或 JPEG） |
| `mask` | File / Binary | 否 | 蒙版二值图二进制文件（PNG），透明/白色区域为需要重绘重算的区域 |
| `size` | String | 否 | 输出尺寸，如 `2048x2048`、`4096x4096` |
| `resolution` | String | 否 | `1K` / `2K` / `4K` |
| `aspect_ratio`| String | 否 | `1:1` / `4:3` / `16:9` 等 |
| `n` | Integer | 否 | 生成张数，默认填 1 |

---

## 四、返回响应格式与解析逻辑

### 1. OpenAI Images 格式解析 (Flare-c / Sunburst-c)

返回标准 OpenAI 格式，支持 `b64_json` 直接读取或 `url` 下载：
```json
{
  "created": 1788825650,
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA...",
      "url": "https://storage.cdn.example.com/images/flare_output_01.png"
    }
  ]
}
```
**解析建议**：优先读取 `data[0].b64_json`，若为空则直接发起 GET 请求下载 `data[0].url` 获取原图图片 Buffer。

### 2. Google GenAI 格式解析 (Nano Banana)

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUgAA..."
            }
          }
        ]
      }
    }
  ]
}
```
**解析建议**：提取 `candidates[0].content.parts[0].inlineData.data`（纯 Base64），前端使用 `data:${mimeType};base64,${data}` 即可直接展示与下载。

---

## 五、与外部原生接口的差异提示（必读）

按照本系统目前的接入主规则，内部各端及周边集成均统一走本网关。若直接比对上游原厂（Google Gemini 官方或 OpenAI 官方）的原始接口，本项目存在以下 **6 项关键设计规则与差异**，请开发与联调人员重点关注：

| 维度 | 外部原厂 / 标准接口常规做法 | 本系统当前主规则 (网关适配行为) | 差异说明与优势 |
|---|---|---|---|
| **1. 协议入口** | Google 使用 `generateContent`，OpenAI 使用 `/v1/images/*`，格式异构。 | **统一 JSON 网关**：统一由 `POST /api/gateway/generate-image` 接收，Content-Type 恒为 `application/json`。 | 抹平不同模型厂家的底层协议差异，前端切换模型无需重写网络请求逻辑。 |
| **2. 画幅与尺寸换算** | OpenAI 原生只认像素字符串（如 `size: "1024x1024"`），不支持自由比例；Google 仅支持特定枚举比例。 | **网关自适应双向换算**：入参仅需传 `aspectRatio`（如 `4:3`, `16:9`）与 `resolution`（如 `2K`）。网关自动通过 `computeOpenAiImageSize` 精确映射为对应的像素长宽，同时附加 `aspect_ratio` 字段。 | 避免调用方手动计算并硬编码像素分辨率，当比例设为 `Auto` 时，网关还会自动通过 Sharp 探针提取首张参考图真实尺寸对齐。 |
| **3. 多图与参考图角色** | OpenAI 官方 `/v1/images/edits` 原生仅支持传单张 `image` 二进制文件。 | **扩展多参考图与角色注入**：网关支持多达 4~16 张参考图，在构建 Multipart 表单时自动分配语义文件名（如 `01_subject_sofa.png`, `02_style_reference.png`），并在 Prompt 末尾追加 `[参考图角色与顺序]` 清单。 | 彻底突破原厂单图编辑限制，支撑空间母版复刻、单椅替换等多资产融合。 |
| **4. 统一响应包与持久化** | Google 返回嵌套的 `candidates[0].content.parts`；OpenAI 返回 `data[0].b64_json` 或临时易失效的 CDN `url`。 | **统一标准化包 (`NormalizedImageResponse`)**：最外层统一封装 `{ success: true, imageUrl, images, actualModel, points_deducted }`。 | 无论底层是何种模型，外部调用方直接读取 `res.imageUrl`（含 `data:image/...` 头）即可直接赋值给 `<img src>` 渲染，杜绝临时链接过期与结构不一致。 |
| **5. 鉴权、路由与容灾降级** | 直接携带单一静态 Token 请求单一 URL，一旦上游故障直接返回 500/504。 | **动态多租户路由与自动故障转移 (Failover)**：网关根据当前用户自动关联所属部门与 Provider，支持主通道（如 VectorEngine）异常时秒级平滑切换至备用通道（如 RouterHub）。 | 具备企业级高可用保障，免去调用端自写重试与容灾逻辑。 |
| **6. 计费门禁与长链接保活** | 外部无内置配额治理；大图生成（尤其是 4K 或复杂图生图）耗时 30~60 秒易被反向代理断开连接。 | **前置配额锁与流式心跳保活**：调用前强校验部门配额；请求处理期间服务端每 5 秒发送空格 `' '` 心跳包，并配置 `X-Accel-Buffering: no`。 | 杜绝 Nginx/Cloudflare 超时断流，同时确保生成失败时自动执行 0 扣点保护。 |

