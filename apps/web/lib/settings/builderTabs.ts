/**
 * The avatar builder's tabs (Bitmoji style): which look fields live in which
 * tab, how each one is shown, and where the preview camera looks.
 * Pure data + helpers so the layout rules can be tested.
 */

import {
  ACCESSORIES, BLUSH, BROWS, BUILDS, DEFAULT_APPEARANCE, EYE_COLORS, EYE_SHAPES, FACES, FACE_SHAPES, FACIAL_HAIR,
  HAIRSTYLES, HAIR_COLORS, HEIGHTS, LASHES, LIP_COLORS, MOUTHS, NOSES, OUTFITS, OUTFIT_COLORS, SKIN_TONES,
  validateAppearance, withGender, type Appearance, type ColorOption, type Option
} from "@aivillage/shared";

export type TabId = "body" | "face" | "hair" | "style" | "about";
export type PreviewFocus = "body" | "face";

export interface FieldDef {
  key: keyof Appearance;
  label: string;
  /** "tile" = picture tile, "swatch" = round colour swatch. */
  kind: "tile" | "swatch";
  options: Option[] | ColorOption[];
}

export interface TabDef {
  id: TabId;
  label: string;
  focus: PreviewFocus;
  fields: FieldDef[];
}

const tile = (key: keyof Appearance, label: string, options: Option[]): FieldDef => ({ key, label, kind: "tile", options });
const swatch = (key: keyof Appearance, label: string, options: ColorOption[]): FieldDef => ({ key, label, kind: "swatch", options });

/** Fields edited above the tabs (always visible). */
export const HEADER_KEYS: (keyof Appearance)[] = ["gender"];

export const BUILDER_TABS: TabDef[] = [
  {
    id: "body", label: "Body", focus: "body",
    fields: [swatch("skin", "Skin tone", SKIN_TONES), tile("build", "Build", BUILDS), tile("height", "Height", HEIGHTS)]
  },
  {
    id: "face", label: "Face", focus: "face",
    fields: [
      tile("faceShape", "Face shape", FACE_SHAPES),
      tile("face", "Expression", FACES),
      tile("eyeShape", "Eyes", EYE_SHAPES),
      swatch("eyeColor", "Eye colour", EYE_COLORS),
      tile("brows", "Eyebrows", BROWS),
      tile("lashes", "Eyelashes", LASHES),
      tile("nose", "Nose", NOSES),
      tile("mouth", "Mouth", MOUTHS),
      swatch("lipColor", "Lip colour", LIP_COLORS),
      tile("blush", "Blush", BLUSH),
      tile("facialHair", "Facial hair", FACIAL_HAIR)
    ]
  },
  {
    id: "hair", label: "Hair", focus: "face",
    fields: [tile("hair", "Hairstyle", HAIRSTYLES), swatch("hairColor", "Hair colour", HAIR_COLORS)]
  },
  {
    id: "style", label: "Style", focus: "body",
    fields: [
      tile("outfit", "Clothes", OUTFITS),
      swatch("outfitColor", "Clothes colour", OUTFIT_COLORS),
      tile("accessory", "Glasses & accessories", ACCESSORIES)
    ]
  },
  { id: "about", label: "About", focus: "body", fields: [] }
];

export function tabById(id: TabId): TabDef {
  return BUILDER_TABS.find((t) => t.id === id) ?? BUILDER_TABS[0];
}

/** Where the preview camera looks while a tab is open (Face and Hair zoom in on the head). */
export function previewFocusFor(id: TabId): PreviewFocus {
  return tabById(id).focus;
}

/** Problems with the tab layout: look fields that are missing or appear more than once. Empty = fine. */
export function coverageProblems(tabs: TabDef[] = BUILDER_TABS, header: (keyof Appearance)[] = HEADER_KEYS): string[] {
  const count = new Map<string, number>();
  for (const k of header) count.set(k, (count.get(k) ?? 0) + 1);
  for (const t of tabs) for (const f of t.fields) count.set(f.key, (count.get(f.key) ?? 0) + 1);
  const problems: string[] = [];
  for (const k of Object.keys(DEFAULT_APPEARANCE)) {
    const n = count.get(k) ?? 0;
    if (n === 0) problems.push(`${k} is missing`);
    else if (n > 1) problems.push(`${k} is in ${n} places`);
  }
  for (const k of count.keys()) if (!(k in DEFAULT_APPEARANCE)) problems.push(`${k} is not a look field`);
  return problems;
}

/** Roving focus inside a radio group / tab list: the next index for a key, or null if the key does nothing. */
export function nextIndex(current: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (current + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** The look the builder starts from: known values kept, anything missing from that gender's starting look. */
export function startingLook(initial: Partial<Appearance> | undefined): Appearance {
  return validateAppearance(initial ?? DEFAULT_APPEARANCE);
}

/** Each gender's starting hairstyle (Bitmoji-style default — every style stays open to everyone). */
const GENDER_HAIR: Record<string, string> = { female: "bob", male: "short", nonbinary: "side_part" };

/**
 * Switch gender in the builder: face & body move to the gender's starting look.
 * The hairstyle follows too — until the player picks one themselves.
 */
export function switchGender(look: Appearance, gender: string, hairChosen: boolean): Appearance {
  const next = withGender(look, gender);
  return hairChosen || !GENDER_HAIR[gender] ? next : { ...next, hair: GENDER_HAIR[gender] };
}
