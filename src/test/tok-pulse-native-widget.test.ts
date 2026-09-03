import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TOK Pulse native iPhone widget", () => {
  const project = read("ios/App/App.xcodeproj/project.pbxproj");
  const widget = read("ios/App/TokPulseWidget/TokPulseWidget.swift");
  const widgetInfo = read("ios/App/TokPulseWidget/Info.plist");
  const pulseApi = read("supabase/functions/tok-pulse-widget/index.ts");
  const pulsePage = read("src/pages/TokPulse.tsx");
  const config = read("supabase/config.toml");

  it("embeds a real WidgetKit extension in the native iOS app", () => {
    expect(project).toContain("TokPulseWidget.appex");
    expect(project).toContain('productType = "com.apple.product-type.app-extension"');
    expect(project).toContain("Embed Foundation Extensions");
    expect(project).toContain("TokPulseWidget.swift in Sources");
    expect(project).toContain('PRODUCT_BUNDLE_IDENTIFIER = "$(TOK_APP_BUNDLE_ID).TokPulseWidget"');
    expect(widgetInfo).toContain("com.apple.widgetkit-extension");
    expect(widget).toContain("import WidgetKit");
    expect(widget).toContain("@main");
    expect(widget).toContain("TokPulseWidget: Widget");
    expect(widget).toContain(".systemSmall");
    expect(widget).toContain(".systemMedium");
    expect(widget).toContain(".systemLarge");
  });

  it("loads live public TOK Pulse data and uses universal links", () => {
    expect(widget).toContain("/functions/v1/tok-pulse-widget");
    expect(widget).toContain("https://www.thetok.ch/recherche?mode=reservation");
    expect(widget).toContain("https://www.thetok.ch/ventes-flash");
    expect(widget).toContain("https://www.thetok.ch/chefs-table");
    expect(pulseApi).toContain('.from("flash_sales")');
    expect(pulseApi).toContain('.from("chef_table_drops")');
    expect(pulseApi).toContain('.from("anti_waste_offers")');
    expect(config).toContain("[functions.tok-pulse-widget]");
  });

  it("does not claim that Safari PWA installation can provide a WidgetKit extension", () => {
    expect(pulsePage).toContain("app iOS native TOK");
    expect(pulsePage).toContain("PWA installée depuis Safari");
    expect(pulsePage).toContain("ne peut pas installer une extension WidgetKit");
  });
});
