import { ProductFeatureSpec, DetailScreenRole } from '../../src/types/consistencySchema';

export const CONSISTENCY_PROMPT_VERSION = "product-consistency-v1";

export function buildConsistencyEvaluationPrompt(
  screenRole: DetailScreenRole,
  applicableFeatures: ProductFeatureSpec[]
): { systemInstruction: string; userPrompt: string } {
  const systemInstruction = `你是一位严谨的家具工业设计与质检专家。你的唯一任务是对比【参考资产图片】与【待评测候选图片】，对产品的视觉与结构身份一致性(Product Identity Consistency)进行客观评估。

评估规则：
1. 本评估不是审美或摄影评分，而是家具产品物理结构、细节、材质和形态的一致性核查。
2. 场景布景、摄影角度、灯光氛围可以变化，但产品本身的结构特征、软包造型、材质纹理与扶手靠背不可漂移。
3. 只能对当前屏幕角色 [${screenRole}] 适用的特征进行比对。
4. 不适用于当前屏幕角色的维度，必须在 dimensions 中设为 applicable = false。
   - 当 screenRole 为 MATERIAL_ONLY 时，只需评估 material_color 维度，不得因为没有沙发主体而判定 FAIL。
   - 当 screenRole 为 INSPIRATION_ONLY 时，只需评估整体调性与色彩配比，不得强制要求完整产品。
5. 当发现严重产品结构不匹配（如扶手形状改变、靠背分段数错误、主面料材质/颜色严重漂移）时，必须记录 severity = "hard" 的 violation。
6. 输出必须且只能为合规的 JSON 数据结构，严禁输出 Markdown 或自然段落。`;

  const featureSummaries = applicableFeatures.map(f => `- Feature [${f.featureId}] (${f.name}): 重要度=${f.importance}, 是否必须保留=${f.mustPreserve}, 类别=${f.category}. 描述: ${f.description}`).join('\n');

  const userPrompt = `屏幕角色: ${screenRole}
promptVersion: ${CONSISTENCY_PROMPT_VERSION}

适用于当前屏的关键 DNA 特征列表:
${featureSummaries}

请核对【参考图片】与【待评估候选图片】，评估各维度一致性（0~100 分），识别属于哪个 Feature 的偏离，并输出如下 JSON 结构：
{
  "schemaVersion": "1.0",
  "screenRole": "${screenRole}",
  "summary": "简短总结产品特征核对结论",
  "dimensions": [
    {
      "dimension": "silhouette",
      "applicable": true,
      "rawScore": 95,
      "confidence": 0.9,
      "evidence": [{ "source": "candidate", "description": "整体造型与参考图高度贴合" }],
      "violations": []
    },
    {
      "dimension": "module_structure",
      "applicable": true,
      "rawScore": 90,
      "confidence": 0.9,
      "evidence": [],
      "violations": []
    },
    {
      "dimension": "armrest",
      "applicable": true,
      "rawScore": 92,
      "confidence": 0.9,
      "evidence": [],
      "violations": []
    },
    {
      "dimension": "backrest_headrest",
      "applicable": true,
      "rawScore": 95,
      "confidence": 0.9,
      "evidence": [],
      "violations": []
    },
    {
      "dimension": "seat_leg",
      "applicable": true,
      "rawScore": 90,
      "confidence": 0.9,
      "evidence": [],
      "violations": []
    },
    {
      "dimension": "material_color",
      "applicable": true,
      "rawScore": 95,
      "confidence": 0.9,
      "evidence": [],
      "violations": []
    },
    {
      "dimension": "decoration_function",
      "applicable": true,
      "rawScore": 90,
      "confidence": 0.9,
      "evidence": [],
      "violations": []
    },
    {
      "dimension": "accessories",
      "applicable": true,
      "rawScore": 90,
      "confidence": 0.9,
      "evidence": [],
      "violations": []
    }
  ],
  "globalViolations": [],
  "modelConfidence": 0.92
}`;

  return { systemInstruction, userPrompt };
}
