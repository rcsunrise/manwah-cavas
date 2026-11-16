import { dbService } from '../services/dbService';

const LAST_UID_KEY = 'manwah_last_uid';

/** 这些前缀的本地缓存都是账号相关的画布/素材/历史，换账号登录时必须清掉 */
const ACCOUNT_PREFIXES = [
  'manwah_canvas_',
  'creative-canvas:pending-draft',
  'creative-canvas:',
  'manwah_saved_channel',
  'manwah_sb_mock_',
  'space_studio_recent_products',
  'space_studio_'
];
/** 纯界面偏好，不属于账号数据，保留 */
const KEEP_KEYS = new Set([
  'creative-canvas:agent-panel-tab',
  'creative-canvas:agent-panel-width',
  'creative-canvas:agent-input-height',
  'space_studio_theme',
  'creative-canvas:auto-dna'
]);

/**
 * 登录成功后调用：如果和上次登录的是不同账号（或没记录过），清掉浏览器里上一个账号留下的本地缓存。
 * 否则同一台电脑切换账号会读到上一个人的画布草稿、历史记录和素材。
 * 返回是否做了清理。
 */
export async function purgeAccountCachesIfUserChanged(newUserId: string | null | undefined): Promise<boolean> {
  if (!newUserId) return false;
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_UID_KEY); } catch { /* ignore */ }
  if (last === newUserId) return false;

  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || KEEP_KEYS.has(k)) continue;
      if (ACCOUNT_PREFIXES.some(p => k.startsWith(p))) doomed.push(k);
    }
    doomed.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
  } catch { /* ignore */ }
  try { await dbService.clearLocalCaches(); } catch { /* ignore */ }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  try { localStorage.setItem(LAST_UID_KEY, newUserId); } catch { /* ignore */ }
  return true;
}
