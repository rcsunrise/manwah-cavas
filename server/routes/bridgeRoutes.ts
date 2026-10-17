import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { authenticateToken } from '../middleware/auth';
import { bridgeRelayHub } from '../services/bridgeRelayHub';

const router = Router();

/**
 * 1. POST /api/bridge/pair-code
 * 生成 6 位设备绑定码 (5 分钟有效期)，设计师在桌面端 Bridge 输入以完成绑定
 */
router.post('/pair-code', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const pairCode = bridgeRelayHub.createPairCode(userId);

  return res.json({
    success: true,
    pairCode,
    expiresInSeconds: 300,
    userId
  });
});

/**
 * 2. POST /api/bridge/pair
 * 本地连接器桌面端提交配对码与设备指纹，完成双向绑定
 */
router.post('/pair', async (req, res) => {
  const { pairCode, deviceName, deviceFingerprint } = req.body;

  if (!pairCode || !deviceName) {
    return res.status(400).json({ success: false, error: '缺少 pairCode 或 deviceName' });
  }

  try {
    const result = await bridgeRelayHub.completePairing(
      pairCode.trim(),
      deviceName.trim(),
      deviceFingerprint || 'generic-workstation'
    );

    return res.json({
      success: true,
      deviceId: result.deviceId,
      deviceToken: result.deviceToken,
      userId: result.userId
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message || '配对失败' });
  }
});

/**
 * 3. GET /api/bridge/status
 * 查询当前登录设计师的 Bridge 在线状态与已授权文件夹
 */
router.get('/status', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const isOnline = bridgeRelayHub.isUserDeviceOnline(userId);
  const device = bridgeRelayHub.getUserDevice(userId);

  return res.json({
    success: true,
    isOnline,
    device: device
      ? {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          authorizedDirs: device.authorizedDirs,
          connectedAt: device.connectedAt
        }
      : null
  });
});

/**
 * 4. POST /api/bridge/search
 * 云端 Agent G 调度的本地素材检索指令，路由至当前设计师的 Bridge
 */
router.post('/search', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { query, category = 'all', limit = 8 } = req.body;

  if (!query) {
    return res.status(400).json({ success: false, error: 'Query keyword is required' });
  }

  try {
    const searchData = await bridgeRelayHub.callUserDevice(userId, 'search_local_assets', {
      query,
      category,
      limit
    });

    return res.json({
      success: true,
      data: searchData
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '检索本地素材失败' });
  }
});

/**
 * 5. POST /api/bridge/stage-asset
 * 按需将当前任务所需的单张本地素材转为云端可用 Base64
 */
router.post('/stage-asset', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { filePath } = req.body;

  if (!filePath) {
    return res.status(400).json({ success: false, error: 'filePath is required' });
  }

  try {
    const filePayload = await bridgeRelayHub.callUserDevice(userId, 'stage_file_upload', {
      filePath
    });

    return res.json({
      success: true,
      file: filePayload
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '按需读取本地素材失败' });
  }
});

/**
 * 6. POST /api/bridge/export
 * 将审核通过的交付物写回本地目录
 */
router.post('/export', authenticateToken as any, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { exportType, deliverableData, subfolder } = req.body;

  try {
    const exportResult = await bridgeRelayHub.callUserDevice(userId, 'export_file_to_local', {
      exportType,
      deliverableData,
      subfolder
    });

    return res.json({
      success: true,
      result: exportResult
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || '导出至本地目录失败' });
  }
});

export default router;
