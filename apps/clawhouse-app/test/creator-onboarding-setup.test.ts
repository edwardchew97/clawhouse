import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GET } from "../app/creator-onboarding/setup/route";

describe("creator onboarding setup route", () => {
  test("keeps the completion template aligned with the creator onboarding skill", async () => {
    const account = "alice.testnet";
    const response = GET(new Request(`http://clawhouse.test/creator-onboarding/setup?creatorPublicAccount=${account}`));
    const payload = await response.json() as { completion: { template: string } };
    const skill = await readFile(
      join(import.meta.dir, "../../../skills/clawhouse-creator-onboarding/SKILL.md"),
      "utf8",
    );

    expect(payload.completion.template).toBe(completionTemplateFromSkill(skill, account));
  });
});

function completionTemplateFromSkill(skill: string, creatorPublicAccount: string) {
  const sectionStart = skill.indexOf("## Completion Response");
  expect(sectionStart).toBeGreaterThanOrEqual(0);

  const section = skill.slice(sectionStart);
  const match = section.match(/```text\n([\s\S]*?)\n```/);
  expect(match).not.toBeNull();

  return `${match![1].replaceAll("<creator_public_account>", creatorPublicAccount)}\n`;
}
