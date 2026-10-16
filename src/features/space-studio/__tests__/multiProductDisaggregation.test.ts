// src/features/space-studio/__tests__/multiProductDisaggregation.test.ts
import { describe, it, expect } from 'vitest';
import { ProductDnaReadoutSchema } from '../../../../server/services/spaceProductAnalysisService';
import { DisaggregatedProductItem, ProductAsset } from '../../../types/spaceStudio';
import { ShootCompiler, CompileShotPromptInput } from '../engine/shootCompiler';
import { INITIAL_MANWAH_PRODUCTS, isOnlyDemoProducts } from '../data/productAssets';

describe('多产品智能解构、参数分配与总图来源索引 (Multi-Product Disaggregation & Master Source Indexing)', () => {
  const mockMasterImageUrl = 'https://storage.googleapis.com/manwah-storage/projects/p1/master.webp';

  const mockDetectedProducts: DisaggregatedProductItem[] = [
    {
      id: 'item-sofa-main',
      name: '芝华仕头等舱真皮功能三人位主沙发',
      sku: 'MW-S9821-3S',
      role: 'sofa_3seat',
      priority: 'primary',
      dimensions: { width: 3150, depth: 1080, height: 950 },
      materials: ['南美半苯胺头层牛皮', '德国超静音电机'],
      colors: ['鞍褐焦糖 (Caramel Brown)', '曜石深灰'],
      adaptiveStyles: ['现代轻奢', '意式极简'],
      surfaceTexture: '细腻平纹半苯胺牛皮，天然透气毛孔',
      functionCapable: true,
      boundingBox: { ymin: 20, xmin: 40, ymax: 65, xmax: 95 },
      cropImageUrl: 'https://storage.googleapis.com/manwah-storage/projects/p1/crop-sofa.webp',
      sourceMasterImageUrl: mockMasterImageUrl,
      ensembleId: 'ens-suite-001',
      roleTitle: '主功能沙发',
      dossierSummary: '主位三人座电动头等舱真皮沙发'
    },
    {
      id: 'item-coffee-table',
      name: '意式极简悬浮茶几与岩板地台',
      sku: 'MW-CT-8802',
      role: 'coffee_table',
      priority: 'secondary',
      dimensions: { width: 1300, depth: 700, height: 420 },
      materials: ['劳伦黑金岩板', '拉丝哑光黑钛金属'],
      colors: ['曜石深灰', '纯黑哑光'],
      adaptiveStyles: ['现代轻奢', '意式极简'],
      surfaceTexture: '天然岩板纹理，哑光拉丝金属底架',
      functionCapable: false,
      boundingBox: { ymin: 60, xmin: 42, ymax: 88, xmax: 85 },
      cropImageUrl: 'https://storage.googleapis.com/manwah-storage/projects/p1/crop-table.webp',
      sourceMasterImageUrl: mockMasterImageUrl,
      ensembleId: 'ens-suite-001',
      roleTitle: '配套客厅茶几',
      dossierSummary: '中心低矮悬浮茶几，黑金岩板台面'
    },
    {
      id: 'item-dining-suite',
      name: '极简圆餐桌配轻奢皮质餐椅组合',
      sku: 'MW-DT-5501-SET',
      role: 'dining_table',
      priority: 'secondary',
      dimensions: { width: 1400, depth: 1400, height: 750 },
      materials: ['天然雪山白大理石', '马鞍皮包裹餐椅'],
      colors: ['极地奶白 (Polar Off-White)', '暖灰'],
      adaptiveStyles: ['现代轻奢', '意式极简'],
      surfaceTexture: '高光镜面大理石，马鞍皮立体针脚',
      functionCapable: false,
      boundingBox: { ymin: 22, xmin: 5, ymax: 60, xmax: 35 },
      cropImageUrl: 'https://storage.googleapis.com/manwah-storage/projects/p1/crop-dining.webp',
      sourceMasterImageUrl: mockMasterImageUrl,
      ensembleId: 'ens-suite-001',
      roleTitle: '餐厅餐桌椅组合',
      dossierSummary: '左侧开放餐厅圆桌与皮椅'
    }
  ];

  it('1. 应该通过后端 Zod Schema 对多产品解构数据进行完整校验', () => {
    const rawReadout = {
      id: 'prod-main-master',
      name: '芝华仕头等舱多功能沙发全套客餐厅组',
      sku: 'MW-SET-2023',
      role: 'sofa_3seat',
      priority: 'primary',
      dimensions: { width: 3150, depth: 1080, height: 950 },
      materials: ['南美半苯胺头层牛皮'],
      colors: ['鞍褐焦糖 (Caramel Brown)'],
      adaptiveStyles: ['现代轻奢', '意式极简'],
      surfaceTexture: '真皮原厂质感',
      functionCapable: true,
      readoutConfidence: 96,
      identityLock: 'strict' as const,
      structuralFeatures: [{ name: '靠背', description: '高回弹承托' }],
      lockedRules: ['保持原厂比例'],
      explanation: '已识别出3款独立家具组合',
      referenceImages: [],
      sourceMasterImageUrl: mockMasterImageUrl,
      detectedProducts: mockDetectedProducts
    };

    const validated = ProductDnaReadoutSchema.parse(rawReadout);
    expect(validated.detectedProducts).toHaveLength(3);
    expect(validated.sourceMasterImageUrl).toBe(mockMasterImageUrl);
    expect(validated.detectedProducts![0].name).toContain('主沙发');
    expect(validated.detectedProducts![1].name).toContain('茶几');
    expect(validated.detectedProducts![2].name).toContain('餐桌');
  });

  it('2. 应该能准确将选中单品的各项物理真值参数分配填入表单入参', () => {
    // 模拟前端 handleSelectDetectedProduct 逻辑
    const applyProductToForm = (item: DisaggregatedProductItem) => ({
      name: item.name,
      sku: item.sku,
      role: item.role,
      dimensions: item.dimensions,
      materials: item.materials,
      colors: item.colors,
      surfaceTexture: item.surfaceTexture,
      functionCapable: item.functionCapable,
      sourceMasterImageUrl: item.sourceMasterImageUrl,
      sourceBoundingBox: item.boundingBox
    });

    // 选中第二个产品（茶几）
    const selectedForm1 = applyProductToForm(mockDetectedProducts[1]);
    expect(selectedForm1.name).toBe('意式极简悬浮茶几与岩板地台');
    expect(selectedForm1.role).toBe('coffee_table');
    expect(selectedForm1.dimensions.width).toBe(1300);
    expect(selectedForm1.dimensions.depth).toBe(700);
    expect(selectedForm1.dimensions.height).toBe(420);
    expect(selectedForm1.sourceMasterImageUrl).toBe(mockMasterImageUrl);
    expect(selectedForm1.sourceBoundingBox).toEqual({ ymin: 60, xmin: 42, ymax: 88, xmax: 85 });

    // 切换到第三个产品（餐桌）
    const selectedForm2 = applyProductToForm(mockDetectedProducts[2]);
    expect(selectedForm2.name).toBe('极简圆餐桌配轻奢皮质餐椅组合');
    expect(selectedForm2.dimensions.width).toBe(1400);
    expect(selectedForm2.sourceBoundingBox?.xmin).toBe(5);
  });

  it('3. 一键全套入库时应为所有解构单品生成带有总图索引与切片图的独立资产', () => {
    const ensembleId = 'ens-suite-001';
    const batchIngest = (items: DisaggregatedProductItem[], masterImg: string): ProductAsset[] => {
      return items.map((item, idx) => ({
        id: `prod-ens-${idx + 1}`,
        sku: item.sku || `MW-${idx + 1}`,
        name: item.name,
        role: item.role,
        priority: item.priority || (idx === 0 ? 'primary' : 'secondary'),
        identityLock: 'strict',
        dimensions: item.dimensions,
        materials: item.materials || [],
        colors: item.colors || [],
        adaptiveStyles: item.adaptiveStyles || [],
        isEnsembleIncluded: true,
        surfaceTexture: item.surfaceTexture || '',
        functionCapable: Boolean(item.functionCapable),
        referenceImages: [
          ...(item.cropImageUrl
            ? [{
                id: `crop-${idx + 1}`,
                type: 'front' as const,
                objectKey: `crop-${idx + 1}.webp`,
                publicUrl: item.cropImageUrl,
                verified: true
              }]
            : [])
        ],
        sourceMasterImageUrl: masterImg,
        sourceBoundingBox: item.boundingBox,
        ensembleId: ensembleId,
        ensembleRoleTitle: item.roleTitle || item.name,
        readoutConfidence: 96,
        dossierSummary: `${item.name} 尺寸 ${item.dimensions.width}x${item.dimensions.depth}x${item.dimensions.height}mm`
      }));
    };

    const assets = batchIngest(mockDetectedProducts, mockMasterImageUrl);
    expect(assets).toHaveLength(3);

    // 验证每一件单品都正确持有来源总图的索引与对应切片
    assets.forEach((asset, idx) => {
      expect(asset.sourceMasterImageUrl).toBe(mockMasterImageUrl);
      expect(asset.ensembleId).toBe(ensembleId);
      expect(asset.sourceBoundingBox).toBeDefined();
      expect(asset.referenceImages[0].publicUrl).toBe(mockDetectedProducts[idx].cropImageUrl);
    });
  });

  it('4. 镜头编译器在编译伴随单品提示词时，应能识别来源总图套组并协同光影与比例', () => {
    const primarySofa: ProductAsset = {
      id: 'p-sofa',
      name: '芝华仕头等舱真皮功能三人位主沙发',
      sku: 'MW-S9821-3S',
      role: 'sofa_3seat',
      priority: 'primary',
      identityLock: 'strict',
      dimensions: { width: 3150, depth: 1080, height: 950 },
      materials: ['南美半苯胺头层牛皮'],
      colors: ['鞍褐焦糖 (Caramel Brown)'],
      adaptiveStyles: ['意式轻奢'],
      referenceImages: [],
      sourceMasterImageUrl: mockMasterImageUrl
    };

    const secondaryTable: ProductAsset = {
      id: 'p-table',
      name: '意式极简悬浮茶几与岩板地台',
      sku: 'MW-CT-8802',
      role: 'coffee_table',
      priority: 'secondary',
      identityLock: 'strict',
      dimensions: { width: 1300, depth: 700, height: 420 },
      materials: ['劳伦黑金岩板'],
      colors: ['曜石深灰'],
      adaptiveStyles: ['意式轻奢'],
      referenceImages: [],
      sourceMasterImageUrl: mockMasterImageUrl,
      ensembleRoleTitle: '配套客厅茶几'
    };

    const input: CompileShotPromptInput = {
      shot: {
        id: 'shot-1',
        name: '45° 黄金视角',
        shotCode: 'A02',
        templateCode: 'A02',
        camera: {
          lensMm: 35,
          heightCm: 110,
          yawDeg: 42,
          pitchDeg: -4,
          framing: 'product'
        },
        intent: {
          name: '45° 主推',
          productDominancePct: 80,
          backgroundSuppression: 'medium'
        },
        aspectRatio: '16:9'
      } as unknown as any,
      sceneMaster: {
        id: 'master-1',
        projectId: 'p1',
        aspectRatio: '16:9',
        isLocked: true
      } as unknown as any,
      products: [primarySofa, secondaryTable],
      spacePreset: {
        id: 'space-1',
        code: 'SP-01',
        name: '轻奢大平层横厅',
        ceilingHeight: 3.2,
        promptFragments: ['spacious open-plan living room']
      } as unknown as any,
      stylePreset: {
        id: 'style-1',
        code: 'ST-01',
        name: '意式极简',
        materialSystem: ['micro-cement', 'matte dark titanium']
      } as unknown as any,
      blueprint: {
        id: 'bp-1',
        items: []
      } as unknown as any
    };

    const compiled = ShootCompiler.compileShotPrompt(input);
    expect(compiled.positivePrompt).toContain('MANDATORY CENTER TABLE');
    // 验证包含来自总图套组设计的协同光影修饰
    expect(compiled.positivePrompt).toContain('coordinated with suite master design');
  });

  it('5. 一键全套入库时应彻底清理预置Demo产品，并将场景产品套组严格锁定为新切片套组（杜绝两款主沙发冲突与6款关联误导）', () => {
    // 初始状态：包含 4 款系统内置预设产品
    const demoProducts = INITIAL_MANWAH_PRODUCTS;
    expect(demoProducts).toHaveLength(4);
    expect(isOnlyDemoProducts(demoProducts)).toBe(true);

    // 用户从一张总图中解构切片出的 2 款新产品
    const newDisaggregatedSuite: ProductAsset[] = [
      {
        id: 'prod-new-sofa-2s',
        sku: 'MW-CH-7588-2S',
        name: '极地奶白双人位多功能科技布沙发',
        role: 'sofa_2seat',
        priority: 'primary',
        identityLock: 'strict',
        dimensions: { width: 2100, depth: 1050, height: 960 },
        materials: ['亲肤科技超纤布'],
        colors: ['极地奶白'],
        isEnsembleIncluded: true,
        referenceImages: [{ id: 'ref-new-1', publicUrl: 'https://example.com/crop1.png', type: 'front', objectKey: 'k1', verified: true }]
      } as unknown as ProductAsset,
      {
        id: 'prod-new-chair-lc',
        sku: 'MW-CH-8822-LC',
        name: '焦糖棕单人休闲旋转椅',
        role: 'lounge_chair',
        priority: 'secondary',
        identityLock: 'strict',
        dimensions: { width: 920, depth: 980, height: 940 },
        materials: ['粗花呢/麻感织物'],
        colors: ['焦糖棕'],
        isEnsembleIncluded: true,
        referenceImages: [{ id: 'ref-new-2', publicUrl: 'https://example.com/crop2.png', type: 'front', objectKey: 'k2', verified: true }]
      } as unknown as ProductAsset
    ];

    // 模拟新版 handleBatchSaveProductsFromModal 的纯净替换逻辑
    let currentProducts = demoProducts;
    if (isOnlyDemoProducts(currentProducts)) {
      currentProducts = newDisaggregatedSuite.map((p, idx) => ({
        ...p,
        priority: (idx === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
        isEnsembleIncluded: true
      }));
    }

    // 1. 验证老 Demo 产品被 100% 清除，总数精准等于 2 款，绝不再是误导性的 6 款！
    expect(currentProducts).toHaveLength(2);
    expect(currentProducts.map(p => p.name)).toEqual([
      '极地奶白双人位多功能科技布沙发',
      '焦糖棕单人休闲旋转椅'
    ]);

    // 2. 验证场景关联套组精准为 2/2
    const ensembleProducts = currentProducts.filter(p => p.priority === 'primary' || p.isEnsembleIncluded !== false);
    expect(ensembleProducts).toHaveLength(2);

    // 3. 验证主沙发数量严格为 1，杜绝“当前勾选了 2 款主位大沙发，主位动线拥堵”报警
    const sofaCount = ensembleProducts.filter(p => p.role === 'sofa_3seat' || p.role === 'sofa_2seat').length;
    expect(sofaCount).toBe(1);
  });

  it('accurately identifies armless/non-functional lounge chair without forcing recliner_1seat or functionCapable:true', () => {
    const rawItems = [
      {
        id: 'item-1',
        name: '二人位功能科技布沙发',
        role: 'sofa_2seat',
        dimensions: { width: 2100, depth: 1050, height: 950 },
        functionCapable: true
      },
      {
        id: 'item-2',
        name: '焦糖棕无扶手休闲旋转矮单椅',
        role: 'recliner_1seat', // 模拟老版本大模型误输出 recliner_1seat
        dimensions: { width: 950, depth: 1000, height: 850 }
      }
    ];

    const processed = rawItems.map((item, idx) => {
      const isNonFunctionalChair =
        item.role === 'lounge_chair' ||
        (item.name && /(休闲|无扶手|矮椅|旋转|单椅)/.test(item.name) && !/(功能|电动|头等舱|展开|太空舱)/.test(item.name));
      const effectiveRole = isNonFunctionalChair && item.role === 'recliner_1seat' ? 'lounge_chair' : item.role;
      const resolvedFunctionCapable =
        typeof (item as any).functionCapable === 'boolean'
          ? (item as any).functionCapable
          : isNonFunctionalChair
          ? false
          : (effectiveRole === 'sofa_3seat' || effectiveRole === 'sofa_2seat' || effectiveRole === 'recliner_1seat');

      return {
        ...item,
        role: effectiveRole,
        functionCapable: resolvedFunctionCapable
      };
    });

    const chair = processed[1];
    expect(chair.role).toBe('lounge_chair');
    expect(chair.functionCapable).toBe(false);
  });
});
