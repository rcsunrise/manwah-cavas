import { describe, expect, it } from 'vitest';
import { buildFixedPosterCopy } from '../posterCopy';

describe('buildFixedPosterCopy', () => {
  it('returns undefined when nothing was entered', () => {
    expect(buildFixedPosterCopy(undefined, [])).toBeUndefined();
    expect(buildFixedPosterCopy({ title: ' ', body: '', details: [{ title: '', desc: '' }] }, ['https://a/1.jpg'])).toBeUndefined();
  });

  it('splits the body into subtitle (line 1) and inspiration (rest)', () => {
    const r = buildFixedPosterCopy({ title: '曜境', body: '墨色映光，舒展有度\n灵感源于墨黑皮纹与明亮天际的色彩对话' }, []);
    expect(r).toEqual({ name: '曜境', subtitle: '墨色映光，舒展有度', inspiration: '灵感源于墨黑皮纹与明亮天际的色彩对话' });
  });

  it('numbers detail copy by photo order and puts empty-slot copy into otherDetails', () => {
    // 第 2 格没有实拍（null），第 4 格是失效的 blob 预览，都不算实拍
    const slots = ['https://a/1.jpg', null, 'data:image/jpeg;base64,xx', 'blob:http://x/1'];
    const r = buildFixedPosterCopy(
      {
        details: [
          { title: '轻托离地', desc: '稳固支撑 · 利落收边 · 安定从容' },
          { title: '臂弯有度' },
          { desc: '分区支撑 · 分段车缝 · 贴合背脊' },
          { title: '肌理温存' }
        ]
      },
      slots
    );
    expect(r?.photoDetails).toEqual([
      { photo: 1, title: '轻托离地', desc: '稳固支撑 · 利落收边 · 安定从容' },
      { photo: 2, desc: '分区支撑 · 分段车缝 · 贴合背脊' }
    ]);
    expect(r?.otherDetails).toEqual([{ title: '臂弯有度' }, { title: '肌理温存' }]);
  });

  it('trims to the poster limits', () => {
    const r = buildFixedPosterCopy({ title: '一二三四五六' }, []);
    expect(r?.name).toBe('一二三四');
  });
});
