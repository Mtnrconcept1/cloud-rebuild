import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlinkoBoard from "@/components/plinko/PlinkoBoard";
import { createPlinkoTrajectory, samplePlinkoTrajectory } from "@/lib/plinko-physics";

describe("Plinko physical animation lifecycle", () => {
  let nextFrame: FrameRequestCallback;
  let nextId = 0;
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextFrame = callback;
      return ++nextId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("renders physical contacts, withholds the winning pocket and completes only after settling", () => {
    const path = createPlinkoTrajectory(0, () => 0);
    const complete = vi.fn();
    const view = render(<PlinkoBoard outcome="free_meal" playing animating trajectory={path} onAnimationComplete={complete} />);
    const coin = view.container.querySelector(".tok-plinko__coin")!;
    expect(view.container.querySelector(".is-selected")).toBeNull();
    act(() => nextFrame(100));
    const impact = path.impacts[0];
    act(() => nextFrame(100 + impact.time * 1000 + 1));
    const expected = samplePlinkoTrajectory(path, impact.time + 0.001);
    expect(coin.getAttribute("transform")).toBe(`translate(${expected.x} ${expected.y}) rotate(${expected.angle})`);
    expect(view.container.querySelectorAll('circle[r="10"]')[impact.peg].getAttribute("opacity")).not.toBe("0");
    act(() => nextFrame(100 + path.duration * 1000 - 1));
    expect(complete).not.toHaveBeenCalled();
    act(() => nextFrame(100 + path.duration * 1000 + 1));
    expect(complete).toHaveBeenCalledTimes(1);
    view.rerender(<PlinkoBoard outcome="free_meal" playing={false} animating={false} trajectory={path} onAnimationComplete={complete} />);
    expect(view.container.querySelector(".is-selected")).toHaveTextContent("Repas");
    // No jump to the centre of the pocket when the animation ends.
    const last = path.frames.at(-1)!;
    expect(coin.getAttribute("transform")).toBe(`translate(${last.x} ${last.y}) rotate(${last.angle})`);
  });

  it("finishes on the same physical position after a background-tab frame gap", () => {
    const path = createPlinkoTrajectory(4, () => 0);
    const complete = vi.fn();
    const view = render(<PlinkoBoard outcome="half_price" playing animating trajectory={path} onAnimationComplete={complete} />);
    act(() => nextFrame(0));
    act(() => nextFrame(60_000));
    expect(complete).toHaveBeenCalledTimes(1);
    const last = path.frames.at(-1)!;
    expect(view.container.querySelector(".tok-plinko__coin")).toHaveAttribute("transform", `translate(${last.x} ${last.y}) rotate(${last.angle})`);
  });

  it("cancels the frame loop on close and shows a recovered result without restarting physics", () => {
    const path = createPlinkoTrajectory(1, () => 0);
    const complete = vi.fn();
    const view = render(<PlinkoBoard outcome="replay" playing animating trajectory={path} onAnimationComplete={complete} />);
    view.unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
    vi.mocked(requestAnimationFrame).mockClear();
    render(<PlinkoBoard outcome="replay" playing={false} animating={false} trajectory={null} onAnimationComplete={complete} />);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
});
