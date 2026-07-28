import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("dashboard 3D illustrations", () => {
  it("ships optimized generated WebP assets", () => {
    for (const name of ["marketing", "photopro", "photo-add", "gallery", "creations", "analytics"]) {
      const path = resolve(process.cwd(), `public/images/dashboard-3d/${name}.webp`);
      expect(existsSync(path), `${name} should exist`).toBe(true);
      const bytes = readFileSync(path);
      expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
      expect(statSync(path).size).toBeLessThan(100_000);
    }
  });

  it("uses illustrated photo actions with a responsive two-to-three column grid", () => {
    const photos = read("src/pages/dashboard/DashboardPhotos.tsx");
    expect(photos).toContain("IllustratedActionCard");
    expect(photos).toContain('<h1 className="sr-only">Photos et créations</h1>');
    expect(photos).toContain("sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3");
    for (const key of ["photoMarketing", "photoPro", "photoAdd", "photoGallery", "photoCréations"]) expect(photos).toContain(`DASHBOARD_ILLUSTRATIONS.${key}`);
  });

  it("keeps 3D art selective and responsive across dashboard roles", () => {
    const hero = read("src/components/dashboard/DashboardPageHero.tsx");
    const client = read("src/pages/ClientDashboardHome.tsx");
    const courier = read("src/pages/courier/CourierHome.tsx");
    expect(hero).toContain("illustration?: DashboardIllustration");
    expect(hero).toContain('loading="lazy"');
    expect(hero).toContain('decoding="async"');
    expect(hero).toContain('"relative mt-6 w-full rounded-3xl');
    expect(hero).toContain('grid-cols-[minmax(0,1fr)_7.5rem]');
    expect(client).toContain("clientReservation");
    expect(client).toContain('className="hidden h-36 w-44');
    expect(courier).toContain("courierEmpty");
    expect(courier).toContain("grid-cols-1 items-center");
    expect(courier).toContain("sm:grid-cols-[minmax(0,1fr)_10rem]");
  });
});
