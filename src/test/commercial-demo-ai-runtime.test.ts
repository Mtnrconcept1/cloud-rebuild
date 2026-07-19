// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeCommercialDemoFunction = vi.hoisted(() => vi.fn());
const invokeCommercialDemoRpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/commercialDemoProject", () => ({
  invokeCommercialDemoFunction,
  invokeCommercialDemoRpc,
}));

import {
  askCommercialDemoAi,
  generateCommercialDemoVisual,
} from "@/lib/commercialDemoAi";

const runtime = {
  sessionId: "efc018a2-0c34-430c-9714-6edc91781af8",
  surface: "restaurant" as const,
};

const chatResponse = {
  conversation_id: "744f2ad5-4519-4cf3-87f5-bc2b7989bb25",
  reply: "TOK réunit commande, fidélité et outils IA dans une interface simple.",
  tool: "assistant",
  model: "gpt-5-mini",
  credit_units: 0,
  estimated_cost_chf: 0.0017,
  created_at: "2026-07-15T06:00:00.000Z",
  replayed: false,
};

describe("commercial demo AI browser runtime", () => {
  beforeEach(() => {
    invokeCommercialDemoFunction.mockReset();
    invokeCommercialDemoRpc.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates a double click and sends one authenticated Edge request", async () => {
    let complete!: (value: typeof chatResponse) => void;
    invokeCommercialDemoFunction.mockReturnValueOnce(new Promise((resolve) => {
      complete = resolve;
    }));

    const input = {
      runtime,
      tool: "assistant" as const,
      message: "Présente TOK à ce restaurateur",
      requestId: "c130b080-1a64-4f3e-9fd2-4cf2c2bc6490",
    };
    const first = askCommercialDemoAi(input);
    const second = askCommercialDemoAi(input);

    expect(invokeCommercialDemoFunction).toHaveBeenCalledTimes(1);
    expect(invokeCommercialDemoFunction).toHaveBeenCalledWith(
      "commercial-demo-ai",
      expect.objectContaining({
        action: "chat",
        request_id: input.requestId,
        session_id: runtime.sessionId,
        surface: runtime.surface,
      }),
      { timeout: 120_000 },
    );
    expect(invokeCommercialDemoFunction.mock.calls[0][1]).not.toHaveProperty("payload_hash");
    expect(invokeCommercialDemoFunction.mock.calls[0][1]).not.toHaveProperty("commercial_user_id");
    expect(invokeCommercialDemoFunction.mock.calls[0][1]).not.toHaveProperty("demo_restaurant_id");

    complete(chatResponse);
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual(chatResponse);
    expect(secondResult).toEqual(chatResponse);
  });

  it("retries transient in-flight conflicts with the identical request id", async () => {
    vi.useFakeTimers();
    invokeCommercialDemoFunction
      .mockRejectedValueOnce({ status: 409, message: "request_in_progress" })
      .mockResolvedValueOnce({ ...chatResponse, replayed: true });

    const pending = askCommercialDemoAi({
      runtime,
      tool: "support_chat",
      message: "Quels outils puis-je montrer ?",
      requestId: "a77a35ac-ae33-4ddb-86aa-a92387b2a98d",
    });
    await vi.advanceTimersByTimeAsync(400);
    const result = await pending;

    expect(result.replayed).toBe(true);
    expect(invokeCommercialDemoFunction).toHaveBeenCalledTimes(2);
    const requestIds = invokeCommercialDemoFunction.mock.calls.map((call) => call[1].request_id);
    expect(requestIds).toEqual([
      "a77a35ac-ae33-4ddb-86aa-a92387b2a98d",
      "a77a35ac-ae33-4ddb-86aa-a92387b2a98d",
    ]);
  });

  it("maps a real URL image and preserves measured cost with zero TOK credits", async () => {
    invokeCommercialDemoFunction.mockResolvedValueOnce({
        generation_id: "f330c691-864e-4942-90d5-3932c7f828d2",
        tool: "marketing_studio",
        prompt: "Un plat signature dans une lumière éditoriale",
        output_url: "https://project.supabase.co/storage/v1/object/sign/commercial-demo-ai/demo/output.webp?token=signed",
        output_mime_type: "image/webp",
        model: "gpt-image-2",
        format: "square",
        width: 1024,
        height: 1024,
        credit_units: 0,
        estimated_cost_chf: 0.0512,
        alt_text: "Plat signature TOK",
        style: "premium",
        created_at: "2026-07-15T06:00:00.000Z",
        replayed: false,
    });

    const result = await generateCommercialDemoVisual(runtime, {
      restaurantId: "8d490d7f-469d-49d2-baa9-ec10f9aaf694",
      prompt: "Un plat signature dans une lumière éditoriale",
      dishName: "Plat signature",
      format: "square",
      marketingAssetMode: true,
      generationSeed: "f330c691-864e-4942-90d5-3932c7f828d2",
    });

    expect(result.generated_image_url).toMatch(/^https:\/\//);
    expect(result.generated_image_url).not.toContain("data:image/svg+xml");
    expect(result.model).toBe("gpt-image-2");
    expect(result.credit_units).toBe(0);
    expect(result.estimated_cost_chf).toBe(0.0512);
    expect(result.generation_seed).toBe("f330c691-864e-4942-90d5-3932c7f828d2");
    expect(invokeCommercialDemoFunction).toHaveBeenCalledWith(
      "commercial-demo-ai",
      expect.objectContaining({ action: "visual_generate" }),
      { timeout: 120_000 },
    );
    const requestBody = invokeCommercialDemoFunction.mock.calls[0][1];
    expect(requestBody.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(requestBody.request_id).not.toBe("f330c691-864e-4942-90d5-3932c7f828d2");
    expect(requestBody.context.generation_seed).toBe("f330c691-864e-4942-90d5-3932c7f828d2");
  });
});
