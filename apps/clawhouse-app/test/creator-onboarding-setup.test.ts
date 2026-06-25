import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { GET } from "../app/creator-onboarding/setup/route";

describe("creator onboarding setup route", () => {
  test("defaults to staging without asking the creator to choose an environment", async () => {
    const response = GET(new Request("http://clawhouse.test/creator-onboarding/setup"));
    const payload = await response.json() as {
      intake: string[];
      requiredProfilePrompt: string[];
      environment: { required: boolean; default: string; choices: string[]; userChooses: boolean };
    };

    expect(payload.intake).not.toContain("environment");
    expect(payload.requiredProfilePrompt).not.toContain("environment");
    expect(payload.environment).toMatchObject({
      required: false,
      default: "staging",
      choices: ["staging"],
      userChooses: false,
    });
  });

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

  test("returns exact raw URLs for every installable skill", async () => {
    const response = GET(new Request("http://clawhouse.test/creator-onboarding/setup"));
    const payload = await response.json() as {
      install: Array<{
        tool: string;
        parameters: { name: string; url: string };
      }>;
    };

    expect(payload.install).toEqual([
      skillInstall(
        "clawhouse-skill-directory",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-skill-directory/SKILL.md",
      ),
      skillInstall(
        "clawhouse-creator-onboarding",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/clawhouse-creator-onboarding/SKILL.md",
      ),
      skillInstall(
        "sign-clawhouse-backend-request",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/sign-clawhouse-backend-request/SKILL.md",
      ),
      skillInstall(
        "clawhouse-ledger-reporting",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/clawhouse-ledger-reporting/SKILL.md",
      ),
      skillInstall(
        "hyperliquid-paper-trading",
        "https://raw.githubusercontent.com/edwardchew97/clawhouse-onboarding-kit/main/skills/ironclaw-runtime/hyperliquid-paper-trading/SKILL.md",
      ),
    ]);
  });

  test("describes Hyperliquid-supported market discovery without user API keys", async () => {
    const response = GET(new Request("http://clawhouse.test/creator-onboarding/setup"));
    const payload = await response.json() as {
      marketScope: {
        scope: string;
        userProvidesMarketList: boolean;
        userProvidesHyperliquidApiKey: boolean;
        publicInfoUrl: string;
        discovery: {
          perpsMetadataRequest: { type: string };
          spotMetadataRequest: { type: string };
        };
        perps: { maxLeverageSource: string };
        spot: { requiredMarginMode: string; requiredLeverage: number };
      };
    };

    expect(payload.marketScope).toMatchObject({
      scope: "hyperliquid_supported",
      userProvidesMarketList: false,
      userProvidesHyperliquidApiKey: false,
      publicInfoUrl: "https://api.hyperliquid.xyz/info",
      discovery: {
        perpsMetadataRequest: { type: "metaAndAssetCtxs" },
        spotMetadataRequest: { type: "spotMetaAndAssetCtxs" },
      },
      perps: {
        maxLeverageSource: "metaAndAssetCtxs[0].universe[].maxLeverage",
      },
      spot: {
        requiredMarginMode: "spot",
        requiredLeverage: 1,
      },
    });
  });
});

function skillInstall(name: string, url: string) {
  return {
    tool: "skill_install",
    parameters: { name, url },
  };
}

function completionTemplateFromSkill(skill: string, creatorPublicAccount: string) {
  const sectionStart = skill.indexOf("## Completion Response");
  expect(sectionStart).toBeGreaterThanOrEqual(0);

  const section = skill.slice(sectionStart);
  const match = section.match(/```text\n([\s\S]*?)\n```/);
  expect(match).not.toBeNull();

  return `${match![1].replaceAll("<creator_public_account>", creatorPublicAccount)}\n`;
}
