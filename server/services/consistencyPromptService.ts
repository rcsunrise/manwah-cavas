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

第一张图是【参考图片】（真实产品原图），第二张图是【待评估候选图片】（AI 生成的海报或场景图）。请逐项对比两张图里的沙发本体，评估各维度一致性（0~100 分），识别属于哪个 Feature 的偏离。

打分标准（按两张图里实际看到的差异打分，不要凭描述猜）：
- 95–100：几乎看不出差异
- 85–94：有轻微差异（比例、缝线走向略有不同），不影响辨认
- 70–84：有明显差异（扶手形状、靠背分段数、脚型、颜色色相与参考图有可见出入）
- 70 以下：结构或颜色已经是另一款产品

必须遵守：
1. 下面 JSON 里的 0 只是格式占位，每个 rawScore、confidence、modelConfidence 都必须按你的实际观察重新填写，不得照抄占位值，也不要把各维度都填成接近的分数。
2. 每个适用维度的 evidence 至少写一条你在图里看到的具体依据（例如“参考图靠背为三段拉点，候选图为两段”）。
3. 候选图里是场景图时，只比较沙发本体，不比较场景、灯光和抱枕等摆设。
4. 看不清或被遮挡的维度，applicable 设为 false，不要猜分数。
5. confidence 和 modelConfidence 是 0 到 1 之间的小数（如 0.75），不是百分数；rawScore 是 0 到 100 的整数。

输出如下 JSON 结构：
{
  "schemaVersion": "1.0",
  "screenRole": "${screenRole}",
  "summary": "简短总结产品特征核对结论，写明最主要的差异",
  "dimensions": [
    {
      "dimension": "silhouette",
      "applicable": true,
      "rawScore": 0,
      "confidence": 0,
      "evidence": [{ "source": "candidate", "description": "写出你在图里实际看到的依据" }],
      "violations": []
    },
    {
      "dimension": "module_structure",
      "applicable": true,
      "rawScore": 0,
      "confidence": 0,
      "evidence": [{ "source": "candidate", "description": "写出你在图里实际看到的依据" }],
      "violations": []
    },
    {
      "dimension": "armrest",
      "applicable": true,
      "rawScore": 0,
      "confidence": 0,
      "evidence": [{ "source": "candidate", "description": "写出你在图里实际看到的依据" }],
      "violations": []
    },
    {
      "dimension": "backrest_headrest",
      "applicable": true,
      "rawScore": 0,
      "confidence": 0,
      "evidence": [{ "source": "candidate", "description": "写出你在图里实际看到的依据" }],
      "violations": []
    },
    {
      "dimension": "seat_leg",
      "applicable": true,
      "rawScore": 0,
      "confidence": 0,
      "evidence": [{ "source": "candidate", "description": "写出你在图里实际看到的依据" }],
      "violations": []
    },
    {
      "dimension": "material_color",
      "applicable": true,
      "rawScore": 0,
      "confidence": 0,
      "evidence": [{ "source": "candidate", "description": "写出你在图里实际看到的依据" }],
      "violations": []
    },
    {
      "dimension": "decoration_function",
      "applicable": true,
      "rawScore": 0,
      "confidence": 0,
      "evidence": [{ "source": "candidate", "description": "写出你在图里实际看到的依据" }],
      "violations": []
    },
    {
      "dimension": "accessories",
      "applicable": true,
      "rawScore": 0,
      "confidence": 0,
      "evidence": [{ "source": "candidate", "description": "写出你在图里实际看到的依据" }],
      "violations": []
    }
  ],
  "globalViolations": [],
  "modelConfidence": 0
}`;

  return { systemInstruction, userPrompt };
}
