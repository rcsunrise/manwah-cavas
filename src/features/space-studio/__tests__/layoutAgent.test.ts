import { describe, expect, it } from 'vitest';
import { extractJsonObject } from '../../../../server/services/spaceLayoutAgentService';
import { compileSpaceTopology, compileStyleArchitecturalFinishes } from '../engine/spaceTopologyEngine';
import { buildAiSpace, nextAiCode, AgentLayoutResult } from '../data/customPresetLibrary';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';

const layout: AgentLayoutResult = {
  name: '南向六米复式客厅',
  nameEn: 'South Duplex',
  propertyType: 'flat',
  layoutType: 'horizontal',
  ceilingHeight: 3.1,
  zones: [{ name: '客厅', primaryAxis: 'x', coveragePercentage: 70 }],
  signatureFeatures: ['六米开间'],
  promptFragments: ['six meter bay living room'],
  topology: {
    topologyDirective: 'CUSTOM TOPOLOGY',
    architecturalFocalWall: 'wall',
    flooringTopology: 'floor',
    ceilingStructure: 'ceiling',
    windowAndOutdoorView: 'window',
    negativeConstraints: ['x']
  },
  basis: '参考图'
};

describe('AI layout agent', () => {
  it('parses JSON from fenced model output', () => {
    expect(extractJsonObject('说明\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('结果 {"a":{"b":2}} 完')).toEqual({ a: { b: 2 } });
    expect(() => extractJsonObject('没有结果')).toThrow();
  });

  it('numbers AI presets after the highest existing code', () => {
    expect(nextAiCode('AI-R', [])).toBe('AI-R01');
    expect(nextAiCode('AI-R', [{ code: 'AI-R02' }, { code: 'N-R06' }])).toBe('AI-R03');
  });

  it('uses the agent topology even when the name matches a built-in pattern', () => {
    const space = buildAiSpace(layout, [], 'test');
    expect(space.zones[0].id).toBe('living_zone');
    expect(compileSpaceTopology(space).topologyDirective).toBe('CUSTOM TOPOLOGY');
  });

  it('keeps built-in compilation for presets without agent data', () => {
    expect(compileSpaceTopology(SPACE_PROTOTYPES[0]).topologyDirective).toContain('OPEN HORIZONTAL');
    const architecture = { styleWallMoldingDirective: 'W', styleMaterialPalette: 'M', styleAtmosphericLighting: 'L', styleNegativeRules: [] };
    expect(compileStyleArchitecturalFinishes({ ...STYLE_PRESETS[0], architecture })).toEqual(architecture);
    expect(compileStyleArchitecturalFinishes(STYLE_PRESETS[0]).styleWallMoldingDirective).toContain('AMERICAN');
  });
});
