// src/features/space-studio/data/humanPresets.ts
// MANWAH Space Studio｜模特资产、家庭预设、Pose与头等舱脚托预设库 V5.0
import {
  HumanAsset,
  PosePreset,
  FamilyPreset,
  FootrestMechanicalState
} from '../../../types/spaceStudio';

export const STANDARD_HUMAN_ASSETS: HumanAsset[] = [
  {
    id: 'human-01',
    name: '都市精英男士 (30-35岁)',
    role: 'father',
    ageRange: '30-35',
    heightCm: 180,
    wardrobeTags: ['意式羊绒衫', '高定西裤', '自然居家'],
    referenceObjectKeys: ['humans/h01_male_standing.webp', 'humans/h01_male_sitting.webp']
  },
  {
    id: 'human-02',
    name: '优雅知性女士 (28-32岁)',
    role: 'mother',
    ageRange: '28-32',
    heightCm: 168,
    wardrobeTags: ['浅米色针织衫', '垂感丝绸长裤', '温润典雅'],
    referenceObjectKeys: ['humans/h02_female_sitting.webp']
  },
  {
    id: 'human-03',
    name: '活泼小男孩 (5-7岁)',
    role: 'boy',
    ageRange: '5-7',
    heightCm: 115,
    wardrobeTags: ['纯棉素色T恤', '亚麻短裤', '童趣自然'],
    referenceObjectKeys: ['humans/h03_boy_playing.webp']
  },
  {
    id: 'human-04',
    name: '当代年轻独立居者 (26-30岁)',
    role: 'individual',
    ageRange: '26-30',
    heightCm: 175,
    wardrobeTags: ['极简亚麻衬衫', '休闲长裤', '专注舒适'],
    referenceObjectKeys: ['humans/h04_individual.webp']
  },
  {
    id: 'human-05',
    name: '慈祥长辈爷爷 (60-65岁)',
    role: 'grandfather',
    ageRange: '60-65',
    heightCm: 172,
    wardrobeTags: ['中式儒雅亚麻开衫', '深灰棉质长裤'],
    referenceObjectKeys: ['humans/h05_elderly_gentleman.webp']
  }
];

export const STANDARD_POSE_PRESETS: PosePreset[] = [
  {
    id: 'pose-seated-relaxed',
    name: '自然端坐 / 阅读小憩 (Reading / Relaxed)',
    seatRule: {
      hipsOnSeat: true,
      backSupported: true,
      legsSupported: false,
      requiresFootrest: false
    },
    promptFragment:
      'naturally seated on sofa cushion, back gently resting against ergonomic backrest, holding a hardbound architecture book, feet resting casually on the wool rug'
  },
  {
    id: 'pose-recline-lounge',
    name: '头等舱电动脚托舒展态 (Footrest Extended Recline)',
    seatRule: {
      hipsOnSeat: true,
      backSupported: true,
      legsSupported: true,
      requiresFootrest: true
    },
    promptFragment:
      'comfortably lounging in MANWAH power recline mode, head supported by cushioned headrest, motorized footrest smoothly extended supporting calves and heels'
  },
  {
    id: 'pose-zero-gravity',
    name: '110°~160° 太空零重力平躺 (Zero-Gravity Full Flat)',
    seatRule: {
      hipsOnSeat: true,
      backSupported: true,
      legsSupported: true,
      requiresFootrest: true
    },
    promptFragment:
      'experiencing MANWAH 160-degree zero-gravity deep recline posture, elevated leg support parallel to heart level, ultimate spinal relaxation, peaceful breathing luxury state'
  },
  {
    id: 'pose-side-casual',
    name: '侧身倾谈 / 咖啡时光 (Conversational / Coffee)',
    seatRule: {
      hipsOnSeat: true,
      backSupported: false,
      legsSupported: false,
      requiresFootrest: false
    },
    promptFragment:
      'seated slightly angled towards the center coffee table, holding a minimal ceramic cup, engaging in warm family interaction, natural soft ambient light'
  },
  {
    id: 'pose-child-cuddle',
    name: '亲子互动 / 依靠小憩 (Parent-Child Cuddle)',
    seatRule: {
      hipsOnSeat: true,
      backSupported: true,
      legsSupported: false,
      requiresFootrest: false
    },
    promptFragment:
      'leaning affectionately against parent on the expansive sofa cushion, holding a playful storybook, pure domestic warmth and comfort'
  }
];

export const STANDARD_FAMILY_PRESETS: FamilyPreset[] = [
  {
    id: 'fam-single-pro',
    name: '单人独享 · 精英深躺模式',
    category: 'single',
    description: '单人独立居者独享头等舱沙发功能位，电动脚托升起至零重力舒展。',
    recommendedHumans: ['human-04'],
    defaultAssignments: [
      {
        seatId: 'sofa_3s.left',
        humanAssetId: 'human-04',
        poseId: 'pose-recline-lounge',
        functionState: 'recline',
        footrestState: 'fully_extended'
      }
    ]
  },
  {
    id: 'fam-couple-leisure',
    name: '当代新婚夫妇 · 伴读书影时光',
    category: 'couple',
    description: '男士阅读小憩，女士侧身品茗，双功能位独立调节互不干扰。',
    recommendedHumans: ['human-01', 'human-02'],
    defaultAssignments: [
      {
        seatId: 'sofa_3s.left',
        humanAssetId: 'human-01',
        poseId: 'pose-recline-lounge',
        functionState: 'recline',
        footrestState: 'fully_extended'
      },
      {
        seatId: 'sofa_3s.right',
        humanAssetId: 'human-02',
        poseId: 'pose-side-casual',
        functionState: 'closed',
        footrestState: 'retracted'
      }
    ]
  },
  {
    id: 'fam-trio-warmth',
    name: '温馨三口之家 · 亲子陪伴客厅',
    category: 'trio_family',
    description: '父母分别位列左右功能位，孩子依靠中央，构成自然三角互动动线。',
    recommendedHumans: ['human-01', 'human-02', 'human-03'],
    defaultAssignments: [
      {
        seatId: 'sofa_3s.left',
        humanAssetId: 'human-01',
        poseId: 'pose-seated-relaxed',
        functionState: 'closed',
        footrestState: 'retracted'
      },
      {
        seatId: 'sofa_3s.center',
        humanAssetId: 'human-03',
        poseId: 'pose-child-cuddle',
        functionState: 'closed',
        footrestState: 'retracted'
      },
      {
        seatId: 'sofa_3s.right',
        humanAssetId: 'human-02',
        poseId: 'pose-recline-lounge',
        functionState: 'recline',
        footrestState: 'fully_extended'
      }
    ]
  },
  {
    id: 'fam-multigen-harmony',
    name: '三代同堂 · 融洽团聚时刻',
    category: 'multigen_family',
    description: '长辈尊享单人位头等舱深躺，父母与孩子落座三人位，主次分明。',
    recommendedHumans: ['human-05', 'human-01', 'human-02'],
    defaultAssignments: [
      {
        seatId: 'armchair_1s.main',
        humanAssetId: 'human-05',
        poseId: 'pose-zero-gravity',
        functionState: 'recline',
        footrestState: 'zero_gravity'
      },
      {
        seatId: 'sofa_3s.left',
        humanAssetId: 'human-01',
        poseId: 'pose-seated-relaxed',
        functionState: 'closed',
        footrestState: 'retracted'
      },
      {
        seatId: 'sofa_3s.right',
        humanAssetId: 'human-02',
        poseId: 'pose-side-casual',
        functionState: 'closed',
        footrestState: 'retracted'
      }
    ]
  }
];

export const FOOTREST_STATE_DESCRIPTIONS: Record<
  FootrestMechanicalState,
  { label: string; angleDeg: number; description: string }
> = {
  retracted: {
    label: '闭合收纳态 (0°)',
    angleDeg: 0,
    description: '脚托完全折叠贴合沙发下沿，垂直贴地，常规端坐'
  },
  elevating: {
    label: '升起半展态 (45°)',
    angleDeg: 45,
    description: '电机启动半伸展，小腿适度承托，适合阅读交谈'
  },
  fully_extended: {
    label: '完全舒展态 (90°)',
    angleDeg: 90,
    description: '脚托与座垫齐平水平伸出，小腿与脚踝完全受力支撑'
  },
  zero_gravity: {
    label: '160° 零重力悬浮态',
    angleDeg: 105,
    description: '脚托提升高于心脏水平面，靠背深倾，消除下肢重力压迫'
  }
};
