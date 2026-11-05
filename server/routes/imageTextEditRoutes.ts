// server/routes/imageTextEditRoutes.ts
import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { optionalAuthenticateToken } from '../middleware/auth';
import { editImageText } from '../services/imageTextEditService';

const router = Router();

/**
 * POST /api/image-text-edit
 * 修改图中已有文字（如海报标题），只重绘文字区域，其余像素保持原图。
 * body: { imageUrl, newText, oldText? }
 */
router.post('/', optionalAuthenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const { imageUrl, newText, oldText } = req.body || {};
  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ success: false, error: '缺少要修改的图片 (imageUrl)' });
  }
  if (!newText || typeof newText !== 'string' || !newText.trim()) {
    return res.status(400).json({ success: false, error: '缺少要改成的文字 (newText)' });
  }
  try {
    const result = await editImageText({
      imageUrl,
      newText,
      oldText: typeof oldText === 'string' ? oldText : undefined,
      userId: req.user?.id
    });
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.warn('[ImageTextEditRoutes] edit failed:', err?.message || err);
    return res.status(422).json({ success: false, error: err?.message || '改字失败' });
  }
});

export default router;
