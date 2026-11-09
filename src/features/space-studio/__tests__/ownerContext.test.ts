import { describe, expect, it } from 'vitest';
import { normalizeOwnerSuggestion } from '../../../../server/services/spaceLayoutAgentService';
import { buildStudioSwapDirective } from '../../../../server/services/spaceImageGenerationService';
import { SPACE_PROTOTYPES } from '../data/spacePresets';
import { STYLE_PRESETS } from '../data/stylePresets';
import { OWNER_PERSONAS, getOwnerPersona } from '../data/ownerPersonas';
import { compileSpaceTopology } from '../engine/spaceTopologyEngine';
import { applyOwnerToSpace, buildOwnerPromptBlock, getFeasibleViews, getOwnerStyleBoost, resolveOwnerFit } from '../engine/ownerContext';

const space = (code: string) => SPACE_PROTOTYPES.find((s) => s.code === code)!;
const owner = (id: string) => getOwnerPersona(id)!;

describe('owner persona', () => {
  it('leaves the space untouched when no owner is chosen', () => {
    expect(applyOwnerToSpace(space('N-R06'), null)).toBe(space('N-R06'));
    expect(compileSpaceTopology(space('N-R06')).windowAndOutdoorView).toContain('skyline');
  });

  it('never offers a physically impossible view', () => {
    expect(getFeasibleViews(space('N-R06')).map((v) => v.id)).not.toContain('private_garden');
    expect(getFeasibleViews(space('N-R05')).map((v) => v.id)).not.toContain('city_skyline');
    expect(resolveOwnerFit(owner('entrepreneur_family'), space('N-R05'), 'city_skyline').view.id).toBe('private_garden');
  });

  it('warns when the layout does not suit the owner', () => {
    expect(resolveOwnerFit(owner('three_generation'), space('N-R06')).warning).toContain('三代同堂');
    expect(resolveOwnerFit(owner('collector_designer'), space('N-R05')).warning).toBeUndefined();
    expect(resolveOwnerFit(owner('finance_tech'), space('N-R06')).warning).toBeUndefined();
  });

  it.each(OWNER_PERSONAS.map((p) => p.id))('has a usable view on every layout for %s', (id) => {
    for (const s of SPACE_PROTOTYPES) expect(resolveOwnerFit(owner(id), s).feasibleViews).toContain(resolveOwnerFit(owner(id), s).view);
  });

  it('replaces the hard-coded penthouse sunset with the owner view', () => {
    const topology = compileSpaceTopology(applyOwnerToSpace(space('N-R06'), owner('professional_family')));
    expect(topology.windowAndOutdoorView).toContain('tree canopy');
    expect(topology.windowAndOutdoorView).not.toMatch(/sunset|skyscrapers/);
    expect(topology.topologyDirective).not.toMatch(/sunset|salon|majestic/i);
    expect(topology.negativeConstraints.join()).not.toMatch(/view|garden outside/);
  });

  it('replaces the hard-coded water garden', () => {
    const owned = applyOwnerToSpace(space('N-R05'), owner('three_generation'));
    const topology = compileSpaceTopology(owned);
    expect(topology.windowAndOutdoorView).toContain('private garden');
    expect(topology.windowAndOutdoorView).not.toMatch(/bonsai|reflection/);
    expect(topology.topologyDirective).not.toMatch(/bonsai/);
    expect(owned.promptFragments.join()).not.toMatch(/bonsai|reflection pool/);
  });

  it('keeps the owner view for AI layouts and limits lived-in details to the background', () => {
    const ai = { ...space('N-R01'), code: 'AI-R01', topology: { ...compileSpaceTopology(space('N-R01')), windowAndOutdoorView: 'south glass wall overlooking a golf course' } };
    const owned = applyOwnerToSpace(ai, owner('finance_tech'));
    expect(compileSpaceTopology(owned).windowAndOutdoorView).toBe(`south glass wall, with the actual outdoor view being ${owned.ownerContext!.windowViewDirective}`);
    expect(buildOwnerPromptBlock(owned.ownerContext!)).toContain('never add, move or alter the hero furniture');
  });

  it('puts the owner into the A00 prompt and removes the fixed penthouse view', () => {
    const spacePreset = applyOwnerToSpace(space('N-R06'), owner('professional_family'));
    const prompt = buildStudioSwapDirective({ spacePreset, stylePreset: STYLE_PRESETS[0], shotCode: 'A00' } as any);
    expect(prompt).toContain('专业人士二孩家庭');
    expect(prompt).toContain('俯瞰城市公园');
    expect(prompt).not.toContain('overlooking metropolis skyscraper skyline');
    const withoutOwner = buildStudioSwapDirective({ spacePreset: space('N-R06'), stylePreset: STYLE_PRESETS[0], shotCode: 'A00' } as any);
    expect(withoutOwner).toContain('overlooking metropolis skyscraper skyline');
    expect(withoutOwner).not.toContain('OWNER RESIDENCE CONCEPT');
  });

  it('names the owner view on derived studio swap shots only when an owner is set', () => {
    expect(buildStudioSwapDirective({ shotCode: 'A01', ownerViewLabel: '俯瞰城市公园', hasSceneMasterReference: true } as any)).toContain('窗外景为俯瞰城市公园');
    expect(buildStudioSwapDirective({ shotCode: 'A01', hasSceneMasterReference: true } as any)).not.toContain('窗外景');
  });

  it('boosts styles suited to the owner', () => {
    const zen = STYLE_PRESETS.find((s) => s.code === 'OR-04')!;
    expect(getOwnerStyleBoost(zen, owner('three_generation'))).toBeGreaterThan(getOwnerStyleBoost(zen, owner('finance_tech')));
    expect(getOwnerStyleBoost(zen, null)).toBe(0);
  });

  it('only accepts known owner suggestions from the agent', () => {
    const options = [{ id: 'a', name: 'A' }];
    expect(normalizeOwnerSuggestion({ id: 'a', reason: 'r' }, options)).toEqual({ id: 'a', reason: 'r' });
    expect(normalizeOwnerSuggestion({ id: 'x', reason: 'r' }, options)).toBeUndefined();
    expect(normalizeOwnerSuggestion(undefined, options)).toBeUndefined();
  });
});
