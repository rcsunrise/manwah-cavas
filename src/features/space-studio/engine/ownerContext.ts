// 把业主身份落到户型和提示词上：户型只保留窗的结构，窗外景由业主决定；用词从会所尺度收回到真实住宅。
import { OwnerContext, SpacePreset, StylePreset } from '../../../types/spaceStudio';
import { OUTDOOR_VIEWS, OutdoorView, OwnerPersona, SpaceElevation, getOutdoorView } from '../data/ownerPersonas';
import type { SpaceTopologyCompilation } from './spaceTopologyEngine';

const BUILT_IN_ELEVATION: Record<string, SpaceElevation> = {
  'N-R01': 'high',
  'N-R02': 'high',
  'N-R03': 'low',
  'N-R04': 'low',
  'N-R05': 'low',
  'N-R06': 'high'
};

export function getSpaceElevation(space: Pick<SpacePreset, 'code' | 'propertyType' | 'elevation'>): SpaceElevation {
  return space.elevation || BUILT_IN_ELEVATION[(space.code || '').toUpperCase()] || (space.propertyType === 'villa' || space.propertyType === 'duplex' ? 'low' : 'high');
}

export function getFeasibleViews(space: Pick<SpacePreset, 'code' | 'propertyType' | 'elevation'>): OutdoorView[] {
  const elevation = getSpaceElevation(space);
  return OUTDOOR_VIEWS.filter((view) => view.elevations.includes(elevation));
}

export interface OwnerFit {
  view: OutdoorView;
  feasibleViews: OutdoorView[];
  warning?: string;
}

/** 选窗景：优先用户指定，其次业主偏好，物理上不可能的窗景永远不会被选中 */
export function resolveOwnerFit(persona: OwnerPersona, space: SpacePreset, requestedViewId?: string | null): OwnerFit {
  const feasibleViews = getFeasibleViews(space);
  const elevation = getSpaceElevation(space);
  const requested = feasibleViews.find((view) => view.id === requestedViewId);
  const preferred = persona.views.map((id) => feasibleViews.find((view) => view.id === id)).find(Boolean);
  const view = requested || preferred || getOutdoorView(elevation === 'high' ? 'city_skyline' : 'private_garden')!;
  const floorLabel = elevation === 'high' ? '高层' : '低层或别墅';
  let warning: string | undefined;
  if (persona.preferredElevation && persona.preferredElevation !== elevation) {
    warning = `${persona.name}通常不住${floorLabel}户型，建议换一个户型。`;
  } else if (!preferred) {
    warning = `这个${floorLabel}户型看不到${persona.name}偏好的窗景，已改用「${view.label}」。`;
  }
  return { view, feasibleViews, warning };
}

export function buildOwnerContext(persona: OwnerPersona, view: OutdoorView): OwnerContext {
  return {
    ownerId: persona.id,
    ownerName: persona.name,
    viewId: view.id,
    viewLabel: view.label,
    windowViewDirective: view.directive,
    identityDirective: persona.identityDirective,
    livingPlanDirective: persona.livingPlanDirective,
    finishDirective: persona.finishDirective,
    lifeTracesDirective: persona.lifeTracesDirective,
    negativeRules: [
      'hotel lobby',
      'sales office show flat',
      'showroom staging',
      'perfectly symmetrical staged styling',
      'golden hour sunset sky',
      ...(view.id === 'city_skyline' || view.id === 'river_cbd' ? [] : ['skyscraper skyline outside the window'])
    ]
  };
}

const VIEW_VERB = /\b(?:overlooking|revealing|looking out(?: directly)? to|framing)\b/i;
const VIEW_MENTION = /skyline|skyscraper|metropolis|city horizon|bonsai|reflection pool|water mirror|golden hour|sunset|courtyard terrace/i;
const VIEW_NEGATIVE = /\bview\b|skyline|skyscraper|garden outside/i;
const VIEW_FEATURE = /天际|窗景|江景|水景|山水|园景|松|云端|夕阳/;
const VIEW_PHRASES: Array<[RegExp, string]> = [
  [/HIGH-ALTITUDE SKYLINE PENTHOUSE/, 'HIGH-FLOOR PENTHOUSE'],
  [/ORIENTAL ZEN WATER GARDEN VILLA PAVILION/, 'ORIENTAL VILLA PAVILION'],
  [/\s*overlooking high-altitude metropolis skyscraper skyline and sunset golden hour clouds/i, ''],
  [/\s*framing an outdoor serene water mirror reflection pool and majestic sculpted Japanese pine bonsai tree garden/i, ''],
  [/\s*sharing subtle reflection with the outdoor water mirror pool/i, ''],
  [/reflecting the panoramic city skyline daylight/i, 'reflecting the window daylight']
];
const SHOWROOM_WORDS: Array<[RegExp, string]> = [
  [/penthouse salon/gi, 'penthouse living room'],
  [/\bsalon\b/gi, 'living room'],
  [/\bmonumental\b/gi, 'substantial'],
  [/\bmajestic\b/gi, 'generous'],
  [/\bsoaring\b/gi, 'tall'],
  [/\baristocratic\b/gi, 'refined'],
  [/\bgrand\b/gi, 'generous']
];

const replaceAll = (text: string, rules: Array<[RegExp, string]>) => rules.reduce((out, [pattern, value]) => out.replace(pattern, value), text);
const toResidentialScale = (text: string) => replaceAll(text, SHOWROOM_WORDS);
const removeViewPhrases = (text: string) => toResidentialScale(replaceAll(text, VIEW_PHRASES));

function keepApertureOnly(text: string): string {
  const index = text.search(VIEW_VERB);
  return (index > 0 ? text.slice(0, index) : text).replace(/[\s,;:]+$/, '');
}

export function applyOwnerToTopology(base: SpaceTopologyCompilation, owner: OwnerContext): SpaceTopologyCompilation {
  return {
    topologyDirective: removeViewPhrases(base.topologyDirective),
    architecturalFocalWall: removeViewPhrases(base.architecturalFocalWall),
    flooringTopology: removeViewPhrases(base.flooringTopology),
    ceilingStructure: removeViewPhrases(base.ceilingStructure),
    windowAndOutdoorView: `${toResidentialScale(keepApertureOnly(base.windowAndOutdoorView))}, with the actual outdoor view being ${owner.windowViewDirective}`,
    negativeConstraints: base.negativeConstraints.filter((rule) => !VIEW_NEGATIVE.test(rule))
  };
}

/** 未选业主时原样返回同一个对象，已有工程的出图不受影响 */
export function applyOwnerToSpace(space: SpacePreset, persona: OwnerPersona | null, requestedViewId?: string | null): SpacePreset {
  if (!persona) return space;
  const { view } = resolveOwnerFit(persona, space, requestedViewId);
  return {
    ...space,
    ownerContext: buildOwnerContext(persona, view),
    signatureFeatures: space.signatureFeatures.filter((feature) => !VIEW_FEATURE.test(feature)),
    promptFragments: space.promptFragments
      .map((fragment) => (VIEW_MENTION.test(fragment) ? keepApertureOnly(fragment) : fragment))
      .filter((fragment) => !VIEW_MENTION.test(fragment))
      .map(toResidentialScale)
  };
}

export function buildOwnerPromptBlock(owner: OwnerContext): string {
  return `[OWNER RESIDENCE CONCEPT (业主身份：${owner.ownerName}) - this is a real lived-in home, not a showroom]
- WHO LIVES HERE: ${owner.identityDirective}.
- WINDOW VIEW (窗外景：${owner.viewLabel}; this overrides every other outdoor view mentioned in this prompt): ${owner.windowViewDirective}.
- SPACE PLANNING: ${owner.livingPlanDirective}.
- HARD FINISH ATTITUDE: ${owner.finishDirective}.
- LIVED-IN DETAILS, ONLY on background shelves and side consoles, subtle and never cluttered; never add, move or alter the hero furniture, rug or coffee tables: ${owner.lifeTracesDirective}.
- Believable residential proportions and practical storage. No people.`;
}

/** 业主偏好的美学加分，用于美学推荐排序 */
export function getOwnerStyleBoost(style: StylePreset, persona: OwnerPersona | null): number {
  if (!persona) return 0;
  if (persona.styleCodes.includes(style.code)) return 18;
  const text = [style.name, style.cityCharacter, ...(style.lifestyleTags || [])].join(' ');
  return persona.styleKeywords.test(text) ? 10 : 0;
}
