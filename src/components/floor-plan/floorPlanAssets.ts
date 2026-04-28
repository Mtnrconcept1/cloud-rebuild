export type FloorPlanAssetId =
  | "chair"
  | "stool"
  | "banquette-end"
  | "banquette-straight"
  | "corner-bench"
  | "divider-open"
  | "divider-hedge"
  | "plant"
  | "round-table-angled"
  | "round-table-top"
  | "rect-table-top"
  | "bar-top"
  | "host-stand"
  | "service-station"
  | "planter-banquette";

type FloorPlanAsset = {
  src: string;
  width: number;
  height: number;
};

const buildAssetPath = (filename: string) => encodeURI(`/plan salle/${filename}`);

export const FLOOR_PLAN_ASSETS: Record<FloorPlanAssetId, FloorPlanAsset> = {
  chair: {
    src: buildAssetPath("plan-de-salle_0000_Calque-1.png"),
    width: 151,
    height: 194,
  },
  stool: {
    src: buildAssetPath("generated-stool.png"),
    width: 220,
    height: 220,
  },
  "banquette-end": {
    src: buildAssetPath("plan-de-salle_0002_Calque-15.png"),
    width: 58,
    height: 179,
  },
  "planter-banquette": {
    src: buildAssetPath("plan-de-salle_0003_Calque-3.png"),
    width: 269,
    height: 272,
  },
  plant: {
    src: buildAssetPath("plan-de-salle_0004_Calque-4.png"),
    width: 162,
    height: 169,
  },
  "divider-open": {
    src: buildAssetPath("plan-de-salle_0005_Calque-5.png"),
    width: 141,
    height: 246,
  },
  "divider-hedge": {
    src: buildAssetPath("plan-de-salle_0006_Calque-6.png"),
    width: 137,
    height: 250,
  },
  "round-table-angled": {
    src: buildAssetPath("plan-de-salle_0008_Calque-8.png"),
    width: 136,
    height: 165,
  },
  "corner-bench": {
    src: buildAssetPath("plan-de-salle_0009_Calque-10.png"),
    width: 162,
    height: 135,
  },
  "banquette-straight": {
    src: buildAssetPath("plan-de-salle_0010_Calque-11.png"),
    width: 71,
    height: 112,
  },
  "bar-top": {
    src: buildAssetPath("plan-de-salle_0012_Supprimer-les-modifications-de-l\u2019outil.png"),
    width: 369,
    height: 91,
  },
  "host-stand": {
    src: buildAssetPath("generated-host-stand.png"),
    width: 240,
    height: 240,
  },
  "service-station": {
    src: buildAssetPath("generated-service-station.png"),
    width: 320,
    height: 220,
  },
  "round-table-top": {
    src: buildAssetPath("plan-de-salle_0013_Calque-14.png"),
    width: 149,
    height: 149,
  },
  "rect-table-top": {
    src: buildAssetPath("plan-de-salle_0014_Calque-12.png"),
    width: 164,
    height: 176,
  },
};
