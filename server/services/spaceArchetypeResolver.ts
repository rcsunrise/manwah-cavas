// 判定 A00 该套用哪一条户型 / 美学强制规则。
// 只看选中预设自己的编号和名称，不能扫描整段提示词：
// 提示词里的 "American black walnut"（材质）、"penthouse salon"（N-R01 描述）、"skyline daylight"（窗景）
// 曾让非美式风格被强加美式线框墙，让 N-R01 被当成顶层天际户型。

export type TopologyArchetype = 'sunken' | 'duplex' | 'pavilion' | 'penthouse' | null;
export type StyleArchetype = 'american' | 'french' | 'italian' | null;

const PRESET_TOPOLOGY: Record<string, TopologyArchetype> = {
  'N-R01': null,
  'N-R02': null,
  'N-R03': 'duplex',
  'N-R04': 'sunken',
  'N-R05': 'pavilion',
  'N-R06': 'penthouse'
};

export function resolveSceneArchetype(input: {
  spaceCode?: string;
  spaceName?: string;
  styleCode?: string;
  styleName?: string;
}): { topology: TopologyArchetype; style: StyleArchetype } {
  const spaceCode = (input.spaceCode || '').toUpperCase();
  const styleCode = (input.styleCode || '').toUpperCase();
  const spaceName = input.spaceName || '';
  const styleName = input.styleName || '';

  let topology: TopologyArchetype = null;
  if (spaceCode in PRESET_TOPOLOGY) {
    topology = PRESET_TOPOLOGY[spaceCode];
  } else if (!spaceCode.startsWith('AI-')) {
    // AI 户型自带结构指令；其余只有名称的自定义户型按名称判断
    if (/下沉|sunken/i.test(spaceName)) topology = 'sunken';
    else if (/挑空|复式|duplex|double.*height/i.test(spaceName)) topology = 'duplex';
    else if (/山水|pavilion|water.*garden/i.test(spaceName)) topology = 'pavilion';
    else if (/顶层|天际|会所|penthouse|skyline/i.test(spaceName)) topology = 'penthouse';
  }

  let style: StyleArchetype = null;
  if (!styleCode.startsWith('AI-')) {
    if (/美式|american/i.test(styleName)) style = 'american';
    else if (/法式|简欧|parisian|haussmann/i.test(styleName)) style = 'french';
    else if (/意式|italian|milanese/i.test(styleName)) style = 'italian';
  }

  return { topology, style };
}
