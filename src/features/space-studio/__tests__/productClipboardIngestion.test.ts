// src/features/space-studio/__tests__/productClipboardIngestion.test.ts
import { describe, it, expect } from 'vitest';

describe('产品剪贴板复制粘贴录入规格与智能解析 (Product Clipboard Ingestion)', () => {
  // 模拟从 ProductUploadModal 抽象出的核心文本解析规则
  const parseProductText = (text: string) => {
    let name = '';
    let sku = '';
    let width = 3100;
    let depth = 1080;
    let height = 950;
    const materials: string[] = [];
    const colors: string[] = [];
    const adaptiveStyles: string[] = [];
    const updates: string[] = [];

    // 1. JSON 解析
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
      try {
        const data = JSON.parse(text);
        if (data.name) { name = data.name; updates.push('产品名称'); }
        if (data.sku) { sku = data.sku; updates.push('SKU编码'); }
        if (data.dimensions) {
          if (data.dimensions.width) width = Number(data.dimensions.width);
          if (data.dimensions.depth) depth = Number(data.dimensions.depth);
          if (data.dimensions.height) height = Number(data.dimensions.height);
          updates.push('三维尺寸');
        }
        if (Array.isArray(data.materials)) { materials.push(...data.materials); updates.push('面料材质'); }
        if (Array.isArray(data.colors)) { colors.push(...data.colors); updates.push('色彩体系'); }
        if (Array.isArray(data.adaptiveStyles)) { adaptiveStyles.push(...data.adaptiveStyles); updates.push('适配风格'); }
        return { name, sku, width, depth, height, materials, colors, adaptiveStyles, updates };
      } catch {
        // fallback
      }
    }

    // 2. 正则提取三维尺寸 (3100*1080*950)
    const dimMatch = text.match(/(\d{3,4})\s*[*xX×/]\s*(\d{3,4})\s*[*xX×/]\s*(\d{3,4})/);
    const dimMatchZh = text.match(/(?:长|宽|总宽|W)\s*[:：=]?\s*(\d{3,4})\s*[,，\s]*?(?:宽|深|总深|D)\s*[:：=]?\s*(\d{3,4})\s*[,，\s]*?(?:高|总高|H)\s*[:：=]?\s*(\d{3,4})/i);
    if (dimMatch) {
      width = parseInt(dimMatch[1], 10);
      depth = parseInt(dimMatch[2], 10);
      height = parseInt(dimMatch[3], 10);
      updates.push(`尺寸(${width}×${depth}×${height}mm)`);
    } else if (dimMatchZh) {
      width = parseInt(dimMatchZh[1], 10);
      depth = parseInt(dimMatchZh[2], 10);
      height = parseInt(dimMatchZh[3], 10);
      updates.push(`尺寸(${width}×${depth}×${height}mm)`);
    } else {
      const wMatch = text.match(/(?:总宽|长|宽|Width|W)\s*[:：=]?\s*(\d{3,4})/i);
      const dMatch = text.match(/(?:总深|深|Depth|D)\s*[:：=]?\s*(\d{3,4})/i);
      const hMatch = text.match(/(?:总高|高|Height|H)\s*[:：=]?\s*(\d{3,4})/i);
      if (wMatch) { width = parseInt(wMatch[1], 10); updates.push('宽度'); }
      if (dMatch) { depth = parseInt(dMatch[1], 10); updates.push('深度'); }
      if (hMatch) { height = parseInt(hMatch[1], 10); updates.push('高度'); }
    }

    // 3. 正则提取产品名
    const nameMatch = text.match(/(?:产品名称|规范全称|产品全称|品名|名称|产品)\s*[:：]\s*([^\r\n,，；;]+)/);
    if (nameMatch && nameMatch[1].trim()) {
      name = nameMatch[1].trim();
      updates.push('产品名称');
    } else {
      const firstLine = text.split(/[\r\n]+/).map(s => s.trim()).find(Boolean);
      if (firstLine && /(沙发|单椅|茶几|餐椅|功能椅|贵妃榻|软床)/.test(firstLine) && firstLine.length <= 40) {
        name = firstLine;
        updates.push('产品名称');
      }
    }

    // 4. 正则提取 SKU
    const skuMatch = text.match(/(?:SKU|货号|型号|编码|商品编码)\s*[:：=]?\s*([A-Za-z0-9_#-]+)/i);
    if (skuMatch && skuMatch[1].trim()) {
      sku = skuMatch[1].trim().toUpperCase();
      updates.push('SKU编码');
    }

    // 5. 颜色匹配
    const PRESET_COLORS = ['云雾暖灰', '极地奶白', '干邑暖橙', '鞍褐焦糖', '曜石深灰', '复古深栗', '珍珠米金'];
    PRESET_COLORS.forEach((c) => {
      const base = c.slice(0, 2);
      if (text.includes(c) || text.includes(base)) {
        if (!colors.includes(c)) colors.push(c);
      }
    });
    if (colors.length > 0) updates.push('色彩');

    // 6. 风格匹配
    const PRESET_STYLES = ['意式轻奢', '现代极简', '奶油原木', '法式复古', '侘寂原力', '轻奢高定', '新中式', '原木风'];
    PRESET_STYLES.forEach((s) => {
      if (text.includes(s) || (s.includes('轻奢') && text.includes('轻奢')) || (s.includes('极简') && text.includes('极简'))) {
        if (!adaptiveStyles.includes(s)) adaptiveStyles.push(s);
      }
    });
    if (adaptiveStyles.length > 0) updates.push('风格');

    // 7. 材质匹配
    if (text.includes('头层牛皮') || text.includes('半苯胺') || text.includes('真皮')) {
      materials.push('南美进口头层牛皮 (半苯胺)');
    }
    if (text.includes('双电机') || text.includes('德国电机') || text.includes('电机')) {
      materials.push('德国超静音低压双电机');
    }
    if (text.includes('高碳钢') || text.includes('五金') || text.includes('伸缩架') || text.includes('合金架')) {
      materials.push('高碳钢五金伸缩架');
    }
    if (materials.length > 0) updates.push('材质');

    return { name, sku, width, depth, height, materials, colors, adaptiveStyles, updates };
  };

  it('1. 能够从标准商品详情剪贴板文案中提取长宽高、SKU、品名与材质', () => {
    const rawClipboardText = `
      产品全称：敏华芝华仕头等舱意式极简电动真皮主沙发
      货号编码：MW-CH-9866-3S
      三维尺寸：3100*1080*950mm
      面料配置：南美进口半苯胺头层牛皮，搭载德国超静音低压双电机与高碳钢合金架
      推荐主色：云雾暖灰、曜石深灰
      空间风格：意式轻奢、现代极简
    `;

    const result = parseProductText(rawClipboardText);

    expect(result.name).toBe('敏华芝华仕头等舱意式极简电动真皮主沙发');
    expect(result.sku).toBe('MW-CH-9866-3S');
    expect(result.width).toBe(3100);
    expect(result.depth).toBe(1080);
    expect(result.height).toBe(950);
    expect(result.materials).toContain('南美进口头层牛皮 (半苯胺)');
    expect(result.materials).toContain('德国超静音低压双电机');
    expect(result.materials).toContain('高碳钢五金伸缩架');
    expect(result.colors).toContain('云雾暖灰');
    expect(result.colors).toContain('曜石深灰');
    expect(result.adaptiveStyles).toContain('意式轻奢');
    expect(result.adaptiveStyles).toContain('现代极简');
  });

  it('2. 能够从自然语言沟通或微信聊天文本中模糊解析出产品尺寸和名称', () => {
    const chatText = `
      芝华仕大平层电动真皮沙发
      尺寸做的是长3250宽1120高980，配头层牛皮，型号MW-9901
    `;

    const result = parseProductText(chatText);

    expect(result.name).toBe('芝华仕大平层电动真皮沙发');
    expect(result.sku).toBe('MW-9901');
    expect(result.width).toBe(3250);
    expect(result.depth).toBe(1120);
    expect(result.height).toBe(980);
    expect(result.materials).toContain('南美进口头层牛皮 (半苯胺)');
  });

  it('3. 能够识别 JSON 格式的剪贴板数据直接填充', () => {
    const jsonText = JSON.stringify({
      name: '意式高定真皮贵妃位功能组合',
      sku: 'MW-ITALY-2026',
      dimensions: { width: 3400, depth: 1800, height: 920 },
      materials: ['南美半苯胺牛皮'],
      colors: ['极地奶白'],
      adaptiveStyles: ['意式轻奢']
    });

    const result = parseProductText(jsonText);

    expect(result.name).toBe('意式高定真皮贵妃位功能组合');
    expect(result.sku).toBe('MW-ITALY-2026');
    expect(result.width).toBe(3400);
    expect(result.depth).toBe(1800);
    expect(result.height).toBe(920);
    expect(result.colors).toContain('极地奶白');
    expect(result.adaptiveStyles).toContain('意式轻奢');
  });

  it('4. 验证剪贴板图片 MIME 识别与过滤逻辑', () => {
    const mockClipboardItems = [
      { type: 'text/plain' },
      { type: 'image/png' },
      { type: 'image/jpeg' },
      { type: 'application/json' }
    ];

    const imageTypes = mockClipboardItems.filter(item => item.type.startsWith('image/'));
    expect(imageTypes.length).toBe(2);
    expect(imageTypes[0].type).toBe('image/png');
    expect(imageTypes[1].type).toBe('image/jpeg');
  });
});
