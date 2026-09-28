// server/routes/projectRoutes.ts
import { Router, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../../src/lib/supabase';
import { AuthenticatedRequest, AppError } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import { createServerGenAI } from '../utils/aiClient';
import { ProductVisualDNA } from '../../src/types';
import { ProjectRepository } from '../repositories/projectRepository';
import { ProductDnaRepository } from '../repositories/productDnaRepository';
import { AssetRepository } from '../repositories/assetRepository';
import { isValidUuid, newUuid, requireUuid } from '../lib/uuid';
import { persistAssetToDisk } from './canvasRoutes';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(optionalAuthenticateToken as any);

const PROJECTS_DIR = path.join(process.cwd(), '.data', 'projects');

function ensureProjectsDir() {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) {
      fs.mkdirSync(PROJECTS_DIR, { recursive: true });
    }
  } catch (e) {}
}

const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_PROJECT = {
  id: DEFAULT_PROJECT_ID,
  name: '芝华仕头等舱真皮功能沙发',
  title: '芝华仕头等舱真皮功能沙发',
  project_type: 'detail_page',
  status: 'active',
  settings: {
    targetAudience: '追求生活品质、舒适体验的家庭用户',
    brandTone: '高端、奢华、舒适、耐用、科技'
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const DEFAULT_PRODUCT_DNA: ProductVisualDNA = {
  project_id: DEFAULT_PROJECT_ID,
  schema_version: 1,
  category: '待识别家具品类',
  subcategory: '待解析细分类目',
  style: ['现代风尚'],
  primaryColor: '待提取主色',
  secondaryColors: [],
  materials: ['待提取面料与材质'],
  structuralFeatures: [
    { name: '待提取核心结构', description: '请上传产品实拍主图以完成 AI 视觉语义解析', confidence: 1.0 }
  ],
  functionalFeatures: ['功能特征提取中'],
  lockedFeatures: [
    { name: '形态与质感锁定', rule: '依据上传实拍图保持色彩、材质与产品比例一致', priority: 'critical' }
  ],
  logo: {
    visible: false,
    position: '未指定'
  },
  version: 1,
  confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

const DEFAULT_PROJECT_ASSETS = [
  {
    id: 'asset_sofa_front_01',
    project_id: DEFAULT_PROJECT_ID,
    asset_type: 'product_photo',
    storage_path: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1200&q=80',
    mime_type: 'image/jpeg',
    metadata: { angle: 'front', role: 'hero_main' },
    created_at: new Date().toISOString()
  },
  {
    id: 'asset_sofa_angle_02',
    project_id: DEFAULT_PROJECT_ID,
    asset_type: 'product_photo',
    storage_path: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
    mime_type: 'image/jpeg',
    metadata: { angle: '45_degree', role: 'three_quarter' },
    created_at: new Date().toISOString()
  },
  {
    id: 'asset_sofa_detail_03',
    project_id: DEFAULT_PROJECT_ID,
    asset_type: 'product_photo',
    storage_path: 'https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=1200&q=80',
    mime_type: 'image/jpeg',
    metadata: { angle: 'detail_texture', role: 'material_close_up' },
    created_at: new Date().toISOString()
  }
];

const inMemoryProjects = new Map<string, any>();
const inMemoryAssets = new Map<string, any[]>();
const inMemoryDna = new Map<string, ProductVisualDNA>();

// Seed default project
inMemoryProjects.set(DEFAULT_PROJECT_ID, DEFAULT_PROJECT);
inMemoryAssets.set(DEFAULT_PROJECT_ID, DEFAULT_PROJECT_ASSETS);
inMemoryDna.set(DEFAULT_PROJECT_ID, DEFAULT_PRODUCT_DNA);

function persistProjectData(projectId: string) {
  ensureProjectsDir();
  try {
    const p = inMemoryProjects.get(projectId);
    const a = inMemoryAssets.get(projectId) || [];
    const d = inMemoryDna.get(projectId) || null;
    const finalPath = path.join(PROJECTS_DIR, `${projectId}.json`);
    const tempPath = path.join(PROJECTS_DIR, `${projectId}.tmp.${Date.now()}`);
    fs.writeFileSync(tempPath, JSON.stringify({ project: p, assets: a, dna: d }, null, 2), 'utf-8');
    fs.renameSync(tempPath, finalPath);
  } catch (e) {
    console.error(`Failed to persist project ${projectId} to disk:`, e);
  }
}

function loadProjectsFromDisk() {
  ensureProjectsDir();
  try {
    const files = fs.readdirSync(PROJECTS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.project?.id) {
          inMemoryProjects.set(parsed.project.id, parsed.project);
          if (Array.isArray(parsed.assets)) {
            inMemoryAssets.set(parsed.project.id, parsed.assets);
          }
          if (parsed.dna) {
            inMemoryDna.set(parsed.project.id, parsed.dna);
          }
        }
      }
    }
  } catch (e) {}
}

loadProjectsFromDisk();

// 1. Create Project
router.post('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const rawUserId = req.user?.id || (req.headers['x-user-uuid'] as string) || (req.headers['x-user-id'] as string);
    const userId = rawUserId && isValidUuid(rawUserId) ? rawUserId : '00000000-0000-0000-0000-000000000001';
    const { name, project_type = 'detail_page', settings = {} } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new AppError('项目名称不能为空', 400, 'BAD_REQUEST');
    }

    const projectId = newUuid();
    const now = new Date().toISOString();

    const newProject = {
      id: projectId,
      user_id: userId,
      name: name.trim(),
      title: name.trim(),
      project_type,
      status: 'active',
      settings,
      created_at: now,
      updated_at: now
    };

    inMemoryProjects.set(projectId, newProject);
    persistProjectData(projectId);

    // Save to Supabase creative_projects (with local memory fallback)
    try {
      await ProjectRepository.upsertProject(newProject);
    } catch (e: any) {
      console.warn('[Projects] Supabase storage unavailable, relying on in-memory & local .data persistence:', e?.message || e);
    }

    return res.status(201).json({
      success: true,
      project: newProject
    });
  } catch (err) {
    next(err);
  }
});

// 2. List all Projects
router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectMap = new Map<string, any>();

    // 1. Load memory
    for (const p of inMemoryProjects.values()) {
      projectMap.set(p.id, p);
    }

    if (!projectMap.has(DEFAULT_PROJECT_ID)) {
      projectMap.set(DEFAULT_PROJECT_ID, DEFAULT_PROJECT);
    }

    // 2. Load from canonical creative_projects
    try {
      const dbProjects = await ProjectRepository.listProjects();
      for (const p of dbProjects) {
        projectMap.set(p.id, { ...(projectMap.get(p.id) || {}), ...p });
      }
    } catch (e) {
      // Memory fallback
    }

    const allProjects = Array.from(projectMap.values())
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    return res.json({ success: true, projects: allProjects });
  } catch (err) {
    next(err);
  }
});

// Helper function to find DNA across canonical tables and disk
export async function lookupProductDna(projectId: string): Promise<ProductVisualDNA | null> {
  // 1. Check in-memory
  let dna: any = inMemoryDna.get(projectId) || null;
  if (dna) return dna;

  // 2. Check Supabase product_dnas + product_dna_versions table
  try {
    const { data: pdnas } = await supabaseAdmin
      .from('product_dnas')
      .select('*, product_dna_versions(*)')
      .eq('project_id', projectId)
      .maybeSingle();

    if (pdnas) {
      const vers = Array.isArray(pdnas.product_dna_versions) ? pdnas.product_dna_versions : [];
      vers.sort((a: any, b: any) => (b.version_number || 0) - (a.version_number || 0));
      const latestVer = vers[0];
      if (latestVer?.dna_data) {
        const snap = latestVer.dna_data;
        dna = {
          project_id: projectId,
          schema_version: 1,
          category: snap.category || pdnas.category || '家具/客厅沙发',
          subcategory: snap.subcategory || pdnas.name || '沙发',
          style: snap.style || ['意式极简', '现代轻奢'],
          primaryColor: snap.primaryColor || '未指定主色',
          secondaryColors: snap.secondaryColors || [],
          materials: snap.materials || [],
          structuralFeatures: snap.structuralFeatures || [],
          functionalFeatures: snap.functionalFeatures || ['电动调节', '人体工学承托'],
          lockedFeatures: snap.lockedFeatures || [],
          logo: snap.logo || { visible: false },
          confirmed_at: pdnas.updated_at || pdnas.created_at || new Date().toISOString(),
          version: latestVer.version_number || 1
        };
        inMemoryDna.set(projectId, dna);
        return dna;
      }
    }
  } catch (e) {}

  // 3. Check disk
  try {
    const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed?.dna) {
        inMemoryDna.set(projectId, parsed.dna);
        return parsed.dna;
      }
    }
  } catch (e) {}

  // 4. Default sofa fallback for default project
  if (projectId === DEFAULT_PROJECT_ID || projectId.includes('default') || projectId.includes('sofa')) {
    return DEFAULT_PRODUCT_DNA;
  }

  return null;
}

// Helper to lookup assets from memory, DB, and disk
async function lookupProjectAssets(projectId: string): Promise<any[]> {
  const assetMap = new Map<string, any>();

  // 1. In-memory
  const memAssets = inMemoryAssets.get(projectId) || [];
  for (const a of memAssets) {
    if (a) assetMap.set(a.id || a.storage_path || JSON.stringify(a), a);
  }

  // 2. Canonical asset_skus + asset_versions
  try {
    const { data: skus } = await supabaseAdmin
      .from('asset_skus')
      .select('*, current_version:asset_versions(*)')
      .eq('project_id', projectId);

    if (Array.isArray(skus)) {
      for (const s of skus) {
        if (s.current_version) {
          assetMap.set(s.id, {
            id: s.id,
            project_id: projectId,
            asset_type: 'product_photo',
            storage_path: s.current_version.object_key,
            mime_type: s.current_version.mime_type,
            metadata: { scene_key: s.scene_key, name: s.name },
            created_at: s.created_at
          });
        }
      }
    }
  } catch (e) {}

  // 3. Disk
  try {
    const filePath = path.join(PROJECTS_DIR, `${projectId}.json`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.assets)) {
        for (const a of parsed.assets) {
          if (a) assetMap.set(a.id || a.storage_path, a);
        }
      }
    }
  } catch (e) {}

  // 4. Default sofa assets if empty
  if (assetMap.size === 0) {
    if (projectId === DEFAULT_PROJECT_ID || projectId.includes('default') || projectId.includes('sofa')) {
      for (const a of DEFAULT_PROJECT_ASSETS) {
        assetMap.set(a.id, { ...a, project_id: projectId });
      }
    }
  }

  const result = Array.from(assetMap.values());
  inMemoryAssets.set(projectId, result);
  return result;
}

// 3. Get single project detail with assets & DNA
router.get('/:projectId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);

    let project: any = inMemoryProjects.get(projectId) || null;
    let assets: any[] = await lookupProjectAssets(projectId);
    let dna: any = await lookupProductDna(projectId);

    try {
      const dbProj = await ProjectRepository.getProjectById(projectId);
      if (dbProj) {
        project = { ...(project || {}), ...dbProj };
      }
    } catch (e) {}

    if (!project) {
      if (projectId === DEFAULT_PROJECT_ID) {
        project = DEFAULT_PROJECT;
      } else {
        project = {
          id: projectId,
          name: '企划项目',
          project_type: 'detail_page',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
      }
    }

    inMemoryProjects.set(projectId, project);
    if (assets.length > 0) inMemoryAssets.set(projectId, assets);
    if (dna) inMemoryDna.set(projectId, dna);
    persistProjectData(projectId);

    return res.json({
      success: true,
      project,
      assets,
      productDna: dna
    });
  } catch (err) {
    next(err);
  }
});

// 4. Add asset to project
router.post('/:projectId/assets', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const rawUserId = req.user?.id || (req.headers['x-user-uuid'] as string) || (req.headers['x-user-id'] as string);
    const userId = rawUserId && isValidUuid(rawUserId) ? rawUserId : '00000000-0000-0000-0000-000000000001';
    const projectId = String(req.params.projectId);
    const { asset_type = 'product_photo', storage_path, mime_type = 'image/jpeg', width, height, metadata } = req.body;

    if (!storage_path) {
      throw new AppError('缺少图片数据 storage_path', 400, 'BAD_REQUEST');
    }

    let finalStoragePath = storage_path;
    if (typeof storage_path === 'string' && storage_path.startsWith('data:image/')) {
      const assetKey = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      persistAssetToDisk(assetKey, storage_path, mime_type);
      finalStoragePath = `/api/canvases/assets/${assetKey}`;
    }

    const asset = {
      id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      project_id: projectId,
      owner_id: userId,
      asset_type,
      storage_path: finalStoragePath,
      mime_type,
      width,
      height,
      metadata: metadata || {},
      created_at: new Date().toISOString()
    };

    const currentAssets = inMemoryAssets.get(projectId) || [];
    currentAssets.push(asset);
    inMemoryAssets.set(projectId, currentAssets);
    persistProjectData(projectId);

    return res.json({ success: true, asset });
  } catch (err) {
    next(err);
  }
});

// 4.1 Delete asset from project
router.delete('/:projectId/assets/:assetId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const assetId = String(req.params.assetId);

    const currentAssets = inMemoryAssets.get(projectId) || [];
    const filtered = currentAssets.filter(a => a.id !== assetId && a.storage_path !== assetId);
    inMemoryAssets.set(projectId, filtered);
    persistProjectData(projectId);

    return res.json({ success: true, assets: filtered });
  } catch (err) {
    next(err);
  }
});

// 5. Extract Product Visual DNA using Gemini Schema
router.post('/:projectId/product-dna/extract', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const rawUserId = req.user?.id || (req.headers['x-user-uuid'] as string) || (req.headers['x-user-id'] as string);
    const userId = rawUserId && isValidUuid(rawUserId) ? rawUserId : '00000000-0000-0000-0000-000000000001';
    const projectId = String(req.params.projectId);
    const { images = [], imageBase64List = [] } = req.body;

    const assets = await lookupProjectAssets(projectId);
    const projectImages = imageBase64List.length > 0 ? imageBase64List : (images.length > 0 ? images : assets.map(a => a.storage_path).filter(Boolean));

    let extractedData: any = null;

    try {
      const { ai, isValidKey } = await createServerGenAI(userId);
      if (ai && isValidKey && projectImages.length > 0) {
        const parts: any[] = [];
        parts.push({
          text: `你是一名敏华家居顶级工业设计总监与家具视觉工程专家。请对传入的沙发/家具实拍图进行全方位的视觉特征与产品 DNA 深度解析。

【核心研判原则 1：实事求是的色彩与材质提取（必须严格忠于原图真实像素）】
- 仔细研判输入图片中家具的主体色彩（如米白、暖灰、深灰、墨绿、驼色、橙棕、原木色等）。
- 严禁死记或先入为主套用示例颜色！必须严格根据图片中真实可见的颜色输出 primaryColor 与 secondaryColors。
- 严禁把浅灰、米白、深灰或棕色误识别为酒红或暗红！只有当产品面料本身极其确凿为酒红色/勃艮第红时才可输出酒红。

【核心研判原则 2：成组组合产品识别（极其重要，严禁主观遗漏单人单椅或配套件）】
- 仔细研判图片中是否包含多个家具单品组成的成套组合（如：3人位主功能沙发 + 1人位独立单椅组成的“3+1”组合，或主沙发+单人单椅/贵妃榻/茶几成组搭配）。
- 严禁只识别大件三人位而主观忽略掉旁边的单人位单椅！若画面中存在成组搭配，必须将整体识别为【成套组合产品 (Grouped Combination)】：
  * subcategory 必须明确标注成组形态（例如："3+1 客厅功能沙发组合" 或相应真实形态）；
  * primaryColor 提取主沙发的真实色彩；secondaryColors 必须包含单人单椅及配件的真实色彩；
  * materials 必须完整涵盖主沙发与单人椅的面料与构件（如：科技布/仿真皮、高回弹海绵、金属脚件等）；
  * structuralFeatures 必须分别清晰详述“主沙发”与“单人单椅”的真实结构特征；
  * lockedFeatures 必须加入关键规则保持组合完整性与产品真实特征。

必须输出符合以下标准 JSON 格式的数据（不要有任何 Markdown 代码块标签、多余文本或注释）：
{
  "category": "家具/客厅沙发",
  "subcategory": "产品细分类目，若为组合必须注明组合形态（如: 3+1 客厅多功能沙发组合）",
  "style": ["意式极简", "现代轻奢"],
  "primaryColor": "主色调（如: 米白色）",
  "secondaryColors": ["辅助色与搭配色（若为3+1组合必须包含单人椅颜色，如: 焦糖棕色）"],
  "materials": ["材质1", "材质2"],
  "structuralFeatures": [
    {"name": "主沙发特征", "description": "三位分段多功能高靠背、饱满云感立体扶手、黑色纤细高脚支撑"},
    {"name": "单人单椅特征(若有)", "description": "焦糖棕色独立功能单椅、包裹式人体工学靠背、一体化扶手"},
    {"name": "组合陈列形态", "description": "3+1 客厅主次座席经典轻奢成套陈列，质感与色彩和谐呼应"}
  ],
  "functionalFeatures": ["电动多角度无级调节", "贴合肩颈脊椎曲线支撑"],
  "lockedFeatures": [
    {"name": "3+1组合成套完整性", "rule": "全案策划与画面生成中必须完整保留主沙发与配套单椅两件主角，严禁主观剔除单人位", "priority": "critical"},
    {"name": "造型与材质一致性", "rule": "严格保持参考图中的沙发扶手弧度、靠背拉褶纹理、面料质感与色彩配比", "priority": "critical"}
  ]
}`
        });

        for (const img of projectImages) {
          if (typeof img === 'string' && img.startsWith('data:image')) {
            const matches = img.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              parts.push({
                inlineData: {
                  mimeType: matches[1],
                  data: matches[2]
                }
              });
            }
          } else if (typeof img === 'string' && img.length > 100) {
            // Assume it's raw base64
            parts.push({
              inlineData: {
                mimeType: 'image/jpeg',
                data: img
              }
            });
          }
        }

        const visionCandidateModels = [
          'gemini-3.6-flash',
          'gemini-3.7-flash',
          'gemini-2.5-flash',
          'gemini-3.1-flash-lite'
        ];

        let lastVisionError: any = null;
        for (const candidateModel of visionCandidateModels) {
          try {
            console.log(`[ProjectRoutes] Attempting vision DNA extraction with model: ${candidateModel}`);
            const response = await ai.models.generateContent({
              model: candidateModel,
              contents: parts
            });
            if (response.text) {
              const text = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
              const match = text.match(/\{[\s\S]*\}/);
              if (match) {
                extractedData = JSON.parse(match[0]);
                console.log(`[ProjectRoutes] Vision DNA extraction succeeded with ${candidateModel}`);
                break;
              }
            }
          } catch (modelErr: any) {
            lastVisionError = modelErr;
            console.warn(`[ProjectRoutes] Vision model ${candidateModel} failed:`, modelErr?.message || modelErr);
          }
        }

        if (!extractedData && lastVisionError) {
          console.error('[ProjectRoutes] All vision models failed to extract DNA:', lastVisionError);
        }
      }
    } catch (e) {
      console.warn('[ProjectRoutes] Gemini DNA extraction error:', e);
    }

    if (!extractedData) {
      return res.status(502).json({
        success: false,
        error: 'AI 视觉语义解析遇到临时波动，未能提取真实特征，请点击【重新分析】重试。',
        message: '视觉模型未能生成有效产品特征'
      });
    }

    const productDna: ProductVisualDNA = {
      project_id: projectId,
      schema_version: 1,
      category: extractedData.category || '家具/客厅沙发',
      subcategory: extractedData.subcategory || '电动功能真皮沙发',
      style: extractedData.style || ['意式极简', '现代轻奢'],
      primaryColor: extractedData.primaryColor || '暖灰色',
      secondaryColors: extractedData.secondaryColors || [],
      materials: extractedData.materials || ['真皮', '金属'],
      structuralFeatures: Array.isArray(extractedData.structuralFeatures)
        ? extractedData.structuralFeatures.map((f: any) => {
            if (typeof f === 'string') return { name: '核心结构', description: f };
            return { name: f?.name || '结构特征', description: f?.description || String(f || '') };
          })
        : [],
      functionalFeatures: Array.isArray(extractedData.functionalFeatures) ? extractedData.functionalFeatures.map(String) : [],
      lockedFeatures: Array.isArray(extractedData.lockedFeatures)
        ? extractedData.lockedFeatures.map((l: any) => {
            if (typeof l === 'string') return { name: '锁定项', rule: l, priority: 'critical' };
            return {
              name: l?.name || '关键特征锁定',
              rule: l?.rule || '生成海报或分屏时严禁改变产品固有特征',
              priority: l?.priority || 'critical'
            };
          })
        : [
            { name: '成套组合完整性', rule: '严禁遗漏配套单椅或组合单件', priority: 'critical' },
            { name: '靠背与扶手比例', rule: '生成海报或分屏时严禁拉伸或改变比例', priority: 'critical' }
          ],
      logo: extractedData.logo || { visible: false },
      user_corrections: {},
      version: 1,
      confirmed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    inMemoryDna.set(projectId, productDna);
    persistProjectData(projectId);

    return res.json({
      success: true,
      productDna,
      analysisSummary: '已成功从产品图谱解析出产品特征与设计语言'
    });
  } catch (err) {
    next(err);
  }
});

// 6. User PATCH corrections to Product Visual DNA
router.patch('/:projectId/product-dna', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);
    const corrections = req.body;

    let existingDna: any = inMemoryDna.get(projectId);
    if (!existingDna) {
      existingDna = await lookupProductDna(projectId);
    }

    if (!existingDna) {
      throw new AppError('尚未为该项目提取产品 DNA', 404, 'NOT_FOUND');
    }

    const updatedDna: ProductVisualDNA = {
      ...existingDna,
      ...corrections,
      user_corrections: {
        ...(existingDna.user_corrections || {}),
        ...corrections
      },
      version: (existingDna.version || 1) + 1,
      updated_at: new Date().toISOString()
    };

    inMemoryDna.set(projectId, updatedDna);
    persistProjectData(projectId);

    return res.json({ success: true, productDna: updatedDna });
  } catch (err) {
    next(err);
  }
});

// 7. Confirm Product Visual DNA
router.post('/:projectId/product-dna/confirm', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = String(req.params.projectId);

    let existingDna: any = inMemoryDna.get(projectId);
    if (!existingDna) {
      existingDna = await lookupProductDna(projectId);
    }

    if (!existingDna) {
      throw new AppError('尚未提取产品 DNA', 404, 'NOT_FOUND');
    }

    const confirmedDna = {
      ...existingDna,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    inMemoryDna.set(projectId, confirmedDna);
    persistProjectData(projectId);

    return res.json({ success: true, productDna: confirmedDna });
  } catch (err) {
    next(err);
  }
});

export { inMemoryProjects, inMemoryAssets, inMemoryDna, persistProjectData };
export default router;
