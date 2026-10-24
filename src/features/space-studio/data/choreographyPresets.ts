// src/features/space-studio/data/choreographyPresets.ts
// MANWAH Space Studio｜影棚实拍商业对齐版 人物姿态与动作模板矩阵 V4.0
// 严格对齐影棚交付实拍真值：A00~A09 十套镜头与 16 套专业人物编排动作规范
import { HumanSlotAssignment, ModelAsset } from '../../../types/spaceAssetLibrary';

export interface StudioChoreographySlotTemplate {
  roleLabel: string;
  defaultRole: 'father' | 'mother' | 'grandfather' | 'grandmother' | 'boy' | 'girl' | 'individual';
  gender: 'female' | 'male';
  ageRange: string;
  positionDesc: string;
  actionDesc: string;
  ergonomicPosture: string;
  suggestedProps?: string[];
}

export interface StudioChoreographyTemplate {
  id: string;
  name: string;
  badge: string;
  targetShotCode: string; // e.g. 'A00', 'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09'
  targetShotName: string;
  count: number;
  mode: 'custom' | '4' | '6';
  summary: string;
  fullPrompt: string;
  slots: StudioChoreographySlotTemplate[];
  negativeConstraints: string[];
  lightingAdvice: string;
  recommendedAspect?: '3:4' | '4:3' | '16:9';
}

export const STUDIO_CHOREOGRAPHY_TEMPLATES: StudioChoreographyTemplate[] = [
  // -------------------------------------------------------------
  // A00: 空间母版
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a00',
    name: '【A00 空间母版 · 三代同堂全案盛景】',
    badge: '6人空间基准 · 4:3建筑母版',
    targetShotCode: 'A00',
    targetShotName: 'A00 空间母版权威基准',
    count: 6,
    mode: '6',
    recommendedAspect: '4:3',
    summary: '8~10米大开间横厅，贯通式奢石护墙板与落地窗采光，三代同堂齐聚一堂，统领全案硬装与全套家具',
    fullPrompt:
      '全案建筑超广角对称中轴视角。8~10米横厅大平层采光通透，奢石护墙板立面线条贯通。主沙发与单椅、茶几、地毯全套呈现。三代同堂家庭6人其乐融融分布其间：长辈在主功能位舒展小憩，父母在前倾交谈品茶，孩子在地毯与沙发旁玩耍互动，展现高净值大家庭的从容生活方式。',
    negativeConstraints: [
      '严禁所有人像拍身份证一样直勾勾盯着镜头',
      '严禁人员挤在单一座席造成严重重叠',
      '严禁家具比例失真或背景墙破损'
    ],
    lightingAdvice: '通透均匀的晨间与午后自然漫射光，洗亮奢石立面与皮革温润质感',
    slots: [
      {
        roleLabel: '爷爷 (长辈舒躺位)',
        defaultRole: 'grandfather',
        gender: 'male',
        ageRange: '65-72岁 儒雅长者',
        positionDesc: '主沙发左侧电动位 (脚托展开，靠背 140°)',
        actionDesc: '半躺小憩或手持报卷阅览，神态安详从容',
        ergonomicPosture: '全包裹支撑，脚托展开平托双足',
        suggestedProps: ['复古折叠老花镜']
      },
      {
        roleLabel: '男主人 (C位谈话座)',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '38-42岁 顶梁柱中坚',
        positionDesc: '主沙发中央座区',
        actionDesc: '身体自然前倾，手持茶杯与妻子、长辈交谈',
        ergonomicPosture: '自然坐姿，手肘微靠',
        suggestedProps: ['白瓷茶杯']
      },
      {
        roleLabel: '女主人 (贵妃榻倚靠位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '32-36岁 优雅女主人',
        positionDesc: '主沙发转角贵妃榻',
        actionDesc: '优雅侧卧或斜倚，一手抚靠垫，微笑倾听家人说话',
        ergonomicPosture: '侧倚斜靠，线条优美',
        suggestedProps: ['轻薄丝巾']
      },
      {
        roleLabel: '奶奶 (单人椅品茗位)',
        defaultRole: 'grandmother',
        gender: 'female',
        ageRange: '62-68岁 和蔼长者',
        positionDesc: '独立头等舱功能单椅',
        actionDesc: '优雅端坐，双手捧茶碟细品，神态温和欣慰',
        ergonomicPosture: '端正端坐，仪态大方',
        suggestedProps: ['青瓷茶碟茶具']
      },
      {
        roleLabel: '女儿 (伴读依偎位)',
        defaultRole: 'girl',
        gender: 'female',
        ageRange: '6-8岁 灵动甜美',
        positionDesc: '女主人身旁沙发坐垫',
        actionDesc: '依偎在母亲身侧，低头聚精会神翻看儿童立体绘本',
        ergonomicPosture: '并腿侧坐，依偎母亲',
        suggestedProps: ['立体儿童绘本']
      },
      {
        roleLabel: '儿子 (地毯益智玩耍位)',
        defaultRole: 'boy',
        gender: 'male',
        ageRange: '5-7岁 活泼机灵',
        positionDesc: '茶几前方的高定羊毛地毯上',
        actionDesc: '席地盘腿而坐，低头专注拼搭彩色乐高积木模型',
        ergonomicPosture: '盘腿席地坐姿，灵活专注',
        suggestedProps: ['彩色乐高积木零件']
      }
    ]
  },

  // -------------------------------------------------------------
  // A01: 空间主大场景
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a01',
    name: '【A01 空间主全景 · 三代同堂全景天伦之乐】',
    badge: '6人全家福 · 客餐全案',
    targetShotCode: 'A01',
    targetShotName: 'A01 空间主大场景',
    count: 6,
    mode: '6',
    recommendedAspect: '4:3',
    summary: '爷爷展开脚托小憩、男主人中央品茗、女主人侧倚贵妃榻、奶奶单椅端坐、双萌娃地毯玩伴',
    fullPrompt:
      '全景大平层客厅的三代同堂天伦之乐。主沙发左侧电动功能位上，银发爷爷展开脚托半靠闭目养神或翻阅书卷；沙发中央位男主人前倾端坐，手持茶杯与身旁家人交谈；右侧贵妃榻上女主人优雅侧倚侧坐，手抚软垫倾听；独立功能单椅上奶奶面带慈祥端坐品茗；小女儿依偎在女主人身旁翻看精装绘本；小男孩席地坐在茶几前的羊毛地毯上专注拼插乐高积木。全景多点位错落分布，各享动线，欢声笑语。',
    negativeConstraints: [
      '严禁所有人像拍身份证一样直勾勾盯着镜头（严禁呆板看镜头大合影）',
      '严禁人员扎堆挤在一个坐位造成遮挡',
      '严禁家具比例失真或出现多余怪异人物'
    ],
    lightingAdvice: '全景大采光通透昼光，伴随落地窗金色漫射日光均匀覆盖全场',
    slots: [
      {
        roleLabel: '爷爷 (长辈舒躺位)',
        defaultRole: 'grandfather',
        gender: 'male',
        ageRange: '65-72岁 儒雅长者',
        positionDesc: '主沙发最左侧电动位 (脚托展开，靠背 140°)',
        actionDesc: '半躺小憩或手持报卷阅览，神态安详从容',
        ergonomicPosture: '全包裹支撑，脚托展开托起双足',
        suggestedProps: ['复古折叠老花镜']
      },
      {
        roleLabel: '男主人 (C位谈话座)',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '38-42岁 顶梁柱中坚',
        positionDesc: '主沙发中央座区',
        actionDesc: '身体自然前倾，手持茶杯与妻子、长辈交谈',
        ergonomicPosture: '自然坐姿，手肘微靠',
        suggestedProps: ['白瓷茶杯']
      },
      {
        roleLabel: '女主人 (贵妃榻倚靠位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '32-36岁 优雅女主人',
        positionDesc: '主沙发转角贵妃榻',
        actionDesc: '优雅侧卧或斜倚，一手抚靠垫，微笑倾听家人说话',
        ergonomicPosture: '侧倚斜靠，线条优美',
        suggestedProps: ['轻薄丝巾']
      },
      {
        roleLabel: '奶奶 (单人椅品茗位)',
        defaultRole: 'grandmother',
        gender: 'female',
        ageRange: '62-68岁 和蔼长者',
        positionDesc: '独立头等舱功能单椅',
        actionDesc: '优雅端坐，双手捧茶碟细品，神态温和欣慰',
        ergonomicPosture: '端正端坐，仪态大方',
        suggestedProps: ['青瓷茶碟茶具']
      },
      {
        roleLabel: '女儿 (伴读依偎位)',
        defaultRole: 'girl',
        gender: 'female',
        ageRange: '6-8岁 灵动甜美',
        positionDesc: '女主人身旁沙发坐垫',
        actionDesc: '依偎在母亲身侧，低头聚精会神翻看儿童立体绘本',
        ergonomicPosture: '并腿侧坐，依偎母亲',
        suggestedProps: ['立体儿童绘本']
      },
      {
        roleLabel: '儿子 (地毯益智玩耍位)',
        defaultRole: 'boy',
        gender: 'male',
        ageRange: '5-7岁 活泼机灵',
        positionDesc: '茶几前方的高定羊毛地毯上',
        actionDesc: '席地盘腿而坐，低头专注拼搭彩色乐高积木模型',
        ergonomicPosture: '盘腿席地坐姿，灵活专注',
        suggestedProps: ['彩色乐高积木零件']
      }
    ]
  },

  // -------------------------------------------------------------
  // A02: 45° 3+1 组合大全景 (真值实拍：3+1成套大合影，严禁错配为1人独立主座)
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a02',
    name: '【A02 45°组合全景 · 3+1成套欢聚大合影】',
    badge: '6人/4人成套欢聚 · 4:3经典斜侧',
    targetShotCode: 'A02',
    targetShotName: 'A02 45° 3+1 组合大全景',
    count: 6,
    mode: '6',
    recommendedAspect: '4:3',
    summary: '45° 侧前方斜侧透视，展现 3人主沙发 + 独立单椅 + 中岛茶几围合成套，三代同堂欢聚温馨大合影',
    fullPrompt:
      '4:3 经典商业摄影画幅。机位位于客厅侧前方 40°~45° 斜侧透视，完整展现 3人位主沙发、独立头等舱功能单椅与中岛双茶几的成套围合布局。三代同堂其乐融融：主沙发左侧电动位爷爷展开脚托舒适依靠，男主人坐在沙发中间手扶靠背与身旁妻子交谈，女主人知性依偎在沙发右侧、单手轻揽身旁依偎的小女儿；独立功能单椅上奶奶慈祥端坐、手捧白瓷茶杯欣慰注视全场；小男孩盘腿坐在沙发与茶几之间的羊毛地毯上专注拼插积木。全景纵深开阔，动线通畅，尽显芝华仕成套高定家居的高奢生活方式。',
    negativeConstraints: [
      '严禁单人独坐显得空间空旷荒凉',
      '严禁呆板看镜头排排坐',
      '严禁遮挡 3+1 成套围合动线与茶几高低落差'
    ],
    lightingAdvice: '左侧落地窗 45° 柔和采光斜射入室，打在主沙发与单椅的皮质高光弧线上',
    slots: [
      {
        roleLabel: '爷爷 (主沙发舒享位)',
        defaultRole: 'grandfather',
        gender: 'male',
        ageRange: '65-72岁 儒雅长辈',
        positionDesc: '主沙发左侧电动功能位 (脚托微展开)',
        actionDesc: '半靠在沙发扶手旁，双手轻松搭在膝前，面容和蔼注视家人',
        ergonomicPosture: '全包裹舒适依靠，神态悠闲',
        suggestedProps: ['茶水杯']
      },
      {
        roleLabel: '男主人 (主沙发中位谈笑座)',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '36-42岁 精英男主',
        positionDesc: '主沙发中央座区',
        actionDesc: '身体微侧转向妻子和孩子，单手自然搭在靠背上，谈笑风生',
        ergonomicPosture: '挺拔中带有从容，重心自然',
        suggestedProps: ['腕表']
      },
      {
        roleLabel: '女主人 (主沙发右侧温婉位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '32-38岁 知性女主',
        positionDesc: '主沙发右侧座区',
        actionDesc: '侧身依偎在沙发内侧，一手轻揽身旁女儿，温婉含笑',
        ergonomicPosture: '姿态柔和端庄，与孩子形成自然情感连接',
        suggestedProps: []
      },
      {
        roleLabel: '女儿 (母亲身侧依偎位)',
        defaultRole: 'girl',
        gender: 'female',
        ageRange: '5-8岁 天真可爱',
        positionDesc: '女主人身旁沙发坐垫',
        actionDesc: '依偎贴靠着母亲，手捧儿童绘本翻阅，面带喜悦',
        ergonomicPosture: '蜷坐依偎，活泼生动',
        suggestedProps: ['儿童绘本']
      },
      {
        roleLabel: '奶奶 (独立功能单椅位)',
        defaultRole: 'grandmother',
        gender: 'female',
        ageRange: '62-68岁 慈祥长辈',
        positionDesc: '成套搭配的独立头等舱功能单椅上',
        actionDesc: '端坐在单椅中，双手轻捧白瓷茶盏，慈祥注视玩耍的小孙子',
        ergonomicPosture: '端正端坐，仪态高贵祥和',
        suggestedProps: ['白瓷茶盏']
      },
      {
        roleLabel: '儿子 (地毯益智玩耍位)',
        defaultRole: 'boy',
        gender: 'male',
        ageRange: '5-7岁 活泼萌童',
        positionDesc: '主沙发与中岛茶几之间的羊毛地毯上',
        actionDesc: '席地盘腿而坐，低头专注于拼接乐高积木',
        ergonomicPosture: '地毯盘坐，重心贴地不抢镜',
        suggestedProps: ['彩色积木玩具']
      }
    ]
  },

  // -------------------------------------------------------------
  // A03: 三人位主沙发场景 (纯 3 人主沙发焦点，严格无单椅)
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a03',
    name: '【A03 3人位主沙发 · 温馨家庭中心聚会】',
    badge: '3人家庭温馨 · 4:3经典',
    targetShotCode: 'A03',
    targetShotName: 'A03 三人位主沙发场景',
    count: 3,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '以 3 人位主沙发为唯一视觉中心，父母与活泼女儿自然依偎入座，正前平视呈现温馨家庭其乐融融，严格无单椅干扰',
    fullPrompt:
      '4:3 经典商业摄影画幅。机位正平视聚焦三人位主沙发。男主人与女主人分别坐在主沙发舒适座区，手持温热茶杯低声倾谈；活泼可爱的小女儿坐在中间依偎在父母身旁，专注翻看精装绘本。整张三人沙发皮革质感饱满，自然入座下沉褶皱真实，沙发前奢石茶几放有茶具与艺术花瓶。画面严格聚焦主沙发本身，无多余侧边单椅干扰。',
    negativeConstraints: [
      '严禁单椅或无关家具抢占中心位置',
      '严禁肢体僵硬呆板摆拍',
      '严禁画面边缘出现半截家具'
    ],
    lightingAdvice: '正面明朗通透的自然窗光与室内温馨暖光交融',
    slots: [
      {
        roleLabel: '男主人 (主座谈话位)',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '32-38岁 儒雅精英',
        positionDesc: '主沙发外侧座区',
        actionDesc: '前倾放松坐姿，手持茶杯与妻子对视交谈',
        ergonomicPosture: '重心自然微倾，手肘轻搭大腿',
        suggestedProps: ['白瓷茶杯']
      },
      {
        roleLabel: '女主人 (优雅倚靠位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '30-35岁 气质名媛',
        positionDesc: '主沙发另一侧座区',
        actionDesc: '侧倚靠背，一手搂着身侧孩子，温和微笑倾听',
        ergonomicPosture: '侧倚腰背支撑，仪态端庄大方',
        suggestedProps: []
      },
      {
        roleLabel: '小女儿 (中央依偎伴读位)',
        defaultRole: 'girl',
        gender: 'female',
        ageRange: '5-8岁 甜美可爱',
        positionDesc: '主沙发中央座区',
        actionDesc: '依偎在母亲身侧，低头专注翻看立体儿童绘本',
        ergonomicPosture: '双腿并拢屈坐，神情专注喜悦',
        suggestedProps: ['精装儿童立体绘本']
      }
    ]
  },
  {
    id: 'studio-tpl-a03-solo',
    name: '【A03 3人位主沙发 · 精英独立主座】',
    badge: '1人独立 Hero · 主位气场',
    targetShotCode: 'A03',
    targetShotName: 'A03 三人位主沙发场景',
    count: 1,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '聚焦主沙发 1 号电动位展开 80%，男/女主人坐姿挺拔从容，手持平板掌控全局，呈现大平层主人翁气场',
    fullPrompt:
      '4:3 经典人文中景视角。商界精英男主人（或知性女高管）坐镇主沙发 1 号电动功能位。电动脚托展开约 80%，靠背微仰 115°。人物坐姿挺拔从容而又舒展，一手自然平置于宽厚头层真皮扶手上，一手轻松握持平板电脑或智能手机，目光沉静自信注视前方或窗外。背景透出大平层定制奢石背景墙中轴线，突出主人翁的从容掌控力与大宅高奢品质。',
    negativeConstraints: [
      '严禁佝偻含胸或毫无精气神',
      '严禁沙发电动脚托闭合（必须展现展开承托）',
      '严禁画面出现侧边单椅干扰'
    ],
    lightingAdvice: '典雅建筑轮廓光 + 45° 伦勃朗面部高光，强化立体轮廓',
    slots: [
      {
        roleLabel: '男主人 / 女主人 (Hero 气场主座)',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '35-42岁 商业精英',
        positionDesc: '主沙发 1 号电动功能展开位 (脚托 80%，靠背 115°)',
        actionDesc: '端坐挺拔，手搭宽扶手，另一手持智能平板，目光沉着眺望前方，展现主人翁从容气场',
        ergonomicPosture: '脊柱挺拔同时有头枕与腰靠饱满托举，双腿被脚托平稳支撑',
        suggestedProps: ['金属机身轻薄平板电脑', '高级皮带机械表']
      }
    ]
  },

  // -------------------------------------------------------------
  // A04: 三分之二主沙发亲子陪伴场景 (3:4 竖构图)
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a04',
    name: '【A04 2/3主沙发 · 母女亲子自拍温情】',
    badge: '2人温情陪伴 · 3:4竖构图',
    targetShotCode: 'A04',
    targetShotName: 'A04 三分之二主沙亲子陪伴场景',
    count: 2,
    mode: 'custom',
    recommendedAspect: '3:4',
    summary: '主沙发左侧外位功能脚托展开，年轻母亲与活泼女儿依偎合拍自拍，传递有温度的家庭生活方式',
    fullPrompt:
      '3:4 纵向经典商业画册画幅。取景主沙发左侧 2/3。外侧电动功能位脚托顺畅展开，年轻优雅的母亲与活泼可爱的小女儿依偎坐在展开的功能位上。母亲一手举起智能手机自拍，另一手温柔搂着女儿；女儿笑脸灿烂、偏头贴近母亲做鬼脸互动。背景透出质感木饰面大理石背景墙与落地绿植，画面洋溢着真切温馨的家庭幸福感。',
    negativeConstraints: [
      '严禁呆板看镜头摆拍',
      '严禁脚踏闭合（必须展开支撑母女腿部）',
      '严禁遮挡主沙发左侧扶手优雅线条'
    ],
    lightingAdvice: '窗边柔和高显色侧逆光，勾勒母女发丝微光与真皮温润质感',
    slots: [
      {
        roleLabel: '年轻母亲 (功能展开位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '28-34岁 优雅年轻母亲',
        positionDesc: '主沙发左侧电动功能位 (脚托完全展开)',
        actionDesc: '单手举起手机自拍，另一手搂着女儿，笑容温柔灿烂',
        ergonomicPosture: '腰背受靠背饱满托举，双腿自然平放在展开脚托上',
        suggestedProps: ['智能手机']
      },
      {
        roleLabel: '女儿 (依偎合拍位)',
        defaultRole: 'girl',
        gender: 'female',
        ageRange: '5-8岁 天真可爱',
        positionDesc: '依偎在母亲身旁功能位内侧',
        actionDesc: '头贴着母亲，开朗大笑或做可爱自拍表情',
        ergonomicPosture: '双腿蜷在沙发垫上，身体自然倾斜贴靠母亲',
        suggestedProps: []
      }
    ]
  },

  // -------------------------------------------------------------
  // A05: 三分之二主沙发私享休闲景 (3:4 竖构图)
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a05',
    name: '【A05 2/3主沙发 · 优雅红酒微醺私享】',
    badge: '1人名媛私享 · 3:4竖构图',
    targetShotCode: 'A05',
    targetShotName: 'A05 三分之二主沙私享休闲景',
    count: 1,
    mode: 'custom',
    recommendedAspect: '3:4',
    summary: '主沙发右侧外位功能脚托展开，知性名媛手持红酒杯轻倚扶手微醺，尽显轻奢从容生活格调与绗缝工艺',
    fullPrompt:
      '3:4 纵向经典商业大片画幅。取景主沙发右侧 2/3。外侧电动功能位脚托水平展开，知性优雅的女主人身着丝绸家居吊带与羊绒开衫，舒适躺靠在展开位中。单手优雅端着晶莹剔透的高脚红酒杯，另一手闲适搭在带有精致菱形绗缝的真皮扶手上。眼神从容望向前方，神态微醺惬意。背景为轻奢大理石背景墙与氛围层板暖灯，彰显奢华私享质感。',
    negativeConstraints: [
      '严禁正襟危坐呆板无趣',
      '严禁遮挡扶手菱形绗缝高定工艺细节',
      '严禁打翻酒杯或不合时宜杂物'
    ],
    lightingAdvice: '大理石层板暗藏暖光洗墙 + 柔和面光，突显红酒杯晶莹透亮与皮革光泽',
    slots: [
      {
        roleLabel: '女主人 (微醺私享位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '30-36岁 气质名媛',
        positionDesc: '主沙发右侧电动功能展开位 (脚托展开，靠背 130°)',
        actionDesc: '单手持高脚红酒杯，另一手轻搭绗缝扶手，眼神慵懒迷离享受独处时光',
        ergonomicPosture: '深陷入座，颈椎与腰背受饱满支撑，腿部舒展平放',
        suggestedProps: ['高脚水晶红酒杯']
      }
    ]
  },

  // -------------------------------------------------------------
  // A06: 零靠墙功能闭合侧景
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a06',
    name: '【A06 零靠墙闭合 · 耳机静享音乐从容端坐】',
    badge: '1人静谧端坐 · 4:3纯侧视',
    targetShotCode: 'A06',
    targetShotName: 'A06 零靠墙功能闭合侧景',
    count: 1,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '88° 侧向大透视，直观展现沙发紧贴墙面零间隙（<5cm）闭合形态，女主优雅端坐闭目静享音乐',
    fullPrompt:
      '4:3 电影感侧向透视景。机位处于侧向约 88° 角度，清晰呈现主沙发后背紧贴墙面仅数公分（<5cm）的零靠墙闭合形态。沙发电动脚托完全闭合收于底部，靠背保持标准端坐形态。一位年轻女主人身着棉麻居家服端坐在沙发上，头戴高保真无线头戴式降噪耳机，双足自然踏在脚前羊毛地毯上，双手闲适搭在带有精致绗缝的真皮扶手上，双目微闭微仰，沉浸在美妙音乐世界中。突出零靠墙紧凑美学与从容居家格调。',
    negativeConstraints: [
      '严禁正面平视（必须是 85°~90° 侧面大透视呈现零靠墙结构）',
      '严禁脚托展开或伸出（必须完全收回闭合）',
      '严禁靠背大角度倾斜后仰',
      '严禁后背与墙面留有过大空隙（必须体现零靠墙）',
      '严禁动作僵硬紧绷'
    ],
    lightingAdvice: '大侧光轮廓勾勒零靠墙靠背贴墙线条与人体舒展轮廓',
    slots: [
      {
        roleLabel: '女主人 (零靠墙音乐沉浸端座位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '26-32岁 知性文艺',
        positionDesc: '主沙发侧边标准闭合坐位 (脚托完全收拢，双足着地)',
        actionDesc: '佩戴头戴式耳机，端坐优雅倚靠，双目微闭静听，双手闲适搭在扶手上',
        ergonomicPosture: '腰背贴靠饱满腰枕，双腿自然垂直垂足，神态静谧舒适',
        suggestedProps: ['头戴式降噪耳机']
      }
    ]
  },

  // -------------------------------------------------------------
  // A07: 沙发茶几组群中景 (真值实拍：中景，沙发与大理石茶几黄金落差)
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a07',
    name: '【A07 沙发茶几群 · 夫妻席地微醺品茗】',
    badge: '2人生活方式 · 4:3中景',
    targetShotCode: 'A07',
    targetShotName: 'A07 沙发茶几组群中景',
    count: 2,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '女主人席地背靠沙发底座、单手持杯，男主人坐沙发外侧前倾对谈，展示奢石茶几与主沙发的黄金落差',
    fullPrompt:
      '4:3 中景起居生活方式近景。年轻优雅的女主人身着宽松丝绸居家服，席地坐在沙发前的厚实高定羊毛地毯上，后背自然轻靠沙发底座皮革裙边，双腿斜向微屈。单手端着一杯微醺红酒或白瓷马克杯，另一手搭在奢石茶几边沿。男主人坐在主沙发外侧位，身体自然前倾，手肘轻撑在膝盖上，两人目光交汇低语谈笑，氛围极度慵懒松弛，完美烘托大理石茶几与主沙发的高低呼应。',
    negativeConstraints: [
      '严禁规矩正襟危坐',
      '严禁坐在地毯上姿势别扭不合人体工学',
      '严禁俯视高角度破坏贴地松弛视点'
    ],
    lightingAdvice: '低色温傍晚暖调斜阳或漫射柔光，洒在地毯绒毛与茶几石纹之间',
    slots: [
      {
        roleLabel: '女主人 (地毯席地慵懒位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '28-34岁 气质名媛',
        positionDesc: '主沙发与茶几之间的羊毛地毯上，背靠沙发底座',
        actionDesc: '席地而坐，背倚沙发，单手端着红酒杯/马克杯，另一手轻搭茶几边沿，仰头与男主人交谈',
        ergonomicPosture: '双腿自然侧屈叠放，腰背贴靠沙发底座，全身松弛',
        suggestedProps: ['高脚红酒杯', '骨瓷马克杯']
      },
      {
        roleLabel: '男主人 (沙发外侧俯身位)',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '30-36岁 儒雅精英',
        positionDesc: '主沙发外侧端座位',
        actionDesc: '身体前倾，手肘轻置于膝前，低头注视地毯上的妻子，嘴角带笑轻松闲聊',
        ergonomicPosture: '前倾放松坐姿，重心稳定',
        suggestedProps: ['休闲腕表', '茶几上平板电脑']
      }
    ]
  },

  // -------------------------------------------------------------
  // A08: 单椅五档功能状态景 (真值实拍：五大功能档位 + 亲子探身)
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a08-01',
    name: '【A08 单椅档位1 · 160°深度睡眠模式】',
    badge: '160°深度睡眠 · 羊绒盖毯',
    targetShotCode: 'A08',
    targetShotName: 'A08 单椅五档功能状态景',
    count: 1,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '35°侧角固定机位，单椅后仰至 160° 深度睡眠角，脚托完全展开，模特盖轻柔羊绒薄毯沉睡',
    fullPrompt:
      '4:3 经典商业画幅，机位固定在单椅侧前方 35°。芝华仕单人功能单椅展开至 160° 深度睡眠模式，靠背深度后仰，脚托 100% 展开平托。模特身盖一条质感轻柔的浅米色羊绒盖毯安详熟睡，双手自然放在腹前毯上，神态安宁甜美，尽显头等舱如云端般的深睡包裹感。',
    negativeConstraints: ['严禁机位偏离 35°', '严禁脚托未完全展开', '严禁表情僵硬'],
    lightingAdvice: '暖调微光伴随窗外漫射光，营造静谧安睡氛围',
    slots: [
      {
        roleLabel: '熟睡体验者',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '28-35岁 优雅名媛',
        positionDesc: '单椅 160° 深度后仰睡眠位',
        actionDesc: '全身盖轻薄羊绒毯安详闭目沉睡',
        ergonomicPosture: '160° 脊椎舒展平躺，双腿被脚托完全托起',
        suggestedProps: ['米色羊绒盖毯']
      }
    ]
  },
  {
    id: 'studio-tpl-a08-02',
    name: '【A08 单椅档位2 · 140°耳机听歌放松模式】',
    badge: '140°音乐沉浸 · 仰躺聆听',
    targetShotCode: 'A08',
    targetShotName: 'A08 单椅五档功能状态景',
    count: 1,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '35°侧角固定机位，单椅处于 140° 听歌放松角，佩戴耳机闭目轻摇，享受专属私享声场',
    fullPrompt:
      '4:3 经典商业画幅，机位固定在单椅侧前方 35°。芝华仕单椅后仰至 140° 听歌休闲角，脚托水平托举双腿。模特头戴高级银色金属质感耳机，头枕稳稳托住后颈，双目微闭，手指随音乐节拍轻点在真皮扶手上，面带放松恬淡微笑。旁边边几放有一杯冒着热气的清茶。',
    negativeConstraints: ['严禁机位偏离 35°', '严禁脚托未展开'],
    lightingAdvice: '侧方柔和漫射日光，打在耳机与真皮扶手反光面',
    slots: [
      {
        roleLabel: '音乐聆听者',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '28-35岁 知性青年',
        positionDesc: '单椅 140° 后仰位',
        actionDesc: '戴耳机闭目倾听，手指轻点扶手',
        ergonomicPosture: '头部后仰受托，颈椎彻底放松',
        suggestedProps: ['头戴式无线耳机', '边几茶杯']
      }
    ]
  },
  {
    id: 'studio-tpl-a08-03',
    name: '【A08 单椅档位3 · 120°影音追剧模式】',
    badge: '120°舒适追剧 · 遥控手持',
    targetShotCode: 'A08',
    targetShotName: 'A08 单椅五档功能状态景',
    count: 1,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '35°侧角固定机位，单椅处于 120° 影音角度，手持智能遥控器注视电视，身心愉悦',
    fullPrompt:
      '4:3 经典商业画幅，机位固定在单椅侧前方 35°。单人功能椅调节至 120° 追剧黄金观影角，脚托升起至舒适承托高度。模特身体倚靠椅背，单手握持极简黑色电视遥控器指向前方，另一手握着果汁或零食杯，目光专注而愉快地看向前方屏幕，呈现下班后惬意追剧的家庭时光。',
    negativeConstraints: ['严禁机位偏离 35°', '严禁坐姿过于僵直'],
    lightingAdvice: '电视屏幕弱漫射光 + 室内落地灯暖光结合',
    slots: [
      {
        roleLabel: '追剧观影者',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '30-38岁 青年精英',
        positionDesc: '单椅 120° 黄金观影视角位',
        actionDesc: '手持遥控器注视前方，双腿架在脚托上',
        ergonomicPosture: '视线与电视平视微仰，腰部紧密贴合',
        suggestedProps: ['电视遥控器']
      }
    ]
  },
  {
    id: 'studio-tpl-a08-04',
    name: '【A08 单椅档位4 · 110°专注阅览模式】',
    badge: '110°知性伴读 · 翻阅书刊',
    targetShotCode: 'A08',
    targetShotName: 'A08 单椅五档功能状态景',
    count: 1,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '35°侧角固定机位，单椅微调至 110° 阅读角，手捧精装建筑/时尚画册翻阅，知性专注',
    fullPrompt:
      '4:3 经典商业画幅，机位固定在单椅侧前方 35°。单椅处于 110° 知性阅读角，背部微仰有度，脚托微升抬高小腿。知性儒雅的模特双手捧着一本精装生活设计画册认真翻阅，头微低专注凝视书页，神态温润沉静。旁边边几立有一盏细腿极简金属落地阅读灯洒下一束柔光。',
    negativeConstraints: ['严禁机位偏离 35°', '严禁低头角度过大导致姿势别扭'],
    lightingAdvice: '边几暖黄阅读定向点光源 + 空间环境漫射光',
    slots: [
      {
        roleLabel: '静心阅读者',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '30-40岁 知性优雅',
        positionDesc: '单椅 110° 阅览人体工学支撑位',
        actionDesc: '双手捧书翻阅，目光专注在书页文字',
        ergonomicPosture: '小臂由扶手承托省力，腰背无悬空',
        suggestedProps: ['精装艺术画册']
      }
    ]
  },
  {
    id: 'studio-tpl-a08-05',
    name: '【A08 单椅档位5 · 110°智能数码冲浪】',
    badge: '110°移动办公 · 平板冲浪',
    targetShotCode: 'A08',
    targetShotName: 'A08 单椅五档功能状态景',
    count: 1,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '35°侧角固定机位，单椅处于 110° 科技角，手持轻薄平板电脑触控，高效又从容',
    fullPrompt:
      '4:3 经典商业画幅，机位固定在单椅侧前方 35°。单椅处于 110° 智能冲浪角。商务精英手持银色轻薄平板电脑，单手握持、另一手手指在触控屏上轻触滑动物料，边几上放着一杯美式黑咖啡与一副墨镜，呈现都市精英在家从容处理资讯的自由状态。',
    negativeConstraints: ['严禁机位偏离 35°', '严禁遮挡单椅侧边按键与扶手'],
    lightingAdvice: '明快通透自然窗光，突显科技产品与皮质奢华质感',
    slots: [
      {
        roleLabel: '数码冲浪者',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '28-36岁 青年精英',
        positionDesc: '单椅 110° 智能工作休闲位',
        actionDesc: '手持平板触控操作，神态自信利落',
        ergonomicPosture: '挺拔坐姿与脚托轻承托完美结合',
        suggestedProps: ['平板电脑', '边几黑咖啡']
      }
    ]
  },
  {
    id: 'studio-tpl-a08-companion',
    name: '【A08 单椅温情 · 亲子探身伴读】',
    badge: '2人亲子情感 · 高低落差',
    targetShotCode: 'A08',
    targetShotName: 'A08 单椅五档功能状态景',
    count: 2,
    mode: 'custom',
    recommendedAspect: '4:3',
    summary: '母亲坐于展开 120° 的单椅上，活泼萌娃在身侧椅背探身抚靠，双向对视，传递头等舱安心陪伴',
    fullPrompt:
      '4:3 单人功能单椅斜侧景。温婉知性的女主人坐在展开 120° 舒适角度的单人皮质功能椅上，双腿自然微收。身侧扶手旁，灵动活泼的小女儿或小男孩站在单椅侧后方，双手轻轻扶在椅背与宽厚扶手边缘，身体前倾探头与母亲对视。母亲侧头温柔微笑注视孩子，一手轻握孩子手臂或轻抚其背部，眼神充满爱意；孩子面带开朗笑容，高低错落生动，呈现真实的家庭陪伴温度。',
    negativeConstraints: [
      '严禁母子神情呆滞看镜头摆拍',
      '严禁孩子完全遮挡单椅皮革主轮廓',
      '严禁肢体僵直缺乏互动交集'
    ],
    lightingAdvice: '暖调柔和生活光晕，光心聚焦在母子对视目光与单椅弧线',
    slots: [
      {
        roleLabel: '母亲 (单椅坐姿位)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '30-35岁 温婉知性',
        positionDesc: '单人功能单椅展开 120°',
        actionDesc: '侧身坐于椅中，一手轻抚孩子手臂，头部微倾，温和微笑地注视孩子',
        ergonomicPosture: '背部自然倚靠，头部微侧，肢体放松无紧绷',
        suggestedProps: ['精装儿童绘本']
      },
      {
        roleLabel: '孩子 (侧后方探身位)',
        defaultRole: 'girl',
        gender: 'female',
        ageRange: '5-8岁 灵动活泼',
        positionDesc: '单椅侧后方 / 扶手外侧',
        actionDesc: '双手轻扶椅背及扶手边沿，身体前倾探头，面带开朗笑容与母亲对视',
        ergonomicPosture: '轻微踮脚前倾，活泼自然站姿',
        suggestedProps: ['手握迷你毛绒玩具']
      }
    ]
  },

  // -------------------------------------------------------------
  // A09: 餐厅配套展示组 (真值实拍：4~6人围聚大理石餐桌家宴)
  // -------------------------------------------------------------
  {
    id: 'studio-tpl-a09',
    name: '【A09 餐厅配套 · 温馨家宴聚餐】',
    badge: '6人/4人整家配套 · 4:3家宴',
    targetShotCode: 'A09',
    targetShotName: 'A09 餐厅配套展示组',
    count: 6,
    mode: '6',
    recommendedAspect: '4:3',
    summary: '一家人围聚在大理石长餐桌前举杯用餐、共享家宴，展示全屋整家配套品质与团圆幸福',
    fullPrompt:
      '4:3 餐厅平视全景视角。通色系天然奢石长餐桌与高定皮革餐椅整齐摆放。三代同堂家庭 6 人围坐聚餐：银发爷爷端坐在餐桌主座，微笑着向全家举杯致意；男主人站在餐椅旁或微前倾为家人斟倒红酒；女主人坐在对面优雅手持高脚杯微笑回应；和蔼奶奶在旁细心为孙辈分发甜点；小女儿与小儿子坐在儿童餐椅上欢笑拍手，餐桌上摆有精致西餐餐盘、玻璃高脚杯与花艺点缀。整幅画面洋溢着买整家、享天伦的温馨奢华氛围。',
    negativeConstraints: [
      '严禁桌面杂乱无章或出现外卖餐盒',
      '严禁人物身体严重遮挡餐桌餐椅设计线条',
      '严禁人物表情呆板无互动'
    ],
    lightingAdvice: '餐厅吊灯暖光下照 + 背景立面洗墙灯，烘托餐桌奢石倒影与红酒晶莹光斑',
    slots: [
      {
        roleLabel: '爷爷 (家宴主位致意座)',
        defaultRole: 'grandfather',
        gender: 'male',
        ageRange: '65-72岁 慈祥长者',
        positionDesc: '餐桌主位端座',
        actionDesc: '端正就座，单手举起红酒杯向家人致意，神态欣慰慈祥',
        ergonomicPosture: '端正体面，手臂自然抬起举杯',
        suggestedProps: ['高脚红酒杯']
      },
      {
        roleLabel: '男主人 (斟酒谈笑座)',
        defaultRole: 'father',
        gender: 'male',
        ageRange: '36-42岁 顶梁男主',
        positionDesc: '餐桌侧边中位',
        actionDesc: '身体前倾，手握红酒瓶为身旁长辈斟酒，笑容真诚从容',
        ergonomicPosture: '前倾斟酒仪态大方',
        suggestedProps: ['红酒瓶']
      },
      {
        roleLabel: '女主人 (知性品味对坐)',
        defaultRole: 'mother',
        gender: 'female',
        ageRange: '32-38岁 优雅女主',
        positionDesc: '男主人对面餐座',
        actionDesc: '优雅端坐，手轻扶高脚杯底座，温和含笑注视丈夫与孩子',
        ergonomicPosture: '坐姿挺拔优雅，仪态万方',
        suggestedProps: ['高脚水晶杯']
      },
      {
        roleLabel: '奶奶 (和蔼关爱座)',
        defaultRole: 'grandmother',
        gender: 'female',
        ageRange: '62-68岁 和蔼长辈',
        positionDesc: '爷爷身旁餐椅',
        actionDesc: '面带慈爱笑容，单手为孙女推去小点心盘',
        ergonomicPosture: '慈祥前倾，动作温和细腻',
        suggestedProps: ['精致骨瓷甜品碟']
      },
      {
        roleLabel: '女儿 (餐叙童趣座)',
        defaultRole: 'girl',
        gender: 'female',
        ageRange: '6-8岁 甜美乖巧',
        positionDesc: '母亲身旁餐位',
        actionDesc: '双手握着果汁杯，笑脸盈盈看着哥哥与家人',
        ergonomicPosture: '端正坐在餐椅上，活泼乖巧',
        suggestedProps: ['果汁玻璃杯']
      },
      {
        roleLabel: '儿子 (活泼乐享座)',
        defaultRole: 'boy',
        gender: 'male',
        ageRange: '5-7岁 活泼机灵',
        positionDesc: '父亲身旁餐位',
        actionDesc: '手拿小叉子品尝美食，神态灵动开朗',
        ergonomicPosture: '微挺胸膛，开朗用餐',
        suggestedProps: ['儿童西餐叉']
      }
    ]
  }
];

/**
 * 依据当前选中的镜头代码智能推荐最佳匹配的影棚动作模板 (严格 1:1 对齐影棚交付实拍真值)
 */
export function getRecommendedStudioTemplate(shotCode?: string): StudioChoreographyTemplate {
  if (!shotCode) return STUDIO_CHOREOGRAPHY_TEMPLATES[1]; // 默认 A01 全景
  const upper = shotCode.toUpperCase();

  // A00: 空间母版
  if (upper === 'A00') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a00') || STUDIO_CHOREOGRAPHY_TEMPLATES[0];
  }
  // A01: 空间主大场景
  if (upper === 'A01') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a01') || STUDIO_CHOREOGRAPHY_TEMPLATES[1];
  }
  // A02: 45° 3+1 组合大全景 (真值实拍：3+1成套欢聚大合影 6人/4人)
  if (upper === 'A02') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a02') || STUDIO_CHOREOGRAPHY_TEMPLATES[2];
  }
  // A03: 三人位主沙发场景 (真值实拍：聚焦 3 人位主沙发 3 人家庭聚会，无单椅)
  if (upper === 'A03') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a03') || STUDIO_CHOREOGRAPHY_TEMPLATES[3];
  }
  // A04: 三分之二主沙发亲子陪伴场景 (真值实拍：3:4 竖构图母女亲子自拍 2人)
  if (upper === 'A04') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a04') || STUDIO_CHOREOGRAPHY_TEMPLATES[5];
  }
  // A05: 三分之二主沙发私享休闲景 (真值实拍：3:4 竖构图优雅红酒微醺名媛 1人)
  if (upper === 'A05') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a05') || STUDIO_CHOREOGRAPHY_TEMPLATES[6];
  }
  // A06: 零靠墙功能闭合侧景 (真值实拍：88°侧视沙发贴墙闭合，女主耳机静听 1人)
  if (upper === 'A06') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a06') || STUDIO_CHOREOGRAPHY_TEMPLATES[7];
  }
  // A07: 沙发茶几组群中景 (真值实拍：中景，夫妻席地微醺品茗 2人)
  if (upper === 'A07') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a07') || STUDIO_CHOREOGRAPHY_TEMPLATES[8];
  }
  // A08: 单椅五档功能状态景 (真值实拍：独立头等舱单椅五大档位，推荐档位1 160°深度睡眠)
  if (upper === 'A08') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a08-01') || STUDIO_CHOREOGRAPHY_TEMPLATES[9];
  }
  // A09: 餐厅配套展示组 (真值实拍：大理石长餐桌温馨家宴聚餐 6人)
  if (upper === 'A09') {
    return STUDIO_CHOREOGRAPHY_TEMPLATES.find((t) => t.id === 'studio-tpl-a09') || STUDIO_CHOREOGRAPHY_TEMPLATES[15];
  }

  return STUDIO_CHOREOGRAPHY_TEMPLATES[1];
}

/**
 * 将影棚模板 slots 映射为当前工作区的 HumanSlotAssignment 格式
 * 并尝试根据性别与年龄角色自动匹配已导入的 ModelAsset 库
 */
export function mapStudioSlotsToAssignments(
  template: StudioChoreographyTemplate,
  availableModels: ModelAsset[] = []
): HumanSlotAssignment[] {
  return template.slots.map((slotTpl, idx) => {
    // 启发式角色最佳匹配
    let matchedModel: ModelAsset | undefined;

    if (availableModels.length > 0) {
      const targetRole = slotTpl.defaultRole;
      const isRoleMatch = (mRole?: string) => {
        if (!mRole) return false;
        const tRole = targetRole as string;
        if ((tRole === 'girl' || tRole === 'daughter') && (mRole === 'girl' || mRole === 'daughter')) return true;
        if ((tRole === 'boy' || tRole === 'son') && (mRole === 'boy' || mRole === 'son')) return true;
        if ((tRole === 'father') && (mRole === 'father')) return true;
        if ((tRole === 'mother') && (mRole === 'mother')) return true;
        if ((tRole === 'grandfather') && (mRole === 'grandfather')) return true;
        if ((tRole === 'grandmother') && (mRole === 'grandmother')) return true;
        return false;
      };

      // 1. 精确匹配角色类型标签（支持 girl/daughter、boy/son 别名对齐）
      matchedModel = availableModels.find(
        (m) => isRoleMatch(m.roleType) && (slotTpl.gender ? m.gender === slotTpl.gender : true)
      );

      // 2. 次级匹配性别或年龄组
      if (!matchedModel && slotTpl.gender) {
        matchedModel = availableModels.find((m) => m.gender === slotTpl.gender);
      }

      // 3. 兜底按次序取剩余可用角色
      if (!matchedModel) {
        matchedModel = availableModels[idx % availableModels.length];
      }
    }

    return {
      id: `slot-studio-${Date.now()}-${idx + 1}`,
      modelId: matchedModel?.id,
      modelName: matchedModel ? (matchedModel.nameZh || matchedModel.name) : undefined,
      positionDesc: slotTpl.positionDesc,
      actionDesc: slotTpl.actionDesc
    };
  });
}
