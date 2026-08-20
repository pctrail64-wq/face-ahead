/**
 * Feature registry — EVERY path below was verified against the live
 * OpenAPI bundles at docs.perfectcorp.com on 2026-08-17.
 * Do not guess paths; they are not derivable from the doc slug
 * (e.g. "ai_photo_enhance" -> /task/enhance).
 */

export type InputKind = 'face' | 'body' | 'photo' | 'face+ref' | 'body+ref' | 'photo+mask'

export interface FeatureParam {
  key: string
  label: string
  type: 'select' | 'slider' | 'text' | 'color' | 'template'
  options?: { value: string | number; label: string }[]
  min?: number
  max?: number
  step?: number
  default?: any
  bodyKey?: string
  hint?: string
}

export interface Feature {
  id: string
  name: string
  blurb: string
  /** POST /s2s/v2.0/task/{path} — VERIFIED */
  path: string
  category: 'timeline' | 'skin' | 'style' | 'studio' | 'fix'
  input: InputKind
  icon: string
  returnsScores?: boolean
  returnsSeries?: boolean
  params?: FeatureParam[]
  fixed?: Record<string, any>
  cost?: number
  hero?: boolean
  /** requires a template_id from GET /s2s/v2.0/task/template/{path} */
  needsTemplate?: boolean
  /** documented input constraints, enforced client-side before upload */
  spec?: { maxLong?: number; minShort?: number; maxBytes?: number; formats?: string }
  /** not yet wired into the UI runner */
  disabled?: boolean
  disabledReason?: string
}

export const FEATURES: Feature[] = [
  /* ---------------- TIMELINE ---------------- */
  {
    id: 'aging',
    name: 'Time Machine',
    blurb: 'See yourself across a lifetime from one selfie.',
    path: 'aging',
    category: 'timeline',
    input: 'face',
    icon: 'clock',
    returnsSeries: true,
    cost: 3,
    hero: true,
    spec: { maxLong: 4096, minShort: 320, maxBytes: 10e6, formats: 'jpg' },
  },
  {
    id: 'skin-simulation',
    name: 'Routine Forecast',
    blurb: 'Project your skin with a routine applied.',
    path: 'skin-simulation',
    category: 'timeline',
    input: 'face',
    icon: 'sparkle',
    cost: 3,
    hero: true,
    spec: { maxLong: 2560, minShort: 480, maxBytes: 10e6 },
    fixed: {},
  },

  /* ---------------- SKIN AI ---------------- */
  {
    id: 'skin-analysis',
    name: 'Skin Scan',
    blurb: '14 dermatologist-verified concerns, scored 0-100.',
    path: 'skin-analysis',
    category: 'skin',
    input: 'face',
    icon: 'scan',
    returnsScores: true,
    cost: 2,
    hero: true,
    spec: { maxLong: 4096, minShort: 480, maxBytes: 10e6 },
    fixed: {
      format: 'json',
      dst_actions: [
        'wrinkle', 'pore', 'texture', 'acne', 'oiliness', 'radiance',
        'eye_bag', 'age_spot', 'dark_circle_v2', 'firmness', 'moisture', 'redness',
        'droopy_upper_eyelid', 'droopy_lower_eyelid',
      ],
      miniserver_args: { enable_mask_overlay: true },
    },
  },
  {
    id: 'face-analyzer',
    name: 'Face Blueprint',
    blurb: 'Face shape, ratios, colours and estimated age.',
    path: 'face-attr-analysis',
    category: 'skin',
    input: 'face',
    icon: 'grid',
    returnsScores: true,
    cost: 1,
    fixed: {
      features: [
        'faceShape', 'eyeShape', 'eyeSize', 'eyeDistance', 'eyelid',
        'eyebrowShape', 'eyebrowThickness', 'lipShape',
        'noseWidth', 'noseLength', 'cheekbones',
        'age', 'gender', 'eyeColor', 'hairColor', 'eyebrowColor', 'lipColor',
        'faceAspectRatio', 'horizontalThird', 'verticalFifth',
      ],
    },
  },
  {
    id: 'fitzpatrick',
    name: 'Fitzpatrick Type',
    blurb: 'Classify skin tone I-VI for UV sensitivity.',
    path: 'fitzpatrick-scale-analyzer',
    category: 'skin',
    input: 'face',
    icon: 'sun',
    returnsScores: true,
    cost: 1,
    fixed: { version: '1.0' },
  },
  {
    id: 'skin-tone',
    name: 'Colour Palette',
    blurb: 'Skin, eye, brow, lip and hair colour to your season.',
    path: 'skin-tone-analysis',
    category: 'skin',
    input: 'face',
    icon: 'palette',
    returnsScores: true,
    cost: 1,
    hero: true,
  },

  /* ---------------- STYLE / VTO ---------------- */
  {
    id: 'clothes',
    name: 'Outfit Try-On',
    blurb: 'Wear any garment from a product photo.',
    path: 'cloth-v4',
    category: 'style',
    input: 'body+ref',
    icon: 'shirt',
    cost: 4,
    hero: true,
    spec: { maxLong: 4096, minShort: 384, maxBytes: 10e6 },
    params: [
      {
        key: 'garment_category',
        label: 'Garment area',
        type: 'select',
        default: 'upper_body',
        options: [
          { value: 'upper_body', label: 'Top' },
          { value: 'lower_body', label: 'Bottom' },
          { value: 'full_body', label: 'Full outfit' },
          { value: 'outerwear', label: 'Outerwear' },
        ],
      },
    ],
  },
  {
    id: 'hairstyle',
    name: 'Hairstyle',
    blurb: 'Try cuts from pixie to wolf cut.',
    path: 'hair-style',
    category: 'style',
    input: 'face',
    icon: 'scissors',
    cost: 3,
    needsTemplate: true,
  },
  {
    id: 'hair-color',
    name: 'Hair Colour',
    blurb: 'Unlimited shades with realistic roots.',
    path: 'hair-color',
    category: 'style',
    input: 'face',
    icon: 'droplet',
    cost: 3,
    fixed: { preset: 'Chocolate Brown' },
    params: [
      {
        key: 'preset',
        label: 'Shade',
        type: 'select',
        default: 'Chocolate Brown',
        options: [
          { value: 'Jet Black', label: 'Jet Black' },
          { value: 'Chocolate Brown', label: 'Chocolate Brown' },
          { value: 'Honey Blonde', label: 'Honey Blonde' },
          { value: 'Platinum Blonde', label: 'Platinum Blonde' },
          { value: 'Ash Gray', label: 'Ash Gray' },
          { value: 'Rose Gold', label: 'Rose Gold' },
          { value: 'Burgundy', label: 'Burgundy' },
          { value: 'Copper Red', label: 'Copper Red' },
          { value: 'Lavender', label: 'Lavender' },
          { value: 'Teal Blue', label: 'Teal Blue' },
        ],
      },
    ],
  },
  {
    id: 'beard',
    name: 'Beard Studio',
    blurb: 'Shapes, lengths and densities.',
    path: 'beard-style',
    category: 'style',
    input: 'face',
    icon: 'user',
    cost: 3,
    needsTemplate: true,
  },
  {
    id: 'makeup-transfer',
    name: 'Makeup Transfer',
    blurb: 'Lift a full look off any reference photo.',
    path: 'mu-transfer',
    category: 'style',
    input: 'face+ref',
    icon: 'brush',
    cost: 3,
  },
  {
    id: 'teeth',
    name: 'Teeth Whitening',
    blurb: 'Natural brightening, no blue tint.',
    path: 'teeth-whiten',
    category: 'style',
    input: 'face',
    icon: 'smile',
    cost: 2,
    spec: { maxLong: 1920, minShort: 320, maxBytes: 10e6 },
    fixed: { version: '1.0', effect: { whitening_intensity: 70 } },
  },

  /* ---------------- STUDIO ---------------- */
  {
    id: 'avatar',
    name: 'AI Avatar',
    blurb: 'Stylised profile pictures from your selfie.',
    path: 'ai-avatar',
    category: 'studio',
    input: 'face',
    icon: 'star',
    cost: 4,
    needsTemplate: true,
    fixed: { output_count: 1 },
  },
  {
    id: 'studio',
    name: 'Art Portrait',
    blurb: 'Turn a selfie into a studio art piece.',
    path: 'ai-studio',
    category: 'studio',
    input: 'face',
    icon: 'frame',
    cost: 4,
    needsTemplate: true,
    fixed: { output_count: 1 },
  },
  {
    id: 'headshot',
    name: 'Pro Headshot',
    blurb: 'Business headshots and ID photos.',
    path: 'headshot',
    category: 'studio',
    input: 'face',
    icon: 'badge',
    cost: 4,
    needsTemplate: true,
    fixed: { output_count: 1 },
  },
  {
    id: 'image-generator',
    name: 'AI Art',
    blurb: 'Text-to-image with style templates.',
    path: 'text-to-image',
    category: 'studio',
    input: 'photo',
    icon: 'wand',
    cost: 3,
    needsTemplate: true,
    params: [
      { key: 'prompt', label: 'Describe the image', type: 'text', default: 'a serene mountain lake at sunset, cinematic lighting' },
      { key: 'negative_prompt', label: 'Avoid (optional)', type: 'text', default: '' },
    ],
  },
  {
    id: 'face-swap',
    name: 'Face Swap',
    blurb: 'Swap a face into any photo.',
    path: 'face-swap',
    category: 'studio',
    input: 'face+ref',
    icon: 'refresh',
    cost: 3,
  },

  /* ---------------- FIX ---------------- */
  {
    id: 'enhance',
    name: 'Ultra HD',
    blurb: 'Sharpen, upscale, denoise, fix colour.',
    path: 'enhance',
    category: 'fix',
    input: 'photo',
    icon: 'zap',
    cost: 2,
    spec: { maxLong: 4096, maxBytes: 10e6 },
    fixed: { scale: 2 },
    params: [
      {
        key: 'scale', label: 'Upscale factor', type: 'select', default: 2,
        options: [
          { value: 1, label: '1x clean-up' },
          { value: 2, label: '2x' },
          { value: 4, label: '4x' },
        ],
      },
    ],
  },
  {
    id: 'bg-removal',
    name: 'Cut Out',
    blurb: 'Pixel-accurate background removal.',
    path: 'sod',
    category: 'fix',
    input: 'photo',
    icon: 'layers',
    cost: 2,
  },
  {
    id: 'bg-change',
    name: 'Sky & Scene',
    blurb: 'Replace the background with a prompt.',
    path: 'bg-replace',
    category: 'fix',
    input: 'photo',
    icon: 'cloud',
    cost: 3,
    params: [{ key: 'prompt', label: 'New background', type: 'text', default: 'golden hour sky' }],
  },
  {
    id: 'lighting',
    name: 'Relight',
    blurb: 'Rescue dark and flat photos.',
    path: 'lighting',
    category: 'fix',
    input: 'photo',
    icon: 'bulb',
    cost: 2,
  },
  {
    id: 'colorize',
    name: 'Colorize',
    blurb: 'Bring black-and-white photos to life.',
    path: 'colorize',
    category: 'fix',
    input: 'photo',
    icon: 'rainbow',
    cost: 2,
  },
  {
    id: 'extend',
    name: 'Expand',
    blurb: 'Outpaint beyond the original frame.',
    path: 'out-paint',
    category: 'fix',
    input: 'photo',
    icon: 'frame',
    cost: 3,
    disabled: true,
    disabledReason: 'Needs a crop editor',
  },
  {
    id: 'object-removal',
    name: 'Magic Eraser',
    blurb: 'Brush over anything to erase it.',
    path: 'generative-fill',
    category: 'fix',
    input: 'photo+mask',
    icon: 'eraser',
    cost: 3,
    spec: { maxLong: 2048, maxBytes: 10e6 },
  },
]

export const CATEGORIES = [
  { id: 'timeline', label: 'Timeline', hint: 'Your face across time' },
  { id: 'skin', label: 'Skin AI', hint: 'Diagnose and score' },
  { id: 'style', label: 'Style', hint: 'Try before you buy' },
  { id: 'studio', label: 'Studio', hint: 'Generate and stylise' },
  { id: 'fix', label: 'Fix', hint: 'Repair and enhance' },
] as const

export const byId = (id: string) => FEATURES.find((f) => f.id === id)
export const activeFeatures = () => FEATURES.filter((f) => !f.disabled)

/* ---------------- Skin concern metadata ---------------- */

export const SD_CONCERNS = [
  'wrinkle', 'pore', 'texture', 'acne', 'oiliness', 'radiance',
  'eye_bag', 'age_spot', 'dark_circle_v2', 'firmness', 'moisture',
  'redness', 'droopy_upper_eyelid', 'droopy_lower_eyelid',
] as const

/** Concerns the skin-simulation endpoint accepts as intensity keys. */
export const SIMULATION_CONCERNS = [
  'radiance', 'acne', 'oiliness', 'eye_bag', 'dark_circle',
  'spot', 'pore', 'texture', 'wrinkle', 'redness',
] as const

/** analysis concern -> simulation key (names differ between endpoints) */
export const SIM_KEY_MAP: Record<string, string> = {
  age_spot: 'spot',
  dark_circle_v2: 'dark_circle',
  wrinkle: 'wrinkle',
  pore: 'pore',
  texture: 'texture',
  acne: 'acne',
  oiliness: 'oiliness',
  radiance: 'radiance',
  eye_bag: 'eye_bag',
  redness: 'redness',
}

export const CONCERN_META: Record<string, { label: string; advice: string; drivers: string[] }> = {
  wrinkle:              { label: 'Wrinkles',        advice: 'Retinoid at night, daily SPF 50.',            drivers: ['UV', 'age'] },
  pore:                 { label: 'Pores',           advice: 'Salicylic acid 2%, niacinamide.',             drivers: ['oil', 'genetics'] },
  texture:              { label: 'Texture',         advice: 'Gentle chemical exfoliation twice weekly.',   drivers: ['turnover'] },
  acne:                 { label: 'Acne',            advice: 'Benzoyl peroxide or adapalene.',              drivers: ['oil', 'bacteria'] },
  oiliness:             { label: 'Oiliness',        advice: 'Niacinamide 5%, gel cleanser.',               drivers: ['sebum'] },
  radiance:             { label: 'Radiance',        advice: 'Vitamin C serum each morning.',               drivers: ['dullness'] },
  eye_bag:              { label: 'Eye Bags',        advice: 'Caffeine eye serum, sleep and salt control.', drivers: ['fluid'] },
  age_spot:             { label: 'Age Spots',       advice: 'Tranexamic acid, strict SPF.',                drivers: ['UV'] },
  dark_circle_v2:       { label: 'Dark Circles',    advice: 'Vitamin K and retinol eye cream.',            drivers: ['vascular'] },
  firmness:             { label: 'Firmness',        advice: 'Peptides, collagen support.',                 drivers: ['collagen'] },
  moisture:             { label: 'Moisture',        advice: 'Hyaluronic acid then an occlusive.',          drivers: ['barrier'] },
  redness:              { label: 'Redness',         advice: 'Centella, azelaic acid, avoid hot water.',    drivers: ['barrier'] },
  droopy_upper_eyelid:  { label: 'Upper Eyelid',    advice: 'Firming peptide eye cream.',                  drivers: ['elasticity'] },
  droopy_lower_eyelid:  { label: 'Lower Eyelid',    advice: 'Firming peptide eye cream.',                  drivers: ['elasticity'] },
  tear_trough:          { label: 'Tear Trough',     advice: 'Hydrating eye care, consider filler.',        drivers: ['volume'] },
  skin_type:            { label: 'Skin Type',       advice: 'Match your routine to this type.',            drivers: [] },
}

export const AGING_WEIGHT: Record<string, number> = {
  wrinkle: 1.0, firmness: 0.95, age_spot: 0.9, texture: 0.7,
  radiance: 0.65, eye_bag: 0.6, dark_circle_v2: 0.55,
  droopy_upper_eyelid: 0.6, droopy_lower_eyelid: 0.6,
  pore: 0.45, moisture: 0.5, redness: 0.3, oiliness: 0.15, acne: 0.1,
}
