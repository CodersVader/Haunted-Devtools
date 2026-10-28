import { describe, expect, it } from "vitest";
import { decorateGhostCommentary } from "./personality";

describe("ghost personalities", () => {
  it("changes only commentary presentation", () => {
    expect(decorateGhostCommentary("mentor", "Check the route.")).toContain("Check the route.");
    expect(decorateGhostCommentary("spooky", "")).toContain("whispering");
  });
});
