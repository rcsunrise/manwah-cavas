export interface DeptBranding {
  title: string;
  subtitle: string;
}

const DEFAULT_BRANDING: DeptBranding = {
  title: 'AI 国内商品企划中心',
  subtitle: 'DOMESTIC PRODUCT PLANNING CENTER',
};

const RD_BRANDING: DeptBranding = {
  title: 'AI 智能研发中心',
  subtitle: 'PREMIUM FURNITURE & SPATIAL VISUALIZATION',
};

/** 从 profiles 联表查询结果里取部门名（兼容数组/对象结构） */
export function extractDeptName(deptData: unknown): string {
  if (Array.isArray(deptData)) return String(deptData[0]?.dept_name || '').trim();
  if (deptData && typeof deptData === 'object') return String((deptData as any).dept_name || '').trim();
  return '';
}

/** 按部门决定页头标题：研发中心显示“AI 智能研发中心”，其余保持默认 */
export function getDeptBranding(deptName?: string | null): DeptBranding {
  if (deptName && deptName.includes('研发')) return RD_BRANDING;
  return DEFAULT_BRANDING;
}
