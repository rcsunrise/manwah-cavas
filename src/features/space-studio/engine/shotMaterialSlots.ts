// 镜头素材坑位：每个镜头一张实拍素材，A00 空间母版与 A01 空间主大场景是同一个机位，共用一张。
// 素材写在镜头的 customReferenceImage 上，生成时作为参考图 1（底图）自动使用。
import { ShotInstance } from '../../../types/spaceStudio';
import { getShotDisplayCode } from '../data/shotTemplates';

const SHARED_CODES = ['A00', 'A01'];

export interface ShotMaterialSlot {
  key: string;
  label: string;
  title: string;
  shotIds: string[];
  image?: string;
}

type SlotShot = Pick<ShotInstance, 'id' | 'templateCode' | 'name' | 'customReferenceImage'> & { displayCode?: string };

export function buildShotMaterialSlots(shots: SlotShot[]): ShotMaterialSlot[] {
  const shared = shots.filter((s) => SHARED_CODES.includes(s.templateCode));
  const slots: ShotMaterialSlot[] = [];
  if (shared.length > 0) {
    slots.push({
      key: 'A00-A01',
      label: shared.map((s) => getShotDisplayCode(s)).join(' / '),
      title: shared.map((s) => s.name).join(' · '),
      shotIds: shared.map((s) => s.id),
      image: shared.map((s) => s.customReferenceImage).find(Boolean)
    });
  }
  for (const shot of shots) {
    if (SHARED_CODES.includes(shot.templateCode)) continue;
    slots.push({
      key: shot.id,
      label: getShotDisplayCode(shot),
      title: shot.name,
      shotIds: [shot.id],
      image: shot.customReferenceImage
    });
  }
  return slots;
}

/** 某个镜头所在坑位的全部镜头（A00 与 A01 互相带上） */
export function getMaterialSlotShotIds(shots: SlotShot[], shotId: string): string[] {
  return buildShotMaterialSlots(shots).find((slot) => slot.shotIds.includes(shotId))?.shotIds || [shotId];
}

/** 批量选图时按坑位顺序填入空坑位，返回每张图对应的坑位；多出来的图不分配 */
export function pickEmptySlotsForFiles(slots: ShotMaterialSlot[], fileCount: number): ShotMaterialSlot[] {
  return slots.filter((slot) => !slot.image).slice(0, fileCount);
}

/**
 * 一键生成全部：只要有任何镜头录入了素材，就只生成有素材的镜头，
 * 避免没有素材的镜头全部套用同一张产品图、得到雷同构图。
 */
export function selectBatchShotsByMaterial<T extends SlotShot>(candidates: T[], allShots: SlotShot[]): { shots: T[]; skipped: T[] } {
  if (!allShots.some((s) => s.customReferenceImage)) return { shots: candidates, skipped: [] };
  return {
    shots: candidates.filter((s) => s.customReferenceImage),
    skipped: candidates.filter((s) => !s.customReferenceImage)
  };
}

/** 素材上传到服务端文件，工程快照里只存地址，避免大图撑爆浏览器存储 */
export async function uploadShotMaterial(projectId: string, slotKey: string, file: Blob): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const objectKey = `projects/${projectId}/shot-materials/${slotKey}-${Date.now().toString(36)}.${ext}`;
  const res = await fetch(`/api/space/storage/local-upload?key=${encodeURIComponent(objectKey)}`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'image/jpeg' },
    body: file
  });
  if (!res.ok) throw new Error(`素材上传失败（${res.status}）`);
  return `/api/space/storage/local-file?key=${encodeURIComponent(objectKey)}`;
}
