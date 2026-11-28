import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  buildCatalogSheet,
  catalogCandidatesRule,
  catalogTablesOf,
  findCatalogTable,
  isCoffeeTableSeries
} from '../services/posterTemplate/coffeeTableCatalog';
import { buildConceptPrompt, buildTemplateAHeroPrompt, pickCatalogTable, sanitizeConcept } from '../services/posterTemplate/posterConcept';

describe('配套茶几素材库', () => {
  it('三个系列都有茶几，且没有混进餐椅', () => {
    for (const s of ['noble', 'gentleman', 'meiju'] as const) {
      const items = catalogTablesOf(s);
      expect(items.length).toBeGreaterThan(10);
      expect(items.every(i => i.id.startsWith('ct-') && !/餐椅/.test(i.name))).toBe(true);
    }
    expect(isCoffeeTableSeries('noble')).toBe(true);
    expect(isCoffeeTableSeries('random')).toBe(false);
  });

  it('目录图按 6 列拼出全部茶几', async () => {
    const n = catalogTablesOf('gentleman').length;
    const meta = await sharp(await buildCatalogSheet('gentleman')).metadata();
    expect(meta.width).toBe(6 * 240);
    expect(meta.height).toBe(Math.ceil(n / 6) * 180);
  });

  it('构思提示词带上目录清单和编号，模型挑错时回退到没用过的款', () => {
    const items = catalogTablesOf('noble');
    const rule = catalogCandidatesRule('noble', items, [items[0].id]);
    expect(rule).toContain('贵族');
    expect(rule).toContain(`1｜${items[0].id}｜${items[0].name}`);
    expect(rule).toContain('最近已用过');

    const prompt = buildConceptPrompt({
      productImage: { data: 'x', mimeType: 'image/jpeg' },
      tableCatalog: { series: 'noble', items, sheet: { data: 'y', mimeType: 'image/jpeg' } }
    });
    expect(prompt).toContain('茶几目录');
    expect(prompt).not.toContain('卵石形大理石组合几');

    expect(pickCatalogTable(items, items[3].id)).toBe(items[3].id);
    const fallback = pickCatalogTable(items.slice(0, 2), 'pebble_nesting_brass', [items[0].id]);
    expect(fallback).toBe(items[1].id);
  });

  it('概念保留素材库茶几 id，主场景提示词要求照参考图还原', () => {
    const table = catalogTablesOf('meiju')[0];
    const concept = sanitizeConcept({ name: '晴岚', tableStyle: table.id });
    expect(concept.tableStyle).toBe(table.id);
    expect(findCatalogTable(concept.tableStyle)?.name).toBe(table.name);
    const hero = buildTemplateAHeroPrompt(concept);
    expect(hero).toContain(table.name);
    expect(hero).toContain('搭配产品参考');
    expect(hero).not.toContain('不要细金属框架');
    expect(sanitizeConcept({ name: '晴岚', tableStyle: 'ct-000' }).tableStyle).toBeUndefined();
  });
});
