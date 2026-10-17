// --- How a twin looks: the avatar builder's options (rendered in code, see apps/web/components/village/avatar) ---

export interface Option { id: string; label: string; }
export interface ColorOption extends Option { hex: string; }

export const GENDERS: Option[] = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
  { id: "nonbinary", label: "Non-binary" }
];

export const SKIN_TONES: ColorOption[] = [
  { id: "porcelain", label: "Porcelain", hex: "#fbe3d3" },
  { id: "light", label: "Light", hex: "#f5d0b5" },
  { id: "warm", label: "Warm", hex: "#e8b68f" },
  { id: "tan", label: "Tan", hex: "#d39a6a" },
  { id: "brown", label: "Brown", hex: "#a8693f" },
  { id: "deep", label: "Deep", hex: "#6e4126" },
  { id: "ebony", label: "Ebony", hex: "#4a2a19" }
];

/** Expression: the face's resting mood (the features below set its shape). */
export const FACES: Option[] = [
  { id: "smile", label: "Smiley" },
  { id: "calm", label: "Calm" },
  { id: "cheeky", label: "Cheeky" },
  { id: "sleepy", label: "Sleepy" },
  { id: "bright", label: "Bright-eyed" },
  { id: "serious", label: "Serious" },
  { id: "shy", label: "Shy" },
  { id: "wink", label: "Winky" }
];

export const HAIRSTYLES: Option[] = [
  { id: "bald", label: "Bald" },
  { id: "buzz", label: "Buzz cut" },
  { id: "short", label: "Short" },
  { id: "side_part", label: "Side part" },
  { id: "curly", label: "Curly" },
  { id: "afro", label: "Afro" },
  { id: "mohawk", label: "Mohawk" },
  { id: "bob", label: "Bob" },
  { id: "long", label: "Long" },
  { id: "ponytail", label: "Ponytail" },
  { id: "bun", label: "Bun" },
  { id: "pigtails", label: "Pigtails" }
];

export const HAIR_COLORS: ColorOption[] = [
  { id: "black", label: "Black", hex: "#1f1a17" },
  { id: "dark_brown", label: "Dark brown", hex: "#4a2f20" },
  { id: "brown", label: "Brown", hex: "#7a4b2a" },
  { id: "auburn", label: "Auburn", hex: "#9c3f1e" },
  { id: "blonde", label: "Blonde", hex: "#e3c07a" },
  { id: "grey", label: "Grey", hex: "#b9b9b9" },
  { id: "pink", label: "Pink", hex: "#f28bb4" },
  { id: "blue", label: "Blue", hex: "#5b8cff" }
];

export const ACCESSORIES: Option[] = [
  { id: "none", label: "None" },
  { id: "round_glasses", label: "Round glasses" },
  { id: "square_glasses", label: "Square glasses" },
  { id: "sunglasses", label: "Sunglasses" },
  { id: "cap", label: "Cap" },
  { id: "beanie", label: "Beanie" },
  { id: "headphones", label: "Headphones" },
  { id: "flower", label: "Flower clip" },
  { id: "earrings", label: "Earrings" }
];

/** Clothes are not filtered by gender. */
export const OUTFITS: Option[] = [
  { id: "tshirt_jeans", label: "T-shirt & jeans" },
  { id: "hoodie", label: "Hoodie" },
  { id: "sweater_skirt", label: "Sweater & skirt" },
  { id: "dress", label: "Dress" },
  { id: "suit", label: "Suit" },
  { id: "overalls", label: "Overalls" },
  { id: "tracksuit", label: "Tracksuit" },
  { id: "shirt_shorts", label: "Shirt & shorts" }
];

export const OUTFIT_COLORS: ColorOption[] = [
  { id: "blue", label: "Blue", hex: "#3f6fd8" },
  { id: "red", label: "Red", hex: "#d9534f" },
  { id: "green", label: "Green", hex: "#3fa66b" },
  { id: "yellow", label: "Yellow", hex: "#f2c14e" },
  { id: "purple", label: "Purple", hex: "#8a63d2" },
  { id: "pink", label: "Pink", hex: "#ef8fb0" },
  { id: "black", label: "Black", hex: "#2b2f3a" },
  { id: "white", label: "White", hex: "#f3f4f6" }
];

// ---- face & body features (Bitmoji-style: gender picks the starting look, each one is its own choice) ----

export const FACE_SHAPES: Option[] = [
  { id: "round", label: "Round" },
  { id: "oval", label: "Oval" },
  { id: "heart", label: "Heart" },
  { id: "square", label: "Square" },
  { id: "long", label: "Long" },
  { id: "soft", label: "Soft" }
];

export const EYE_SHAPES: Option[] = [
  { id: "round", label: "Round" },
  { id: "almond", label: "Almond" },
  { id: "wide", label: "Big" },
  { id: "narrow", label: "Narrow" },
  { id: "upturned", label: "Upturned" },
  { id: "hooded", label: "Hooded" }
];

export const EYE_COLORS: ColorOption[] = [
  { id: "dark", label: "Dark", hex: "#2a1d16" },
  { id: "brown", label: "Brown", hex: "#6b3f22" },
  { id: "hazel", label: "Hazel", hex: "#8a6a2e" },
  { id: "green", label: "Green", hex: "#3f8a55" },
  { id: "blue", label: "Blue", hex: "#3d78c9" },
  { id: "grey", label: "Grey", hex: "#7d8a96" }
];

export const BROWS: Option[] = [
  { id: "thin", label: "Thin" },
  { id: "natural", label: "Natural" },
  { id: "arched", label: "Arched" },
  { id: "straight", label: "Straight" },
  { id: "thick", label: "Thick" },
  { id: "bushy", label: "Bushy" }
];

export const LASHES: Option[] = [
  { id: "none", label: "None" },
  { id: "natural", label: "Natural" },
  { id: "long", label: "Long" }
];

export const NOSES: Option[] = [
  { id: "button", label: "Button" },
  { id: "small", label: "Small" },
  { id: "round", label: "Round" },
  { id: "straight", label: "Straight" },
  { id: "wide", label: "Wide" },
  { id: "pointed", label: "Pointed" }
];

export const MOUTHS: Option[] = [
  { id: "small", label: "Small" },
  { id: "natural", label: "Natural" },
  { id: "wide", label: "Wide" },
  { id: "full", label: "Full lips" },
  { id: "thin", label: "Thin lips" }
];

export const LIP_COLORS: ColorOption[] = [
  { id: "natural", label: "Natural", hex: "#c9776b" },
  { id: "nude", label: "Nude", hex: "#c98f7a" },
  { id: "pink", label: "Pink", hex: "#e66f9b" },
  { id: "rose", label: "Rose", hex: "#c94f6d" },
  { id: "red", label: "Red", hex: "#c8232f" },
  { id: "berry", label: "Berry", hex: "#7e1f45" }
];

export const BLUSH: Option[] = [
  { id: "none", label: "None" },
  { id: "soft", label: "Soft" },
  { id: "rosy", label: "Rosy" }
];

export const FACIAL_HAIR: Option[] = [
  { id: "none", label: "None" },
  { id: "stubble", label: "Stubble" },
  { id: "moustache", label: "Moustache" },
  { id: "goatee", label: "Goatee" },
  { id: "short_beard", label: "Short beard" },
  { id: "full_beard", label: "Full beard" }
];

export const BUILDS: Option[] = [
  { id: "slim", label: "Slim" },
  { id: "average", label: "Average" },
  { id: "athletic", label: "Athletic" },
  { id: "curvy", label: "Curvy" },
  { id: "broad", label: "Broad" }
];

export const HEIGHTS: Option[] = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "tall", label: "Tall" }
];

export interface Appearance {
  gender: string;
  skin: string;
  face: string;
  hair: string;
  hairColor: string;
  accessory: string;
  outfit: string;
  outfitColor: string;
  // face & body features
  faceShape: string;
  eyeShape: string;
  eyeColor: string;
  brows: string;
  lashes: string;
  nose: string;
  mouth: string;
  lipColor: string;
  blush: string;
  facialHair: string;
  build: string;
  height: string;
}

/** The face & body features a gender switch resets (hair, skin and clothes stay). */
export const FEATURE_KEYS = [
  "faceShape", "eyeShape", "eyeColor", "brows", "lashes", "nose", "mouth", "lipColor", "blush", "facialHair", "build", "height"
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Each gender's starting face & body — the player can change every one of them. */
export const GENDER_PRESETS: Record<string, Pick<Appearance, FeatureKey>> = {
  female: {
    faceShape: "heart", eyeShape: "almond", eyeColor: "brown", brows: "arched", lashes: "long", nose: "small",
    mouth: "full", lipColor: "rose", blush: "soft", facialHair: "none", build: "curvy", height: "medium"
  },
  male: {
    faceShape: "square", eyeShape: "narrow", eyeColor: "brown", brows: "thick", lashes: "none", nose: "straight",
    mouth: "wide", lipColor: "natural", blush: "none", facialHair: "stubble", build: "broad", height: "tall"
  },
  nonbinary: {
    faceShape: "oval", eyeShape: "round", eyeColor: "hazel", brows: "natural", lashes: "natural", nose: "button",
    mouth: "natural", lipColor: "nude", blush: "none", facialHair: "none", build: "slim", height: "medium"
  }
};

/** Switch gender: face & body move to that gender's starting look; hair, skin, clothes and accessory stay. */
export function withGender(a: Appearance, gender: string): Appearance {
  const preset = GENDER_PRESETS[gender];
  return preset ? { ...a, gender, ...preset } : a;
}

export const DEFAULT_APPEARANCE: Appearance = {
  gender: "female",
  skin: "light",
  face: "smile",
  hair: "bob",
  hairColor: "dark_brown",
  accessory: "none",
  outfit: "tshirt_jeans",
  outfitColor: "blue",
  ...GENDER_PRESETS.female
};

const CATEGORIES: { key: keyof Appearance; options: Option[] }[] = [
  { key: "gender", options: GENDERS },
  { key: "skin", options: SKIN_TONES },
  { key: "face", options: FACES },
  { key: "hair", options: HAIRSTYLES },
  { key: "hairColor", options: HAIR_COLORS },
  { key: "accessory", options: ACCESSORIES },
  { key: "outfit", options: OUTFITS },
  { key: "outfitColor", options: OUTFIT_COLORS },
  { key: "faceShape", options: FACE_SHAPES },
  { key: "eyeShape", options: EYE_SHAPES },
  { key: "eyeColor", options: EYE_COLORS },
  { key: "brows", options: BROWS },
  { key: "lashes", options: LASHES },
  { key: "nose", options: NOSES },
  { key: "mouth", options: MOUTHS },
  { key: "lipColor", options: LIP_COLORS },
  { key: "blush", options: BLUSH },
  { key: "facialHair", options: FACIAL_HAIR },
  { key: "build", options: BUILDS },
  { key: "height", options: HEIGHTS }
];

/** Keep known ids; anything unknown or missing falls back to the default. */
export function validateAppearance(input: unknown): Appearance {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const valid = (key: keyof Appearance, options: Option[]) => {
    const v = src[key];
    return typeof v === "string" && options.some((o) => o.id === v) ? v : null;
  };
  // missing features come from the look's own gender (older saved looks have none)
  const gender = valid("gender", GENDERS) ?? DEFAULT_APPEARANCE.gender;
  const out = withGender({ ...DEFAULT_APPEARANCE }, gender);
  for (const { key, options } of CATEGORIES) {
    const v = valid(key, options);
    if (v) out[key] = v;
  }
  return out;
}

/** A random look (random villagers, the builder's "surprise me"). */
export function randomAppearance(random: () => number = Math.random): Appearance {
  const pick = (options: Option[]) => options[Math.floor(random() * options.length)].id;
  // most villagers skip accessories; a few wear one
  const accessory = random() < 0.55 ? "none" : pick(ACCESSORIES.filter((a) => a.id !== "none"));
  const gender = pick(GENDERS);
  const chance = (p: number) => random() < p;
  // start from the gender's look, then vary it so no two villagers share a face
  const base = withGender({ ...DEFAULT_APPEARANCE }, gender);
  const isMale = gender === "male";
  const isFemale = gender === "female";
  return {
    ...base,
    skin: pick(SKIN_TONES),
    face: pick(FACES),
    hair: pick(HAIRSTYLES),
    hairColor: chance(0.85) ? pick(HAIR_COLORS.slice(0, 6)) : pick(HAIR_COLORS), // fun colours stay rare
    accessory,
    outfit: pick(OUTFITS),
    outfitColor: pick(OUTFIT_COLORS),
    faceShape: pick(FACE_SHAPES),
    eyeShape: pick(EYE_SHAPES),
    eyeColor: pick(EYE_COLORS),
    brows: pick(BROWS),
    nose: pick(NOSES),
    mouth: pick(MOUTHS),
    lashes: isMale ? (chance(0.85) ? "none" : "natural") : pick(LASHES.slice(1)),
    lipColor: isFemale && chance(0.7) ? pick(LIP_COLORS.slice(1)) : chance(0.15) ? pick(LIP_COLORS.slice(1)) : "natural",
    blush: isFemale && chance(0.6) ? pick(BLUSH.slice(1)) : "none",
    facialHair: isMale && chance(0.6) ? pick(FACIAL_HAIR.slice(1)) : "none",
    build: pick(BUILDS),
    height: pick(HEIGHTS)
  };
}

/** Hex colour for a colour option id (renderer + builder swatches). */
export function colorHex(options: ColorOption[], id: string): string {
  return (options.find((o) => o.id === id) ?? options[0]).hex;
}
