import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DynamicTableSvg from "@/components/floor-plan/DynamicTableSvg";
import { getResolvedFloorPlanDimensions } from "@/lib/floorPlan";
import { FloorPlanItemIllustration } from "@/components/floor-plan/FloorPlanItemIllustration";
import { FloorPlanAssetSprite } from "@/components/floor-plan/FloorPlanAssetSprite";
import {
  FLOOR_PLAN_ASSETS,
  getFloorPlanAssetAspectRatio,
  getFloorPlanAssetRect,
  getFloorPlanItemAssetId,
} from "@/components/floor-plan/floorPlanAssets";

function parse(markup: string) {
  return new DOMParser().parseFromString(
    `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
    "image/svg+xml",
  );
}

function cornerMarkup(horizontalSeats: number) {
  return parse(
    renderToStaticMarkup(
      <DynamicTableSvg
        shape="rect"
        capacity={horizontalSeats + 1}
        seatPlacements={[]}
        cornerBenchConfigs={[
          {
            corner: "top-left",
            horizontal: 92 + (horizontalSeats - 1) * 52,
            vertical: 86,
            depth: 56,
            horizontalSeats,
            verticalSeats: 1,
          },
        ]}
      />,
    ),
  );
}

describe("floor-plan transparent asset geometry", () => {
  it("maps all 22 approved pieces to distinct, local WebP sprites", () => {
    const unique = new Set(
      Object.values(FLOOR_PLAN_ASSETS).map((asset) => asset.src),
    );
    expect(unique.size).toBe(22);
    for (const asset of Object.values(FLOOR_PLAN_ASSETS)) {
      expect(asset.src).toMatch(/^\/floor-plan\/\d\d_[a-z-]+\.webp$/);
      const [left, top, right, bottom] = asset.visibleBounds;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(asset.width);
      expect(bottom).toBeLessThanOrEqual(asset.height);
      expect(right).toBeGreaterThan(left);
      expect(bottom).toBeGreaterThan(top);
    }
  });

  it("centers every visible body independently of its asymmetric transparent padding and keeps shadows", () => {
    const target = { x: 25, y: 30, width: 120, height: 80 };
    for (const asset of Object.values(FLOOR_PLAN_ASSETS)) {
      const image = getFloorPlanAssetRect(asset, target);
      const [left, top, right, bottom] = asset.visibleBounds;
      const scale = image.width / asset.width;
      expect(image.height / asset.height).toBeCloseTo(scale);
      expect(image.x + ((left + right) / 2) * scale).toBeCloseTo(
        target.x + target.width / 2,
      );
      expect(image.y + ((top + bottom) / 2) * scale).toBeCloseTo(
        target.y + target.height / 2,
      );
      expect((right - left) * scale).toBeLessThanOrEqual(target.width + 1e-8);
      expect((bottom - top) * scale).toBeLessThanOrEqual(target.height + 1e-8);
      expect(image.width).toBeGreaterThan((right - left) * scale);
      expect(image.height).toBeGreaterThan((bottom - top) * scale);
    }
  });

  it("points each round-table chair inward and paints the tabletop above its seat", () => {
    const doc = parse(
      renderToStaticMarkup(
        <DynamicTableSvg
          shape="round"
          capacity={4}
          seatPlacements={[
            { zone: "north-east", type: "chair", count: 1 },
            { zone: "south-east", type: "chair", count: 1 },
            { zone: "south-west", type: "chair", count: 1 },
            { zone: "north-west", type: "chair", count: 1 },
          ]}
        />,
      ),
    );
    const images = [...doc.querySelectorAll("image")];
    const chairs = images.filter(
      (node) => node.getAttribute("data-floor-plan-asset") === "chair",
    );
    expect(chairs).toHaveLength(4);
    expect(
      chairs.map((node) =>
        Number(node.getAttribute("transform")?.match(/rotate\(([-\d.]+)/)?.[1]),
      ),
    ).toEqual([45, 135, 225, 315]);
    expect(images.at(-1)?.getAttribute("data-floor-plan-asset")).toBe(
      "round-table-top",
    );
    const chair = chairs[0];
    expect(
      Number(chair.getAttribute("width")) /
        Number(chair.getAttribute("height")),
    ).toBeCloseTo(
      FLOOR_PLAN_ASSETS.chair.width / FLOOR_PLAN_ASSETS.chair.height,
    );
    expect(getFloorPlanAssetAspectRatio("chair")).toBeGreaterThan(1);
  });

  it("uses the real square, long, duo and high tabletop variants with the requested seats", () => {
    const square = parse(
      renderToStaticMarkup(
        <DynamicTableSvg
          shape="rect"
          capacity={4}
          tableWidth={90}
          tableHeight={90}
          seatPlacements={[
            { zone: "top", type: "chair", count: 1 },
            { zone: "right", type: "chair", count: 1 },
            { zone: "bottom", type: "chair", count: 1 },
            { zone: "left", type: "chair", count: 1 },
          ]}
        />,
      ),
    );
    expect(
      square.querySelectorAll('[data-floor-plan-asset="chair"]'),
    ).toHaveLength(4);
    expect(
      square.querySelector('[data-floor-plan-asset="square-table-top"]'),
    ).not.toBeNull();
    const long = parse(
      renderToStaticMarkup(
        <DynamicTableSvg
          shape="rect"
          capacity={6}
          tableWidth={180}
          tableHeight={80}
          seatPlacements={[
            { zone: "top", type: "chair", count: 3 },
            { zone: "bottom", type: "chair", count: 3 },
          ]}
        />,
      ),
    );
    expect(
      long.querySelectorAll('[data-floor-plan-asset="chair"]'),
    ).toHaveLength(6);
    expect(
      long.querySelector('[data-floor-plan-asset="rect-table-top"]'),
    ).not.toBeNull();
    const duo = parse(
      renderToStaticMarkup(<DynamicTableSvg shape="round" capacity={2} />),
    );
    expect(
      duo.querySelector('[data-floor-plan-asset="round-table-duo"]'),
    ).not.toBeNull();
    const high = parse(
      renderToStaticMarkup(
        <DynamicTableSvg
          shape="round"
          capacity={2}
          seatType="stool"
          visualVariant="high-table"
        />,
      ),
    );
    expect(
      high.querySelectorAll('[data-floor-plan-asset="stool"]'),
    ).toHaveLength(2);
    expect(
      high.querySelector('[data-floor-plan-asset="high-table-top"]'),
    ).not.toBeNull();
  });

  it("uses the resolved footprint as the viewBox so a circular table remains circular on the canvas", () => {
    const props = {
      shape: "round" as const,
      capacity: 4,
      tableWidth: 110,
      tableHeight: 110,
    };
    const dimensions = getResolvedFloorPlanDimensions(props);
    const doc = parse(
      renderToStaticMarkup(
        <FloorPlanItemIllustration
          kind="table"
          {...props}
          preserveAspectRatio="none"
        />,
      ),
    );
    expect(doc.querySelector("svg svg")?.getAttribute("viewBox")).toBe(
      `0 0 ${dimensions.footprintWidth} ${dimensions.footprintHeight}`,
    );
    expect(dimensions.footprintWidth).toBe(dimensions.footprintHeight);
  });

  it.each([
    ["round", "natural"],
    ["round", "walnut"],
    ["rect", "natural"],
    ["rect", "walnut"],
  ] as const)(
    "applies the %s table's %s finish only to its tabletop",
    (shape, finish) => {
      const doc = parse(
        renderToStaticMarkup(
          <FloorPlanItemIllustration
            kind="table"
            shape={shape}
            capacity={4}
            finish={finish}
          />,
        ),
      );
      const defaultDoc = parse(
        renderToStaticMarkup(
          <FloorPlanItemIllustration kind="table" shape={shape} capacity={4} />,
        ),
      );
      const images = [...doc.querySelectorAll("image")];
      const tabletop = images.at(-1);
      const chairs = [
        ...doc.querySelectorAll('[data-floor-plan-asset="chair"]'),
      ];

      expect(tabletop?.getAttribute("style")).toContain("filter:");
      expect(tabletop?.getAttribute("href")).toBe(
        [...defaultDoc.querySelectorAll("image")].at(-1)?.getAttribute("href"),
      );
      expect(chairs).toHaveLength(4);
      chairs.forEach((chair) =>
        expect(chair.getAttribute("style")).not.toContain("filter:"),
      );
      expect(
        images.filter((image) =>
          image.getAttribute("style")?.includes("filter:"),
        ),
      ).toHaveLength(1);
      expect(
        doc.querySelector("svg svg")?.getAttribute("style") || "",
      ).not.toContain("filter:");
    },
  );

  it("keeps the default oak finish unfiltered and supports the same finishes in table previews", () => {
    const oak = parse(
      renderToStaticMarkup(
        <FloorPlanItemIllustration
          kind="table"
          shape="round"
          capacity={2}
          finish="oak"
        />,
      ),
    );
    const preview = parse(
      renderToStaticMarkup(
        <FloorPlanItemIllustration kind="table" shape="rect" finish="walnut" />,
      ),
    );
    expect(
      [...oak.querySelectorAll("image")].every(
        (image) => !image.getAttribute("style")?.includes("filter:"),
      ),
    ).toBe(true);
    expect(
      preview
        .querySelector('[data-floor-plan-asset="square-table-top"]')
        ?.getAttribute("style"),
    ).toContain("filter:");
  });

  it("never applies a tabletop finish to seating or plants, even if passed directly to their sprite", () => {
    const doc = parse(
      renderToStaticMarkup(
        <>
          <FloorPlanAssetSprite
            assetId="chair"
            x={0}
            y={0}
            width={40}
            height={40}
            finish="walnut"
          />
          <FloorPlanAssetSprite
            assetId="stool"
            x={50}
            y={0}
            width={40}
            height={40}
            finish="walnut"
          />
          <FloorPlanAssetSprite
            assetId="banquette-straight"
            x={0}
            y={50}
            width={120}
            height={40}
            finish="natural"
          />
          <FloorPlanAssetSprite
            assetId="plant"
            x={0}
            y={100}
            width={40}
            height={40}
            finish="walnut"
          />
        </>,
      ),
    );
    expect(doc.querySelectorAll("image")).toHaveLength(4);
    expect(
      [...doc.querySelectorAll("image")].every(
        (image) => !image.getAttribute("style")?.includes("filter:"),
      ),
    ).toBe(true);
  });

  it("extends either corner-bench arm without increasing its seat depth or drawing it above the table", () => {
    const compact = cornerMarkup(1);
    const extended = cornerMarkup(3);
    const corner = extended.querySelector(
      '[data-floor-plan-corner="top-left"]',
    );
    expect(corner?.getAttribute("data-bench-depth")).toBe("56");
    expect(corner?.getAttribute("data-horizontal-span")).toBe("196");
    expect(corner?.getAttribute("data-vertical-span")).toBe("86");
    expect(corner?.querySelectorAll("image")).toHaveLength(4);
    const compactTopArm = compact.querySelector('[data-bench-section="0-1"]');
    const extendedTopArm = extended.querySelector('[data-bench-section="0-1"]');
    expect(extendedTopArm?.getAttribute("height")).toBe(
      compactTopArm?.getAttribute("height"),
    );
    expect(Number(extendedTopArm?.getAttribute("width"))).toBeGreaterThan(
      Number(compactTopArm?.getAttribute("width")),
    );
    const images = [...extended.querySelectorAll("image")];
    expect(
      images
        .slice(0, 4)
        .every(
          (node) =>
            node.getAttribute("data-floor-plan-asset") === "corner-bench",
        ),
    ).toBe(true);
    expect(images.at(-1)?.getAttribute("data-floor-plan-asset")).toMatch(
      /^(square|rect)-table-top$/,
    );
  });

  it("rotates a side banquette from its horizontal source after sizing it", () => {
    const doc = parse(
      renderToStaticMarkup(
        <DynamicTableSvg
          shape="rect"
          capacity={2}
          tableWidth={100}
          tableHeight={150}
          seatPlacements={[
            {
              zone: "right",
              type: "bench",
              count: 2,
              benchLength: 100,
              benchDepth: 26,
            },
          ]}
        />,
      ),
    );
    const bench = doc.querySelector(
      '[data-floor-plan-asset="banquette-straight"]',
    );
    expect(bench?.getAttribute("transform")).toMatch(/^rotate\(90 /);
    expect(Number(bench?.getAttribute("width"))).toBeGreaterThan(
      Number(bench?.getAttribute("height")),
    );
  });

  it("maps persisted visual variants without introducing new database kinds", () => {
    expect(
      getFloorPlanItemAssetId({ kind: "divider", visualVariant: "wall" }),
    ).toBe("wall");
    expect(
      getFloorPlanItemAssetId({
        kind: "divider",
        visualVariant: "wall-corner",
      }),
    ).toBe("wall-corner");
    expect(
      getFloorPlanItemAssetId({ kind: "divider", visualVariant: "door" }),
    ).toBe("door");
    expect(
      getFloorPlanItemAssetId({ kind: "divider", visualVariant: "window" }),
    ).toBe("window");
    expect(
      getFloorPlanItemAssetId({ kind: "divider", visualVariant: "planter" }),
    ).toBe("planter");
    expect(
      getFloorPlanItemAssetId({ kind: "plant", visualVariant: "table-plant" }),
    ).toBe("table-plant");
    expect(
      getFloorPlanItemAssetId({ kind: "plant", visualVariant: "parasol" }),
    ).toBe("parasol");
    expect(getFloorPlanItemAssetId({ kind: "divider" })).toBe("divider-open");
  });
});
