import { describe, expect, it } from "vitest";
import { translate, UK } from "./i18n";

const placeholders = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(",");

describe("translate", () => {
  it("passes English through unchanged", () => {
    expect(translate("en", "Sweep")).toBe("Sweep");
    expect(translate("en", "Step {0}. Range {1}", "1 kHz", "10 MHz")).toBe("Step 1 kHz. Range 10 MHz");
  });

  it("looks up Ukrainian", () => {
    expect(translate("uk", "Sweep")).toBe("Розгортка");
    expect(translate("uk", "RESISTANCE")).toBe("ОПІР");
  });

  it("substitutes placeholders", () => {
    expect(translate("uk", "Marker {0}", 3)).toBe("Маркер 3");
    expect(translate("uk", "Connected via {0}: {1}, hw rev {2}, firmware {3}.{4}", "USB", "LiteVNA", "1", 2, 5))
      .toBe("Підключено через USB: LiteVNA, апаратна ревізія 1, прошивка 2.5");
  });

  it("falls back to English for missing keys", () => {
    expect(translate("uk", "Not a real key {0}", 7)).toBe("Not a real key 7");
  });

  it("keeps the same placeholders in every translation", () => {
    for (const [k, v] of Object.entries(UK)) expect(placeholders(v), k).toBe(placeholders(k));
  });
});
