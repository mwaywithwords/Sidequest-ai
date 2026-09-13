/**
 * Finite geometry vocabulary for Grade 3–5.
 *
 * Qualitative answers are these labels only. Structure counts come from
 * this catalog, not from an invented measurement of the photographed
 * object. Nothing here is a semantic grader.
 */

export const GEOMETRY_LABELS = [
  "circle",
  "rectangle",
  "square",
  "triangle",
  "sphere",
  "cylinder",
  "cone",
  "cube",
  "rectangular prism",
  "line of symmetry",
  "right angle",
  "parallel lines",
] as const;

export type GeometryLabel = (typeof GEOMETRY_LABELS)[number];

export const GEOMETRY_ASPECTS = [
  "solid",
  "plane",
  "cross_section",
  "symmetry",
] as const;

export type GeometryAspect = (typeof GEOMETRY_ASPECTS)[number];

export const GEOMETRY_CHOICE_SETS = ["solid", "plane", "symmetry"] as const;

export type GeometryChoiceSet = (typeof GEOMETRY_CHOICE_SETS)[number];

export const GEOMETRY_FEATURES = [
  "faces",
  "edges",
  "vertices",
  "sides",
] as const;

export type GeometryFeature = (typeof GEOMETRY_FEATURES)[number];

export type GeometryReading = {
  objectName: string;
  category: string;
  shapeProperties: readonly string[];
  observableProperties: readonly string[];
  countableProperties: readonly string[];
};

const SOLID_LABELS: readonly GeometryLabel[] = [
  "sphere",
  "cylinder",
  "cone",
  "cube",
  "rectangular prism",
];

const PLANE_LABELS: readonly GeometryLabel[] = [
  "circle",
  "rectangle",
  "square",
  "triangle",
];

const SYMMETRY_LABELS: readonly GeometryLabel[] = [
  "line of symmetry",
  "right angle",
  "parallel lines",
];

const FORM_TOKENS: Record<GeometryLabel, readonly string[]> = {
  circle: [
    "circle",
    "circular",
    "round face",
    "circular top",
    "circular bottom",
    "circular cross",
    "clock face",
  ],
  rectangle: ["rectangle", "rectangular"],
  square: ["square"],
  triangle: ["triangle", "triangular"],
  sphere: ["sphere", "spherical", "ball"],
  cylinder: ["cylinder", "cylindrical", "cylinder-like"],
  cone: ["cone", "conical"],
  cube: ["cube", "cubic"],
  "rectangular prism": [
    "rectangular prism",
    "box",
    "prism",
    "rectangular solid",
    "carton",
  ],
  "line of symmetry": [
    "line of symmetry",
    "symmetry",
    "symmetrical",
    "bilateral",
    "left-right",
    "mirror",
  ],
  "right angle": ["right angle", "right-angle", "square corner"],
  "parallel lines": ["parallel"],
};

const NAME_HINTS: readonly {
  names: readonly string[];
  labels: readonly GeometryLabel[];
}[] = [
  { names: ["basketball", "soccer ball", "tennis ball"], labels: ["sphere"] },
  {
    names: ["bottle", "can", "flask", "shaker"],
    labels: ["cylinder", "circle"],
  },
  { names: ["box", "carton", "package"], labels: ["rectangular prism"] },
  {
    names: ["book", "notebook", "textbook", "paperback"],
    labels: ["rectangle", "rectangular prism"],
  },
  { names: ["clock", "watch"], labels: ["circle"] },
  { names: ["sneaker", "shoe", "trainer"], labels: ["line of symmetry"] },
];

const FACE_OF: Partial<Record<GeometryLabel, GeometryLabel>> = {
  sphere: "circle",
  cylinder: "circle",
  cone: "circle",
  cube: "square",
  "rectangular prism": "rectangle",
};

const CROSS_SECTION_OF: Partial<Record<GeometryLabel, GeometryLabel>> = {
  sphere: "circle",
  cylinder: "circle",
  cone: "circle",
  cube: "square",
  "rectangular prism": "rectangle",
};

const STRUCTURE: Partial<
  Record<GeometryLabel, Partial<Record<GeometryFeature, number>>>
> = {
  cube: { faces: 6, edges: 12, vertices: 8 },
  "rectangular prism": { faces: 6, edges: 12, vertices: 8 },
  cylinder: { faces: 3, edges: 2 },
  cone: { faces: 2, edges: 1, vertices: 1 },
  rectangle: { sides: 4 },
  square: { sides: 4 },
  triangle: { sides: 3 },
};

export function isGeometryLabel(value: string): value is GeometryLabel {
  return (GEOMETRY_LABELS as readonly string[]).includes(value);
}

export function isGeometryAspect(value: string): value is GeometryAspect {
  return (GEOMETRY_ASPECTS as readonly string[]).includes(value);
}

export function isGeometryChoiceSet(value: string): value is GeometryChoiceSet {
  return (GEOMETRY_CHOICE_SETS as readonly string[]).includes(value);
}

export function isGeometryFeature(value: string): value is GeometryFeature {
  return (GEOMETRY_FEATURES as readonly string[]).includes(value);
}

export function choiceSetForAspect(aspect: GeometryAspect): GeometryChoiceSet {
  if (aspect === "solid") return "solid";
  if (aspect === "symmetry") return "symmetry";
  return "plane";
}

export function labelsForChoiceSet(
  set: GeometryChoiceSet,
): readonly GeometryLabel[] {
  if (set === "solid") return SOLID_LABELS;
  if (set === "symmetry") return SYMMETRY_LABELS;
  return PLANE_LABELS;
}

export function aspectAllowsLabel(
  aspect: GeometryAspect,
  label: GeometryLabel,
): boolean {
  return labelsForChoiceSet(choiceSetForAspect(aspect)).includes(label);
}

export function normaliseGeometryLabel(raw: string): GeometryLabel | null {
  const folded = raw.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return isGeometryLabel(folded) ? folded : null;
}

export function structureCount(
  shape: GeometryLabel,
  feature: GeometryFeature,
): number | null {
  const count = STRUCTURE[shape]?.[feature];
  return count === undefined ? null : count;
}

export function looksGeometric(property: string): boolean {
  const hay = property.toLowerCase();
  if (
    /\b(shape|sphere|spherical|cylinder|circular|circle|rectangle|rectangular|square|triangle|symmetry|symmetrical|curve|curved|angle|parallel|perpendicular|face|edge|vertex|vertices|prism|cone|cube|bilateral)\b/.test(
      hay,
    )
  ) {
    return true;
  }

  return GEOMETRY_LABELS.some((label) => hay.includes(label));
}

/**
 * Whether the reading can support this label for this aspect.
 *
 * Uses observed shape language, geometric observables, and a small set of
 * object-name hints. It does not invent a length or a face count.
 */
export function shapeSupports(
  analysis: GeometryReading,
  aspect: GeometryAspect,
  label: GeometryLabel,
): boolean {
  if (!aspectAllowsLabel(aspect, label)) return false;

  const supported = supportedLabels(analysis);

  if (aspect === "solid") {
    return supported.solids.includes(label);
  }

  if (aspect === "symmetry") {
    return supported.relations.includes(label);
  }

  if (supported.planes.includes(label)) return true;

  const implied =
    aspect === "cross_section"
      ? supported.solids.map((solid) => CROSS_SECTION_OF[solid])
      : supported.solids.map((solid) => FACE_OF[solid]);

  return implied.includes(label);
}

export function supportedLabels(analysis: GeometryReading): {
  solids: GeometryLabel[];
  planes: GeometryLabel[];
  relations: GeometryLabel[];
} {
  const hay = geometryHaystack(analysis);
  const matched = GEOMETRY_LABELS.filter((label) =>
    FORM_TOKENS[label].some((token) => hay.includes(token)),
  );

  const hasGeometricObservation =
    analysis.shapeProperties.length > 0 ||
    analysis.observableProperties.some(looksGeometric) ||
    analysis.countableProperties.some(looksGeometric);

  if (!hasGeometricObservation) {
    return partitionLabels(matched);
  }

  const name = analysis.objectName.toLowerCase();
  const category = analysis.category.toLowerCase();
  const alreadyHasSolid = matched.some((label) => SOLID_LABELS.includes(label));

  for (const hint of NAME_HINTS) {
    if (
      !hint.names.some((token) => name.includes(token) || category.includes(token))
    ) {
      continue;
    }

    for (const label of hint.labels) {
      if (matched.includes(label)) continue;
      if (SOLID_LABELS.includes(label) && alreadyHasSolid) continue;
      matched.push(label);
    }
  }

  return partitionLabels(matched);
}

function partitionLabels(matched: readonly GeometryLabel[]): {
  solids: GeometryLabel[];
  planes: GeometryLabel[];
  relations: GeometryLabel[];
} {
  return {
    solids: matched.filter((label) => SOLID_LABELS.includes(label)),
    planes: matched.filter((label) => PLANE_LABELS.includes(label)),
    relations: matched.filter((label) => SYMMETRY_LABELS.includes(label)),
  };
}

function geometryHaystack(analysis: GeometryReading): string {
  return [
    analysis.objectName,
    analysis.category,
    ...analysis.shapeProperties,
    ...analysis.observableProperties.filter(looksGeometric),
    ...analysis.countableProperties.filter(looksGeometric),
  ]
    .join(" ")
    .toLowerCase();
}
