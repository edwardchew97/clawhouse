import { describe, expect, test } from "bun:test";
import { buyAttachedDeposit, localBuyQuote, localSellQuote, maxBuyQuoteFromSupply } from "../app/api/key-market/lib";

describe("key-market local quote math", () => {
  test("matches the contract buy quote for the first purchasable key", () => {
    const quote = localBuyQuote("terminal_chad", "1", "1");

    expect(quote).toMatchObject({
      agent_id: "terminal_chad",
      amount: "1",
      supply_before: "1",
      supply_after: "2",
      price: "50500000000000000000000",
      protocol_fee: "2525000000000000000000",
      creator_fee: "2525000000000000000000",
      total_cost: "55550000000000000000000",
      payout: "0",
    });
  });

  test("matches the contract buy quote for a multi-key range", () => {
    const quote = localBuyQuote("terminal_chad", "1", "2");

    expect(quote.price).toBe("102500000000000000000000");
    expect(quote.total_cost).toBe("112750000000000000000000");
    expect(quote.supply_after).toBe("3");
  });

  test("computes sell payout from the same bonding curve range", () => {
    const quote = localSellQuote("terminal_chad", "3", "1");

    expect(quote.price).toBe("52000000000000000000000");
    expect(quote.payout).toBe("46800000000000000000000");
    expect(quote.supply_after).toBe("2");
  });

  test("computes max buy without repeated RPC quotes", () => {
    const storageDepositYocto = "20000000000000000000000";
    const spendableYocto = BigInt("100000000000000000000000");
    const result = maxBuyQuoteFromSupply("terminal_chad", "1", spendableYocto, 100, storageDepositYocto);

    expect(result.amount).toBe(1);
    expect(result.quote?.total_cost).toBe("55550000000000000000000");
    expect(result.quote ? buyAttachedDeposit(result.quote, storageDepositYocto).toString() : null)
      .toBe("76105500000000000000000");
  });
});
