import { describe, expect, it } from "vitest";
import { badgeDisplayMode, setBadgeDisplayMode, setShowModelBadge, showModelBadge } from "../state";

describe("permanent model badge", () => {
  it("keeps the badge visible after a legacy hidden preference", () => {
    setShowModelBadge(false);
    expect(showModelBadge()).toBe(true);
  });

  it("keeps model mode after a legacy profile preference", () => {
    setBadgeDisplayMode("profile");
    expect(badgeDisplayMode()).toBe("model");
  });
});
