// src/config/posterTemplates.ts
import { PosterTemplate, TemplateId, PosterRole } from '../types/posterTemplate';

export const POSTER_TEMPLATES: Record<TemplateId, PosterTemplate> = {
  'hero-editorial': {
    templateId: 'hero-editorial',
    name: '品牌主视觉 / 典藏封面',
    description: '顶部品牌标与尊享大标题，居中高质感大主图，底部尊荣口号与认证标签。',
    suggestedRoles: ['01_brand_hero', '09_brand_closing_cta'],
    imageFrames: [
      {
        key: 'main_hero_image',
        x: 60,
        y: 420,
        width: 1980,
        height: 2060,
        fitMode: 'cover',
        defaultFocalPoint: { x: 0.5, y: 0.5 }
      }
    ],
    textSlots: [
      {
        role: 'eyebrow',
        label: '品牌/系列标',
        defaultText: 'MANWAH 敏华家居 · 头等舱旗舰系列',
        x: 100,
        y: 110,
        width: 1900,
        height: 60,
        fontToken: 'brand-eyebrow',
        fontSize: 34,
        fontWeight: 600,
        color: '#9B7347',
        textAlign: 'center',
        maxLines: 1
      },
      {
        role: 'headline',
        label: '主标题',
        defaultText: '头等舱般的奢适享受，重新定义客厅美学',
        x: 100,
        y: 180,
        width: 1900,
        height: 120,
        fontToken: 'display-headline',
        fontSize: 80,
        fontWeight: 900,
        color: '#1A1817',
        textAlign: 'center',
        maxLines: 2
      },
      {
        role: 'subheadline',
        label: '副标题',
        defaultText: '进口头层牛皮 · 智能电动多档伸展 · 人体工学七区支撑',
        x: 100,
        y: 320,
        width: 1900,
        height: 70,
        fontToken: 'editorial-subhead',
        fontSize: 38,
        fontWeight: 500,
        color: '#5A5652',
        textAlign: 'center',
        maxLines: 1
      },
      {
        role: 'cta',
        label: '底部标语 / 认证',
        defaultText: '连续多年全球功能沙发销量引领 · 全国联保 终身维保',
        x: 120,
        y: 2570,
        width: 1860,
        height: 110,
        fontToken: 'cta-pill',
        fontSize: 36,
        fontWeight: 700,
        color: '#FFFFFF',
        textAlign: 'center',
        maxLines: 1
      }
    ],
    decorationSlots: [
      {
        type: 'gradient',
        x: 60,
        y: 2420,
        width: 1980,
        height: 300,
        props: { from: 'rgba(26,24,23,0)', to: 'rgba(26,24,23,0.85)' }
      },
      {
        type: 'shape',
        x: 950,
        y: 80,
        width: 200,
        height: 6,
        props: { color: '#9B7347', radius: 3 }
      }
    ]
  },

  'feature-cards': {
    templateId: 'feature-cards',
    name: '核心卖点矩阵',
    description: '顶部大图展示核心产品，下半部卡片式呈现三大核心功能卖点与结构解构。',
    suggestedRoles: ['02_core_selling_point'],
    imageFrames: [
      {
        key: 'feature_hero_frame',
        x: 100,
        y: 350,
        width: 1900,
        height: 1350,
        fitMode: 'cover',
        defaultFocalPoint: { x: 0.5, y: 0.5 }
      }
    ],
    textSlots: [
      {
        role: 'eyebrow',
        label: '顶部分类',
        defaultText: 'CORE SELLING POINTS · 核心科技',
        x: 120,
        y: 100,
        width: 1860,
        height: 50,
        fontToken: 'brand-eyebrow',
        fontSize: 32,
        fontWeight: 600,
        color: '#9B7347',
        textAlign: 'left',
        maxLines: 1
      },
      {
        role: 'headline',
        label: '核心主标',
        defaultText: '三大维度的科技进化，专为极度舒适而生',
        x: 120,
        y: 160,
        width: 1860,
        height: 100,
        fontToken: 'display-headline',
        fontSize: 74,
        fontWeight: 800,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 1
      },
      {
        role: 'subheadline',
        label: '核心副标',
        defaultText: '每一次躺靠，皆是敏华32年人体工学工程的精密结晶',
        x: 120,
        y: 270,
        width: 1860,
        height: 60,
        fontToken: 'editorial-subhead',
        fontSize: 36,
        fontWeight: 400,
        color: '#6A6662',
        textAlign: 'left',
        maxLines: 1
      },
      {
        role: 'selling_point',
        label: '卖点1',
        defaultText: '01 进口头层摔纹牛皮\n触感温润细腻，天然透气微孔，越用越有光泽',
        x: 120,
        y: 1770,
        width: 580,
        height: 380,
        fontToken: 'feature-card-text',
        fontSize: 32,
        fontWeight: 700,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 4
      },
      {
        role: 'selling_point',
        label: '卖点2',
        defaultText: '02 德国精工超静音电机\n无级平滑变频调速，运行分贝低于45dB，丝滑无震动',
        x: 760,
        y: 1770,
        width: 580,
        height: 380,
        fontToken: 'feature-card-text',
        fontSize: 32,
        fontWeight: 700,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 4
      },
      {
        role: 'selling_point',
        label: '卖点3',
        defaultText: '03 七区人体工学承托\n头颈/背/腰/臀/腿各就其位，分散98%脊柱压力',
        x: 1400,
        y: 1770,
        width: 580,
        height: 380,
        fontToken: 'feature-card-text',
        fontSize: 32,
        fontWeight: 700,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 4
      },
      {
        role: 'body',
        label: '品质承诺',
        defaultText: '通过国际权威 SGS 100,000次伸展耐久度测试，合金钢架承重高达 160kg',
        x: 120,
        y: 2280,
        width: 1860,
        height: 380,
        fontToken: 'body-text',
        fontSize: 34,
        fontWeight: 400,
        color: '#4A4642',
        textAlign: 'left',
        maxLines: 3
      }
    ],
    decorationSlots: [
      {
        type: 'shape',
        x: 100,
        y: 1740,
        width: 610,
        height: 440,
        props: { color: '#F7F4EF', radius: 16 }
      },
      {
        type: 'shape',
        x: 745,
        y: 1740,
        width: 610,
        height: 440,
        props: { color: '#F7F4EF', radius: 16 }
      },
      {
        type: 'shape',
        x: 1390,
        y: 1740,
        width: 610,
        height: 440,
        props: { color: '#F7F4EF', radius: 16 }
      }
    ]
  },

  'lifestyle-story': {
    templateId: 'lifestyle-story',
    name: '家居生活场景 / 沉浸故事',
    description: '顶部大幅全景家居生活场景，下半部分讲述温馨生活氛围与居家身心沉浸。',
    suggestedRoles: ['03_lifestyle_scene', '07_comfort_experience'],
    imageFrames: [
      {
        key: 'lifestyle_scene_frame',
        x: 0,
        y: 0,
        width: 2100,
        height: 1950,
        fitMode: 'cover',
        defaultFocalPoint: { x: 0.5, y: 0.5 }
      }
    ],
    textSlots: [
      {
        role: 'eyebrow',
        label: '场景标签',
        defaultText: 'LIVING ROOM INSPIRATION · 归家治愈时刻',
        x: 140,
        y: 2020,
        width: 1820,
        height: 50,
        fontToken: 'brand-eyebrow',
        fontSize: 32,
        fontWeight: 600,
        color: '#9B7347',
        textAlign: 'left',
        maxLines: 1
      },
      {
        role: 'headline',
        label: '生活主标',
        defaultText: '卸下一天的疲惫，在静谧中找回生活的松弛感',
        x: 140,
        y: 2090,
        width: 1820,
        height: 100,
        fontToken: 'display-headline',
        fontSize: 72,
        fontWeight: 800,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 1
      },
      {
        role: 'body',
        label: '故事文案',
        defaultText: '温暖的暖色调灯光下，手捧一本好书或享受一部老电影。一键调节至135°半躺模式，包裹感的羽绒靠包温柔托住脊背，让家成为身心真正得以休憩的庇护所。',
        x: 140,
        y: 2210,
        width: 1820,
        height: 250,
        fontToken: 'editorial-body',
        fontSize: 36,
        fontWeight: 400,
        color: '#4A4642',
        textAlign: 'left',
        maxLines: 3
      },
      {
        role: 'subheadline',
        label: '氛围金句',
        defaultText: '“不仅仅是一张沙发，更是全家人享受温情的精神岛屿。”',
        x: 140,
        y: 2500,
        width: 1820,
        height: 150,
        fontToken: 'quote-text',
        fontSize: 40,
        fontWeight: 600,
        color: '#82592B',
        textAlign: 'left',
        maxLines: 2
      }
    ],
    decorationSlots: [
      {
        type: 'gradient',
        x: 0,
        y: 1750,
        width: 2100,
        height: 220,
        props: { from: 'rgba(247,244,239,0)', to: '#F7F4EF' }
      }
    ]
  },

  'function-sequence': {
    templateId: 'function-sequence',
    name: '功能演示 / 多档角度序列',
    description: '顶部标题，中部大幅动态演示图，底部并列展现 110°坐姿/135°追剧/160°平躺三大模式。',
    suggestedRoles: ['04_function_demo', '05_action_sequence'],
    imageFrames: [
      {
        key: 'function_demo_frame',
        x: 100,
        y: 350,
        width: 1900,
        height: 1420,
        fitMode: 'cover',
        defaultFocalPoint: { x: 0.5, y: 0.5 }
      }
    ],
    textSlots: [
      {
        role: 'eyebrow',
        label: '功能说明',
        defaultText: 'SMART RECLINING SYSTEM · 多档伸展系统',
        x: 100,
        y: 100,
        width: 1900,
        height: 50,
        fontToken: 'brand-eyebrow',
        fontSize: 32,
        fontWeight: 600,
        color: '#9B7347',
        textAlign: 'center',
        maxLines: 1
      },
      {
        role: 'headline',
        label: '功能主标',
        defaultText: '110°至160°自由定格，定制专属舒适角度',
        x: 100,
        y: 160,
        width: 1900,
        height: 100,
        fontToken: 'display-headline',
        fontSize: 72,
        fontWeight: 800,
        color: '#1A1817',
        textAlign: 'center',
        maxLines: 1
      },
      {
        role: 'subheadline',
        label: '功能副标',
        defaultText: '微调按键触手可及 · 自带USB快速充电接口 · 智能防夹安全防护',
        x: 100,
        y: 270,
        width: 1900,
        height: 60,
        fontToken: 'editorial-subhead',
        fontSize: 34,
        fontWeight: 500,
        color: '#6A6662',
        textAlign: 'center',
        maxLines: 1
      },
      {
        role: 'selling_point',
        label: '模式1',
        defaultText: '【110° 阅览模式】\n端正坐姿，颈椎轻托\n适合办公会客与阅读',
        x: 120,
        y: 1850,
        width: 560,
        height: 380,
        fontToken: 'feature-card-text',
        fontSize: 32,
        fontWeight: 700,
        color: '#1A1817',
        textAlign: 'center',
        maxLines: 4
      },
      {
        role: 'selling_point',
        label: '模式2',
        defaultText: '【135° 观影模式】\n腰背微仰，脚踏升起\n家庭影院的最佳视角',
        x: 770,
        y: 1850,
        width: 560,
        height: 380,
        fontToken: 'feature-card-text',
        fontSize: 32,
        fontWeight: 700,
        color: '#1A1817',
        textAlign: 'center',
        maxLines: 4
      },
      {
        role: 'selling_point',
        label: '模式3',
        defaultText: '【160° 小憩模式】\n近乎平躺，释放全身压力\n午间小憩，迅速恢复充沛精力',
        x: 1420,
        y: 1850,
        width: 560,
        height: 380,
        fontToken: 'feature-card-text',
        fontSize: 32,
        fontWeight: 700,
        color: '#1A1817',
        textAlign: 'center',
        maxLines: 4
      },
      {
        role: 'body',
        label: '技术细节',
        defaultText: '伸展机械臂采用高强度冷轧碳素钢制成，终身免维护润滑轴承，开合平顺静音。',
        x: 120,
        y: 2330,
        width: 1860,
        height: 350,
        fontToken: 'body-text',
        fontSize: 32,
        fontWeight: 400,
        color: '#5A5652',
        textAlign: 'center',
        maxLines: 3
      }
    ],
    decorationSlots: [
      {
        type: 'shape',
        x: 100,
        y: 1820,
        width: 600,
        height: 440,
        props: { color: '#F7F4EF', radius: 16 }
      },
      {
        type: 'shape',
        x: 750,
        y: 1820,
        width: 600,
        height: 440,
        props: { color: '#F7F4EF', radius: 16 }
      },
      {
        type: 'shape',
        x: 1400,
        y: 1820,
        width: 600,
        height: 440,
        props: { color: '#F7F4EF', radius: 16 }
      }
    ]
  },

  'material-detail': {
    templateId: 'material-detail',
    name: '材质细节 / 微距微观剖析',
    description: '顶部大幅高精微距材质特写，底部并列展现牛皮甄选、高弹海绵与走线工艺。',
    suggestedRoles: ['06_material_detail'],
    imageFrames: [
      {
        key: 'material_macro_frame',
        x: 100,
        y: 100,
        width: 1900,
        height: 1650,
        fitMode: 'cover',
        defaultFocalPoint: { x: 0.5, y: 0.5 }
      }
    ],
    textSlots: [
      {
        role: 'eyebrow',
        label: '材质标签',
        defaultText: 'PREMIUM MATERIALS · 匠心甄选材质',
        x: 140,
        y: 1810,
        width: 1820,
        height: 50,
        fontToken: 'brand-eyebrow',
        fontSize: 32,
        fontWeight: 700,
        color: '#9B7347',
        textAlign: 'left',
        maxLines: 1
      },
      {
        role: 'headline',
        label: '材质主标',
        defaultText: '严苛甄选头层摔纹牛皮，每一次触碰皆是温润与奢雅',
        x: 140,
        y: 1870,
        width: 1820,
        height: 100,
        fontToken: 'display-headline',
        fontSize: 70,
        fontWeight: 800,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 1
      },
      {
        role: 'selling_point',
        label: '皮料解析',
        defaultText: '【甄选南美进口头层牛皮】\n保留天然原皮肌理，触感细腻弹润，经32道无害鞣制工艺，透气耐磨无异味。',
        x: 140,
        y: 2000,
        width: 880,
        height: 320,
        fontToken: 'feature-card-text',
        fontSize: 32,
        fontWeight: 600,
        color: '#2C2A29',
        textAlign: 'left',
        maxLines: 4
      },
      {
        role: 'selling_point',
        label: '填充与骨架',
        defaultText: '【高密度高回弹海绵座包】\n45D加厚一体成型，兼顾初坐的柔软包裹与持久支撑，久坐不塌陷，十年质保。',
        x: 1080,
        y: 2000,
        width: 880,
        height: 320,
        fontToken: 'feature-card-text',
        fontSize: 32,
        fontWeight: 600,
        color: '#2C2A29',
        textAlign: 'left',
        maxLines: 4
      },
      {
        role: 'body',
        label: '环保与缝线',
        defaultText: '采用德国高强韧膨体缝纫线，双针压线工艺严谨工整；全胶水符合国家十环环保认证。',
        x: 140,
        y: 2370,
        width: 1820,
        height: 300,
        fontToken: 'body-text',
        fontSize: 32,
        fontWeight: 400,
        color: '#6A6662',
        textAlign: 'left',
        maxLines: 3
      }
    ],
    decorationSlots: [
      {
        type: 'shape',
        x: 100,
        y: 1970,
        width: 920,
        height: 360,
        props: { color: '#F7F4EF', radius: 16 }
      },
      {
        type: 'shape',
        x: 1050,
        y: 1970,
        width: 950,
        height: 360,
        props: { color: '#F7F4EF', radius: 16 }
      }
    ]
  },

  'specification-board': {
    templateId: 'specification-board',
    name: '参数规格 / 尺寸规格板',
    description: '顶部尺寸示意三视图（contain 模式留白），中部详细规格矩阵，底部配送保障。',
    suggestedRoles: ['08_specification_board', '09_brand_closing_cta'],
    imageFrames: [
      {
        key: 'product_spec_contain_frame',
        x: 150,
        y: 320,
        width: 1800,
        height: 1120,
        fitMode: 'contain',
        defaultFocalPoint: { x: 0.5, y: 0.5 }
      }
    ],
    textSlots: [
      {
        role: 'eyebrow',
        label: '规格标签',
        defaultText: 'SPECIFICATIONS · 产品尺寸与技术参数',
        x: 100,
        y: 100,
        width: 1900,
        height: 50,
        fontToken: 'brand-eyebrow',
        fontSize: 32,
        fontWeight: 600,
        color: '#9B7347',
        textAlign: 'center',
        maxLines: 1
      },
      {
        role: 'headline',
        label: '规格主标',
        defaultText: '精细尺寸规划，适配多元户型客厅空间',
        x: 100,
        y: 160,
        width: 1900,
        height: 100,
        fontToken: 'display-headline',
        fontSize: 70,
        fontWeight: 800,
        color: '#1A1817',
        textAlign: 'center',
        maxLines: 1
      },
      {
        role: 'spec_item',
        label: '整体尺寸',
        defaultText: '【整体尺寸】\n单人位：长 96cm × 宽 98cm × 高 104cm\n三人位：长 218cm × 宽 98cm × 高 104cm',
        x: 140,
        y: 1510,
        width: 880,
        height: 200,
        fontToken: 'spec-block',
        fontSize: 32,
        fontWeight: 600,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 3
      },
      {
        role: 'spec_item',
        label: '座包尺寸',
        defaultText: '【座包与展开深度】\n座宽 58cm · 座深 56cm · 座高 48cm\n完全展开总深度 165cm（离墙需预留 8cm）',
        x: 1080,
        y: 1510,
        width: 880,
        height: 200,
        fontToken: 'spec-block',
        fontSize: 32,
        fontWeight: 600,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 3
      },
      {
        role: 'spec_item',
        label: '材质参数',
        defaultText: '【主要面料与框架】\n接触面：进口头层摔纹牛皮 / 仿皮侧后包\n骨架：优质俄罗斯落叶松 + 冷轧高碳钢架',
        x: 140,
        y: 1750,
        width: 880,
        height: 200,
        fontToken: 'spec-block',
        fontSize: 32,
        fontWeight: 600,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 3
      },
      {
        role: 'spec_item',
        label: '电气参数',
        defaultText: '【电机与电源输入】\n工作电压：DC 29V 安全低压输入\n额定功率：58W / 待机功耗低于 0.5W',
        x: 1080,
        y: 1750,
        width: 880,
        height: 200,
        fontToken: 'spec-block',
        fontSize: 32,
        fontWeight: 600,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 3
      },
      {
        role: 'body',
        label: '配送说明',
        defaultText: '全国直辖市及地级市免费送货上门并专业安装；提供5年电机质保与终身维保支持。',
        x: 140,
        y: 2020,
        width: 1820,
        height: 380,
        fontToken: 'body-text',
        fontSize: 32,
        fontWeight: 400,
        color: '#5A5652',
        textAlign: 'left',
        maxLines: 3
      },
      {
        role: 'cta',
        label: '售后承诺',
        defaultText: '敏华官方旗舰店正品保障 · 7天无理由退换 · 破损包赔',
        x: 140,
        y: 2470,
        width: 1820,
        height: 180,
        fontToken: 'cta-pill',
        fontSize: 36,
        fontWeight: 700,
        color: '#9B7347',
        textAlign: 'center',
        maxLines: 1
      }
    ],
    decorationSlots: [
      {
        type: 'shape',
        x: 100,
        y: 1480,
        width: 920,
        height: 480,
        props: { color: '#F7F4EF', radius: 16 }
      },
      {
        type: 'shape',
        x: 1050,
        y: 1480,
        width: 950,
        height: 480,
        props: { color: '#F7F4EF', radius: 16 }
      }
    ]
  },

  'split-aesthetic': {
    templateId: 'split-aesthetic',
    name: '极简对半 / 灵感拼接',
    description: '采用极简留白风格，一半大面积高清留白图，一半极简细线条搭配大比例核心标题，强调高级感。',
    suggestedRoles: ['03_lifestyle_scene', '06_material_detail', '07_comfort_experience'],
    imageFrames: [
      {
        key: 'split_image_top',
        x: 100,
        y: 100,
        width: 1900,
        height: 1500,
        fitMode: 'cover',
        defaultFocalPoint: { x: 0.5, y: 0.5 }
      }
    ],
    textSlots: [
      {
        role: 'headline',
        label: '核心张力标题',
        defaultText: '艺术与生活的平衡',
        x: 100,
        y: 1800,
        width: 1900,
        height: 150,
        fontToken: 'display-headline',
        fontSize: 100,
        fontWeight: 300,
        color: '#1A1817',
        textAlign: 'left',
        maxLines: 2
      },
      {
        role: 'subheadline',
        label: '功能/意境副标',
        defaultText: '去掉繁杂装饰，还原材质最初的美好。极致的线条语言，为空间留出呼吸感。',
        x: 100,
        y: 2000,
        width: 1500,
        height: 120,
        fontToken: 'editorial-subhead',
        fontSize: 36,
        fontWeight: 400,
        color: '#5C544D',
        textAlign: 'left',
        maxLines: 3
      },
      {
        role: 'body',
        label: '细节解析',
        defaultText: '每一寸触感都经过精心打磨。我们甄选全粒面头层牛皮，保留天然毛孔，确保透气与柔软。通过极简的切割工艺，展现材质最本质的高级美。',
        x: 100,
        y: 2200,
        width: 1200,
        height: 250,
        fontToken: 'body-technical',
        fontSize: 28,
        fontWeight: 400,
        color: '#7A736E',
        textAlign: 'left',
        maxLines: 5
      }
    ],
    decorationSlots: [
      {
        type: 'shape',
        x: 0,
        y: 1700,
        width: 2100,
        height: 1100,
        props: { color: '#FDFBF9' } // Subtle off-white for the text area
      },
      {
        type: 'line',
        x: 100,
        y: 1750,
        width: 1900,
        height: 2,
        props: { color: '#E5DFD7' }
      }
    ]
  },

  'cinematic-overlay': {
    templateId: 'cinematic-overlay',
    name: '电影感 / 全画幅沉浸',
    description: '采用全画幅无边距图片覆盖，配合底部渐变暗影与左下角巨幅留白文字排版，如同电影海报。',
    suggestedRoles: ['01_brand_hero', '03_lifestyle_scene', '09_brand_closing_cta'],
    imageFrames: [
      {
        key: 'cinematic_full_frame',
        x: 0,
        y: 0,
        width: 2100,
        height: 2800,
        fitMode: 'cover',
        defaultFocalPoint: { x: 0.5, y: 0.5 }
      }
    ],
    textSlots: [
      {
        role: 'headline',
        label: '巨幕标题',
        defaultText: '重塑客厅空间',
        x: 150,
        y: 2000,
        width: 1800,
        height: 160,
        fontToken: 'display-headline',
        fontSize: 120,
        fontWeight: 900,
        color: '#FFFFFF',
        textAlign: 'left',
        maxLines: 2
      },
      {
        role: 'subheadline',
        label: '意境引言',
        defaultText: '当你坐下的那一刻，世界便安静了下来。专属你的头等舱体验。',
        x: 150,
        y: 2200,
        width: 1600,
        height: 100,
        fontToken: 'editorial-subhead',
        fontSize: 40,
        fontWeight: 500,
        color: '#F0F0F0',
        textAlign: 'left',
        maxLines: 2
      },
      {
        role: 'body',
        label: '故事正文',
        defaultText: '融入了更符合人体工学的七区承托系统，每一个受力点都能得到温柔的回应。搭配静音电机，平滑展开至160度，让身心彻底释放。',
        x: 150,
        y: 2350,
        width: 1400,
        height: 200,
        fontToken: 'body-technical',
        fontSize: 32,
        fontWeight: 400,
        color: '#CCCCCC',
        textAlign: 'left',
        maxLines: 4
      }
    ],
    decorationSlots: [
      {
        type: 'shape',
        x: 0,
        y: 1400,
        width: 2100,
        height: 1400,
        // Represents a gradient overlay in actual render, using solid for schema fallback
        props: { color: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)' }
      }
    ]
  }
};

export const ROLE_TO_TEMPLATE_MAP: Record<
  number,
  {
    role: PosterRole;
    defaultTemplateId: TemplateId;
    title: string;
    promptFocus: string;
    safeAreaFocus: string;
  }
> = {
  1: {
    role: '01_brand_hero',
    defaultTemplateId: 'hero-editorial',
    title: '01 品牌主视觉',
    promptFocus: 'grand luxury living room, majestic atmosphere, hero angle, perfect lighting, elegant furniture staging',
    safeAreaFocus: 'text-safe area on top'
  },
  2: {
    role: '02_core_selling_point',
    defaultTemplateId: 'feature-cards',
    title: '02 核心卖点',
    promptFocus: 'three quarter angle, high end interior design, clean product structure view',
    safeAreaFocus: 'text-safe area on left and bottom'
  },
  3: {
    role: '03_lifestyle_scene',
    defaultTemplateId: 'lifestyle-story',
    title: '03 使用场景',
    promptFocus: 'warm cozy modern living room ambient, soft sunlight through curtain, peaceful lifestyle atmosphere',
    safeAreaFocus: 'text-safe area on bottom'
  },
  4: {
    role: '04_function_demo',
    defaultTemplateId: 'function-sequence',
    title: '04 功能说明',
    promptFocus: 'motorized reclining demonstration angle, smooth motion feel, ergonomic posture support',
    safeAreaFocus: 'text-safe area on bottom'
  },
  5: {
    role: '05_action_sequence',
    defaultTemplateId: 'function-sequence',
    title: '05 动作/状态序列',
    promptFocus: 'unfolding electric footrest and backrest stages, side profile view, sleek mechanical elegance',
    safeAreaFocus: 'text-safe area on top'
  },
  6: {
    role: '06_material_detail',
    defaultTemplateId: 'material-detail',
    title: '06 材质细节',
    promptFocus: 'macro close-up shot, genuine leather grain texture, precise handcrafted stitching seam, luxury tactile feel',
    safeAreaFocus: 'text-safe area on bottom'
  },
  7: {
    role: '07_comfort_experience',
    defaultTemplateId: 'lifestyle-story',
    title: '07 舒适体验',
    promptFocus: 'relaxing afternoon lounge atmosphere, ergonomic headrest and lumbar support highlight',
    safeAreaFocus: 'text-safe area on bottom'
  },
  8: {
    role: '08_specification_board',
    defaultTemplateId: 'specification-board',
    title: '08 参数规格',
    promptFocus: 'studio isolated product outline on clean warm neutral studio background, balanced studio lights',
    safeAreaFocus: 'text-safe area on top and bottom'
  },
  9: {
    role: '09_brand_closing_cta',
    defaultTemplateId: 'hero-editorial',
    title: '09 品牌收尾与 CTA',
    promptFocus: 'prestigious brand signature perspective, timeless luxury furniture piece, high production value',
    safeAreaFocus: 'text-safe area on bottom'
  }
};
