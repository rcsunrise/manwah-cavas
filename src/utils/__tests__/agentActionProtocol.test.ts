import { describe, expect, it } from 'vitest';
import { buildCanvasSummary, extractAgentActions, stripAgentActions } from '../agentActionProtocol';

describe('agentActionProtocol', () => {
  it('parses a plan block and strips it from the visible text', () => {
    const text = '好的，把详情页扩到 8 屏。\n<agent_actions>{"plan": {"actionId": "generate_plan", "params": {"screenCount": 8}}, "suggestions": [{"label": "批量渲染", "actionId": "render_all"}]}</agent_actions>';
    const result = extractAgentActions(text);
    expect(result.text).toBe('好的，把详情页扩到 8 屏。');
    expect(result.planCard?.actionId).toBe('generate_plan');
    expect(result.planCard?.params?.screenCount).toBe(8);
    expect(result.planCard?.status).toBe('pending');
    expect(result.suggestions?.[0].actionId).toBe('render_all');
  });

  it('prefers clarify over plan and drops options without an action or prompt', () => {
    const text = '要重做哪一屏？<agent_actions>{"clarify": {"question": "要重做哪一屏？", "options": [{"label": "第 2 屏", "actionId": "replan_screen", "params": {"screenIndex": 2}}, {"label": "空选项"}]}, "plan": {"actionId": "render_all"}}</agent_actions>';
    const result = extractAgentActions(text);
    expect(result.clarifyCard?.options).toHaveLength(1);
    expect(result.clarifyCard?.options[0].params?.screenIndex).toBe(2);
    expect(result.planCard).toBeUndefined();
  });

  it('ignores unknown actions, invalid params and malformed JSON', () => {
    expect(extractAgentActions('hi <agent_actions>{"plan": {"actionId": "delete_all"}}</agent_actions>').planCard).toBeUndefined();
    expect(extractAgentActions('hi <agent_actions>{"plan": {"actionId": "render_screen"}}</agent_actions>').planCard).toBeUndefined();
    expect(extractAgentActions('hi <agent_actions>{"plan": {"actionId": "generate_plan", "params": {"screenCount": 99}}}</agent_actions>').planCard?.params).toBeUndefined();
    expect(extractAgentActions('hi <agent_actions>{oops</agent_actions>')).toEqual({ text: 'hi' });
  });

  it('accepts a fenced JSON block inside the tags', () => {
    const result = extractAgentActions('ok<agent_actions>```json\n{"suggestions": [{"label": "写文案", "prompt": "写卖点文案"}]}\n```</agent_actions>');
    expect(result.suggestions?.[0].prompt).toBe('写卖点文案');
  });

  it('tolerates stray characters around the JSON (seen from gemini)', () => {
    const text = '收到。<agent_actions>{"plan": {"actionId": "generate_plan", "params": {"screenCount": 6, "aspectRatio": "3:4"}}}></agent_actions>';
    const result = extractAgentActions(text);
    expect(result.planCard?.params).toEqual({ screenCount: 6, aspectRatio: '3:4' });
  });

  it('parses an image text edit plan and requires the new text', () => {
    const ok = extractAgentActions('好的<agent_actions>{"plan": {"actionId": "edit_image_text", "params": {"oldText": "云栖", "newText": "云栖之境", "nodeId": "gen-img-1"}}}</agent_actions>');
    expect(ok.planCard?.params).toEqual({ oldText: '云栖', newText: '云栖之境', nodeId: 'gen-img-1' });
    expect(ok.planCard?.items.map(i => i.label)).toEqual(['原文', '改为']);
    const missing = extractAgentActions('好的<agent_actions>{"plan": {"actionId": "edit_image_text", "params": {"oldText": "云栖"}}}</agent_actions>');
    expect(missing.planCard).toBeUndefined();
  });

  it('carries the agreed video idea in an open_video plan', () => {
    const r = extractAgentActions(
      '建议升级为“晨光入座”<agent_actions>{"plan": {"actionId": "open_video", "params": {"videoBrief": "晨光中从客厅全景缓慢横移推进，依次展示轮廓、真皮纹理与金属底座", "focusPoints": ["浅牛油果绿真皮", "金属底座框架", "x"], "videoMode": "product_showcase"}}}</agent_actions>'
    );
    expect(r.planCard?.params?.videoBrief).toContain('晨光');
    expect(r.planCard?.params?.focusPoints).toEqual(['浅牛油果绿真皮', '金属底座框架']);
    expect(r.planCard?.items.map(i => i.label)).toEqual(['视频创意', '展示重点', '方式', '执行后']);
  });

  it('only accepts storage image urls for set_product_image', () => {
    const ok = extractAgentActions('这是沙发产品图<agent_actions>{"plan": {"actionId": "set_product_image", "params": {"imageUrl": "https://x.supabase.co/storage/v1/object/public/a/b.png"}}}</agent_actions>');
    expect(ok.planCard?.params?.imageUrl).toContain('supabase.co');
    expect(ok.planCard?.items.map(i => i.label)).toEqual(['执行后']);
    const bad = extractAgentActions('hi<agent_actions>{"plan": {"actionId": "set_product_image", "params": {"imageUrl": "javascript:alert(1)"}}}</agent_actions>');
    expect(bad.planCard).toBeUndefined();
  });

  it('carries a shot list and switches open_video to outline mode', () => {
    const r = extractAgentActions(
      '拆成3个镜头<agent_actions>{"plan": {"actionId": "open_video", "params": {"videoBrief": "客厅日光下展示黑色科技沙发", "videoShots": [{"title": "整体亮相", "durationSeconds": 5, "camera": "缓慢推近", "content": "客厅全景中沙发完整入画"}, {"title": "灯带细节", "durationSeconds": 10, "content": "扶手青蓝灯带近景"}, {"title": "坏镜头", "durationSeconds": 99, "content": "x"}], "videoRatio": "9:16"}}}</agent_actions>'
    );
    expect(r.planCard?.params?.videoStyle).toBe('outline');
    expect(r.planCard?.params?.videoShots).toHaveLength(2);
    expect(r.planCard?.params?.videoRatio).toBe('9:16');
    const labels = r.planCard?.items.map(i => i.label) || [];
    expect(labels).toContain('镜头1 · 5s');
    expect(labels).toContain('镜头2 · 10s');
  });

  it('requires an instruction for edit_image', () => {
    const ok = extractAgentActions('好的<agent_actions>{"plan": {"actionId": "edit_image", "params": {"instruction": "背景换成暖色木地板客厅，光线更柔和", "nodeId": "gen-img-node-s1-poster-1"}}}</agent_actions>');
    expect(ok.planCard?.params?.instruction).toContain('木地板');
    expect(ok.planCard?.items.map(i => i.label)).toEqual(['修改要求', '方式']);
    expect(extractAgentActions('好<agent_actions>{"plan": {"actionId": "edit_image", "params": {}}}</agent_actions>').planCard).toBeUndefined();
  });

  it('hides partially streamed tags', () => {
    expect(stripAgentActions('正文<agent_ac')).toBe('正文');
    expect(stripAgentActions('正文<agent_actions>{"pla')).toBe('正文');
    expect(stripAgentActions('a < b')).toBe('a < b');
  });
});

describe('extractAgentActions · 缺卡片兜底', () => {
  it('正文说“确认后将”但没有计划卡时，补一个“生成确认卡片”按钮', () => {
    const r = extractAgentActions('确认后将为「泊澜」更换背景。');
    expect(r.planCard).toBeUndefined();
    expect(r.suggestions?.[0]?.label).toBe('生成确认卡片');
  });
  it('有计划卡时不补按钮', () => {
    const r = extractAgentActions('确认后将改图<agent_actions>{"plan": {"actionId": "edit_image", "params": {"instruction": "背景换成湖畔现代客厅，光线柔和"}}}</agent_actions>');
    expect(r.planCard).toBeDefined();
    expect(r.suggestions).toBeUndefined();
  });
});

describe('extractAgentActions · 沙发面料海报', () => {
  it('fabric_poster 计划带版式、型号、色卡编号，并在卡片里提示出图扣点', () => {
    const r = extractAgentActions(
      '做一张面料海报<agent_actions>{"plan": {"actionId": "fabric_poster", "params": {"fabricLayout": "hero3", "fabricCode": "12800M", "fabricLabel": "2057#"}}}</agent_actions>'
    );
    expect(r.planCard?.actionId).toBe('fabric_poster');
    expect(r.planCard?.params).toMatchObject({ fabricLayout: 'hero3', fabricCode: '12800M', fabricLabel: '2057#' });
    const labels = (r.planCard?.items || []).map(i => i.label);
    expect(labels).toEqual(expect.arrayContaining(['版式', '型号', '色卡编号', '出图']));
  });
  it('非法版式被丢弃，不带参数也能出卡片', () => {
    const r = extractAgentActions('好<agent_actions>{"plan": {"actionId": "fabric_poster", "params": {"fabricLayout": "weird"}}}</agent_actions>');
    expect(r.planCard?.actionId).toBe('fabric_poster');
    expect(r.planCard?.params?.fabricLayout).toBeUndefined();
  });
});

describe('extractAgentActions · 修改面料海报', () => {
  it('fabric_edit 带抱枕、氛围图、大小等参数，卡片说明重出几张与扣点', () => {
    const r = extractAgentActions(
      '好的<agent_actions>{"plan": {"actionId": "fabric_edit", "params": {"fabricPillow": "橙色几何拼接图案", "fabricPillowScale": 1.5, "fabricMoods": [{"slot": 2, "prompt": "无人的落日海岸"}, {"slot": 9, "prompt": "越界应丢弃"}, {"slot": 3, "prompt": ""}], "fabricCode": "12800M"}}}</agent_actions>'
    );
    expect(r.planCard?.actionId).toBe('fabric_edit');
    expect(r.planCard?.params).toMatchObject({ fabricPillow: '橙色几何拼接图案', fabricPillowScale: 1.5, fabricCode: '12800M' });
    expect(r.planCard?.params?.fabricMoods).toEqual([{ slot: 2, prompt: '无人的落日海岸' }]);
    const text = JSON.stringify(r.planCard?.items);
    expect(text).toContain('重出 2 张');
    expect(text).toContain('旧版保留');
  });

  it('只改文字时提示不重新出图、不扣点；越界倍数被丢弃', () => {
    const r = extractAgentActions('行<agent_actions>{"plan": {"actionId": "fabric_edit", "params": {"fabricLabel": "2057#", "fabricPillowScale": 5}}}</agent_actions>');
    expect(r.planCard?.params?.fabricPillowScale).toBeUndefined();
    expect(JSON.stringify(r.planCard?.items)).toContain('不扣点');
  });
});

describe('buildCanvasSummary · 面料海报', () => {
  it('列出面料海报的 id、版式和每一格内容，便于智能体指定改第几格', () => {
    const summary = buildCanvasSummary({
      planSettings: {},
      nodes: [
        {
          id: 'template-poster-b-1',
          type: 'generatedImageNode',
          data: {
            imageUrl: 'x',
            templatePoster: {
              template: 'B',
              layout: 'hero3',
              code: '12595M',
              concept: {
                moodShots: [{ key: 'tall' }, { key: 'closeup' }, { key: 'ambient' }, { key: 'street' }],
                tags: { portrait: { label: '石墙靠拍' }, scene: { label: '落日海岸' }, street: { label: '水果摊' } }
              },
              assets: { pillow: 'p' }
            }
          }
        }
      ]
    } as any);
    expect(summary).toContain('template-poster-b-1');
    expect(summary).toContain('版式2');
    expect(summary).toContain('第2格场景图(落日海岸)');
    expect(summary).toContain('第3格街拍(水果摊)');
    expect(summary).toContain('有抱枕');
  });
});

describe('面料色卡海报（textile_poster / textile_edit）', () => {
  it('textile_poster 解析主面料、版式、色卡数、型号、底色，非法值被丢弃，卡片写明默认 AI 出 3 张氛围图的扣点', () => {
    const r = extractAgentActions(
      '好<agent_actions>{"plan": {"actionId": "textile_poster", "params": {"textileMain": "DSC_8837", "textileLayout": "hex", "textileSwatchCount": 5, "textileCode": "NH30425", "textileBg": "#3a4150", "textileSwatches": ["DSC_8836", ""]}}}</agent_actions>'
    );
    expect(r.planCard?.actionId).toBe('textile_poster');
    expect(r.planCard?.params).toMatchObject({
      textileMain: 'DSC_8837',
      textileLayout: 'hex',
      textileSwatchCount: 5,
      textileCode: 'NH30425',
      textileBg: '#3A4150',
      textileSwatches: ['DSC_8836']
    });
    const text = JSON.stringify(r.planCard?.items);
    expect(text).toContain('六边形');
    expect(text).toContain('AI 生成 3 张');
    expect(text).toContain('9000 点');
  });

  it('非法的版式、底色、色卡数、氛围图张数不进入 params', () => {
    const r = extractAgentActions(
      '好<agent_actions>{"plan": {"actionId": "textile_poster", "params": {"textileLayout": "triangle", "textileBg": "red", "textileSwatchCount": 9, "textileMoods": 7}}}</agent_actions>'
    );
    expect(r.planCard?.actionId).toBe('textile_poster');
    expect(r.planCard?.params).toBeUndefined();
  });

  it('textile_edit：型号传空字符串表示不显示；要氛围图时卡片提示扣点', () => {
    const r = extractAgentActions(
      '好<agent_actions>{"plan": {"actionId": "textile_edit", "params": {"textileLayout": "circle", "textileCode": "", "textileMoods": 2, "nodeId": "template-poster-c-1"}}}</agent_actions>'
    );
    expect(r.planCard?.actionId).toBe('textile_edit');
    expect(r.planCard?.params).toMatchObject({ textileLayout: 'circle', textileCode: '', textileMoods: 2, nodeId: 'template-poster-c-1' });
    const items = r.planCard?.items || [];
    expect(items.find(i => i.label === '型号')?.value).toBe('不显示');
    expect(JSON.stringify(items)).toContain('3000 点');
    expect(JSON.stringify(items)).toContain('旧版保留');
  });

  it('画布摘要列出本地素材文件夹的文件名和已生成的面料色卡海报', () => {
    const summary = buildCanvasSummary({
      dna: null,
      planSettings: {},
      nodes: [
        {
          id: 'template-poster-c-9',
          type: 'generatedImageNode',
          data: { templatePoster: { template: 'C', layout: 'circle', name: '苔原绒', code: 'NH30425', mainName: 'DSC_8837.JPG', swatchNames: ['a', 'b'], bgColor: null, moods: [] } }
        }
      ],
      localFolder: { dirName: '面料', imageCount: 83, names: ['DSC_8836.JPG', 'DSC_8837.JPG'] }
    });
    expect(summary).toContain('「面料」：83 张图片');
    expect(summary).toContain('DSC_8837.JPG');
    expect(summary).toContain('textile_poster');
    expect(summary).toContain('template-poster-c-9（圆形版；主面料 DSC_8837.JPG；3 块色卡；名称「苔原绒」；型号NH30425');
    expect(summary).toContain('textile_edit');
  });
});

describe('面料色卡海报的氛围图参数', () => {
  it('用户发的图当氛围图：只收 https / 画布资产地址，不再 AI 生成、不扣点', () => {
    const r = extractAgentActions(
      '好<agent_actions>{"plan": {"actionId": "textile_poster", "params": {"textileMain": "主色.JPG", "textileMoodUrls": ["https://x.supabase.co/a.jpg", "javascript:alert(1)", "/api/canvases/assets/b.png"]}}}</agent_actions>'
    );
    expect(r.planCard?.params?.textileMoodUrls).toEqual(['https://x.supabase.co/a.jpg', '/api/canvases/assets/b.png']);
    const text = JSON.stringify(r.planCard?.items);
    expect(text).toContain('用你发的 2 张图');
    expect(text).toContain('不扣点');
  });

  it('textileMoods=0 表示不要氛围图，卡片说明不扣点', () => {
    const r = extractAgentActions('好<agent_actions>{"plan": {"actionId": "textile_poster", "params": {"textileMoods": 0}}}</agent_actions>');
    expect(r.planCard?.params?.textileMoods).toBe(0);
    expect(JSON.stringify(r.planCard?.items)).toContain('面料特写代替');
    expect(JSON.stringify(r.planCard?.items)).toContain('不扣点');
  });
});

describe('extractAgentActions · 漏掉闭合标签', () => {
  const block = '{"plan":{"actionId":"edit_image_text","params":{"nodeId":"template-poster-a-1","oldText":"极澜","newText":"栖境"},"title":"修改标题"}}';

  it('模型漏写 </agent_actions> 时，JSON 完整仍然出确认卡片，不再出“生成确认卡片”重试按钮', () => {
    const r = extractAgentActions(`确认后将把标题改为「栖境」。\n<agent_actions>${block}`);
    expect(r.planCard?.actionId).toBe('edit_image_text');
    expect(r.planCard?.params?.newText).toBe('栖境');
    expect(r.text).toBe('确认后将把标题改为「栖境」。');
    expect((r.suggestions || []).map(s => s.label)).not.toContain('生成确认卡片');
  });

  it('JSON 不完整（流式输出到一半）时不出卡片，正文不带动作块', () => {
    const r = extractAgentActions(`确认后将把标题改为「栖境」。\n<agent_actions>{"plan":{"actionId":"edit_image_text","par`);
    expect(r.planCard).toBeUndefined();
    expect(r.text).not.toContain('agent_actions');
  });
});
