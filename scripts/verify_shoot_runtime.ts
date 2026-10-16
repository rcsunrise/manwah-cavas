import { ShootCompiler } from '../src/features/space-studio/engine/shootCompiler';
import { STANDARD_SHOT_TEMPLATES } from '../src/features/space-studio/data/shotTemplates';

const a08 = STANDARD_SHOT_TEMPLATES.find(t => t.code === 'A08')!;
const shotInstance = {
  id: 'shot-live-check-01',
  templateCode: 'A08',
  name: a08.name,
  aspectRatio: '3:4',
  camera: {
    ...a08.defaultCamera,
    lensMm: 28,
    heightCm: 155,
    yawDeg: -6,
    pitchDeg: 5,
    framing: 'detail'
  },
  intent: a08.intent,
  status: 'draft',
  revisions: [],
  hasHumanPass: false
};

const result = ShootCompiler.compileShotPrompt({
  shot: shotInstance as any,
  sceneMaster: { id: 'master-01', objectKey: 'projects/p1/master.webp' } as any,
  products: [{
    id: 'prod-cheers',
    role: 'sofa_3seat',
    priority: 'primary',
    materials: ['南美进口头层牛皮 (半苯胺)'],
    colors: ['干邑暖橙 (Cognac Amber)']
  }] as any,
  spacePreset: { id: 'sp1', code: 'N-R01', name: '通透横厅大平层', ceilingHeight: 3.5 } as any,
  stylePreset: { id: 'st1', code: 'URBAN_COLLECTOR', name: '都会收藏家' } as any,
  blueprint: { items: [] } as any,
  aspectRatio: '3:4'
});

const passChecks = {
  hasCustomMandate: result.positivePrompt.includes('[SHOT MANDATE - A08 CRAFTSMANSHIP & CUSTOM PERSPECTIVE (Adjusted 28mm/155cm)]'),
  hasLensDirective: result.positivePrompt.includes('precision 28mm architectural prime lens'),
  hasHeightDirective: result.positivePrompt.includes('elevated high-angle overview at 155cm'),
  hasPitchDirective: result.positivePrompt.includes('+5° pitch tilt'),
  hasYawDirective: result.positivePrompt.includes('-6° yaw angle'),
  hasAspectDirective: result.positivePrompt.includes('proportional 3:4 vertical editorial composition'),
  no85mmConflict: !result.positivePrompt.includes('85mm telephoto macro lens'),
  noNegativePanoramaConflict: !result.negativePrompt.includes('wide room panorama'),
  aspectRatioMatch: result.aspectRatio === '3:4',
  cameraSpecMatch: result.cameraSpec.lensMm === 28 && result.cameraSpec.heightCm === 155
};

console.log('=== RUNTIME VERIFICATION RESULTS ===');
console.table(passChecks);
const allPassed = Object.values(passChecks).every(Boolean);
console.log('OVERALL OPERATIONAL STATUS:', allPassed ? '100% OPERATIONAL & VERIFIED' : 'FAILED');
