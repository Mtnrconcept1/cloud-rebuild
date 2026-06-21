import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("client campaign profile fields", () => {
  it("lets clients provide the optional gender signal used by campaign targeting", () => {
    const auth = read("src/pages/Auth.tsx");
    const profile = read("src/pages/Profil.tsx");
    const targeting = read("src/components/AudienceTargeting.tsx");

    expect(auth).toContain('gender: "unspecified"');
    expect(auth).toContain(
      'gender: submittedRole === "client" ? signupForm.gender : undefined',
    );
    expect(auth).toContain(".update({ gender: normalizedGender })");
    expect(profile).toContain(
      'const [gender, setGender] = useState("unspecified")',
    );
    expect(profile).toContain("gender: normalizedGender");
    expect(targeting).toContain("GENDER_TARGET_OPTIONS");
    expect(targeting).toContain(
      "Le ciblage par genre s'appuie sur le champ optionnel renseigné par",
    );
  });
});
