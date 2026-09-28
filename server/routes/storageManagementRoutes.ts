import { Router, Request, Response } from 'express';
import { StorageManagementService } from '../services/storageManagementService';

const router = Router();

// GET /api/storage-management/scan - Scan all Supabase & disk canvas data, revisions and storage files
router.get('/scan', async (req: Request, res: Response) => {
  try {
    const result = await StorageManagementService.scanAll();
    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('[StorageManagementRoutes] Scan error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || '扫描存储资产失败'
    });
  }
});

// POST /api/storage-management/delete - Delete selected items
router.post('/delete', async (req: Request, res: Response) => {
  try {
    const { canvasIds, revisionIds, storageFiles, diskFiles } = req.body || {};
    
    if (
      (!canvasIds || canvasIds.length === 0) &&
      (!revisionIds || revisionIds.length === 0) &&
      (!storageFiles || storageFiles.length === 0) &&
      (!diskFiles || diskFiles.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        error: '未指定要删除的存储项目'
      });
    }

    const result = await StorageManagementService.deleteItems({
      canvasIds,
      revisionIds,
      storageFiles,
      diskFiles
    });

    return res.json({
      success: true,
      message: '已成功删除所选数据',
      data: result
    });
  } catch (error: any) {
    console.error('[StorageManagementRoutes] Delete error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || '删除指定存储资产失败'
    });
  }
});

// POST /api/storage-management/purge - Purge by scope (all, canvases, revisions, storage_assets, disk)
router.post('/purge', async (req: Request, res: Response) => {
  try {
    const { scope = 'all', confirm = false } = req.body || {};

    if (!confirm) {
      return res.status(400).json({
        success: false,
        error: '请确认清除操作 (confirm: true)'
      });
    }

    const result = await StorageManagementService.purgeAll(scope);

    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('[StorageManagementRoutes] Purge error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || '清除存储失败'
    });
  }
});

export default router;
