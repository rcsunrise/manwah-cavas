// server/routes/spaceHumanRoutes.ts
// MANWAH Space Studio｜03 HUMAN 人物资产识别与编排构思路由
// 人物入座出图走 /api/space/shoot/render-candidates (isHumanPass)，不在这里。

import { Router, Request, Response } from 'express';
import {
  SpaceHumanAnalysisService,
  AnalyzeModelCardRequestSchema
} from '../services/spaceHumanAnalysisService';
import {
  SpaceHumanChoreographyService,
  ChoreographLayoutRequestSchema
} from '../services/spaceHumanChoreographyService';

const router = Router();

/**
 * POST /api/space/human/analyze-model-card
 * AI 多模态人物资产卡扫描与真实身份属性提炼
 */
router.post('/analyze-model-card', async (req: Request, res: Response) => {
  try {
    const parsed = AnalyzeModelCardRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid model card payload',
        details: parsed.error.format()
      });
    }

    const userId = (req as any).user?.id || (req as any).headers?.['x-user-id'] || 'system';
    const result = await SpaceHumanAnalysisService.analyzeAndExtract(parsed.data, String(userId));

    res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    console.error('[spaceHumanRoutes] analyze-model-card error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to analyze model card'
    });
  }
});

/**
 * POST /api/space/human/choreograph-layout
 * AI 多模态空间人物编排构思与角色资产匹配
 */
router.post('/choreograph-layout', async (req: Request, res: Response) => {
  try {
    const parsed = ChoreographLayoutRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid choreograph payload',
        details: parsed.error.format()
      });
    }

    const userId = (req as any).user?.id || (req as any).headers?.['x-user-id'] || 'system';
    const result = await SpaceHumanChoreographyService.choreograph(parsed.data, String(userId));

    res.json({
      success: true,
      data: result
    });
  } catch (err: any) {
    console.error('[spaceHumanRoutes] choreograph-layout error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to choreograph human layout'
    });
  }
});

export default router;
