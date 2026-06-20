"use client";

import { useEffect, useRef } from "react";
import { NearConnector, type Account, type NearWalletBase } from "@hot-labs/near-connect";

type TradeSide = "buy" | "sell";
type TradeTone = "idle" | "pending" | "success" | "error";

type KeyMarketConfig = {
  networkId: "testnet";
  contractId: string;
  gas: string;
  defaultAgentId: string;
};

type DemoAgent = {
  id: string;
  name: string;
  boardId?: string;
};

type DemoApi = {
  getSelectedAgent: () => DemoAgent;
  getTradeSide: () => TradeSide;
  getKeyAmount: () => string;
  setChainState: (state: DemoChainState) => void;
  showToast: (message: string, options?: ToastOptions) => void;
};

type ToastOptions = {
  linkUrl?: string | null;
  linkLabel?: string;
  durationMs?: number;
};

type DemoChainState = {
  accountId?: string | null;
  contractId?: string;
  networkId?: string;
  pending?: boolean;
  phase?: "idle" | "connecting" | "quoting" | "signing" | "refreshing";
  lastTxHash?: string | null;
  explorerUrl?: string | null;
  state?: Record<string, any> | null;
  quote?: Record<string, any> | null;
  quoteSide?: TradeSide | null;
  protection?: Record<string, any> | null;
  backend?: Record<string, any> | null;
  error?: string | null;
  statusTitle?: string;
  statusBody?: string;
  statusTone?: TradeTone;
};

declare global {
  interface Window {
    ClawHouseDemo?: DemoApi;
  }
}

export function NearKeyMarketBridge() {
  const connectorRef = useRef<NearConnector | null>(null);
  const walletRef = useRef<NearWalletBase | null>(null);
  const accountRef = useRef<Account | null>(null);
  const configRef = useRef<KeyMarketConfig | null>(null);
  const refreshIdRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const refreshFromUi = () => void refreshChainState("ui-change");

    async function initialize() {
      const config = await fetchJson<{ config: KeyMarketConfig }>("/api/key-market/config")
        .then((response) => response.config);
      if (disposed) return;

      configRef.current = config;
      const connector = new NearConnector({
        network: config.networkId,
        features: {
          signAndSendTransaction: true,
          signInWithoutAddKey: true,
          testnet: true,
        },
        footerBranding: null,
      });
      connectorRef.current = connector;
      await connector.whenManifestLoaded;

      connector.on("wallet:signIn", ({ wallet, accounts }) => {
        walletRef.current = wallet;
        accountRef.current = accounts[0] ?? null;
        renderChainState({ accountId: accountRef.current?.accountId ?? null });
        void refreshChainState("wallet:signIn");
      });
      connector.on("wallet:signOut", () => {
        walletRef.current = null;
        accountRef.current = null;
        renderChainState({ accountId: null });
        void refreshChainState("wallet:signOut");
      });

      await restoreWallet(connector);
      bindDomEvents();
      await waitForDemo();
      if (!disposed) await refreshChainState("initial");
    }

    async function restoreWallet(connector: NearConnector) {
      try {
        const connected = await connector.getConnectedWallet();
        walletRef.current = connected.wallet;
        accountRef.current = connected.accounts[0] ?? null;
        renderChainState({ accountId: accountRef.current?.accountId ?? null });
      } catch {
        renderChainState({ accountId: null });
      }
    }

    function bindDomEvents() {
      window.addEventListener("clawhouse:ready", refreshFromUi);
      window.addEventListener("clawhouse:agent-change", refreshFromUi);
      window.addEventListener("clawhouse:side-change", refreshFromUi);
      window.addEventListener("clawhouse:amount-change", refreshFromUi);
      document.addEventListener("click", captureClick, true);
    }

    function unbindDomEvents() {
      window.removeEventListener("clawhouse:ready", refreshFromUi);
      window.removeEventListener("clawhouse:agent-change", refreshFromUi);
      window.removeEventListener("clawhouse:side-change", refreshFromUi);
      window.removeEventListener("clawhouse:amount-change", refreshFromUi);
      document.removeEventListener("click", captureClick, true);
    }

    async function captureClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const walletButton = target.closest("#walletButton");
      const tradeButton = target.closest("#tradeButton");
      const unlockButton = target.closest("[data-unlock-agent]");

      if (!walletButton && !tradeButton && !unlockButton) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (walletButton) {
        if (busyRef.current) return;
        if (accountRef.current) {
          await disconnectWallet();
        } else {
          await connectWallet();
        }
        return;
      }

      await submitTrade(unlockButton ? "buy" : undefined);
    }

    async function connectWallet() {
      const connector = connectorRef.current;
      if (!connector || busyRef.current) return;
      busyRef.current = true;
      renderChainState({
        pending: true,
        phase: "connecting",
        statusTitle: "Opening NEAR wallet",
        statusBody: "Choose a testnet account to continue.",
        statusTone: "pending",
      });
      try {
        const wallet = await connector.connect();
        const accounts = await wallet.getAccounts({ network: configRef.current?.networkId });
        walletRef.current = wallet;
        accountRef.current = accounts[0] ?? null;
        renderChainState({
          accountId: accountRef.current?.accountId ?? null,
          pending: false,
          phase: "idle",
          lastTxHash: null,
          explorerUrl: null,
          statusTitle: accountRef.current ? "Wallet connected" : "Wallet connected",
          statusBody: accountRef.current ? shortAccount(accountRef.current.accountId) : "No account returned by wallet.",
          statusTone: accountRef.current ? "success" : "idle",
        });
        showToast(accountRef.current ? `Connected ${shortAccount(accountRef.current.accountId)}` : "Wallet connected.");
        await refreshChainState("connect");
      } catch (error) {
        renderChainState({
          pending: false,
          phase: "idle",
          statusTitle: "Wallet connection failed",
          statusBody: errorMessage(error, "Wallet connection failed."),
          statusTone: "error",
        });
        showToast(errorMessage(error, "Wallet connection failed."));
      } finally {
        busyRef.current = false;
      }
    }

    async function disconnectWallet() {
      const connector = connectorRef.current;
      if (!connector || busyRef.current) return;
      busyRef.current = true;
      renderChainState({
        pending: true,
        phase: "connecting",
        statusTitle: "Disconnecting wallet",
        statusBody: "Clearing the active NEAR session.",
        statusTone: "pending",
      });
      try {
        await connector.disconnect(walletRef.current ?? undefined);
      } finally {
        walletRef.current = null;
        accountRef.current = null;
        renderChainState({
          accountId: null,
          pending: false,
          phase: "idle",
          lastTxHash: null,
          explorerUrl: null,
          statusTitle: "Wallet disconnected",
          statusBody: "Connect NEAR to buy or sell keys.",
          statusTone: "idle",
        });
        busyRef.current = false;
        showToast("NEAR wallet disconnected.");
        await refreshChainState("disconnect");
      }
    }

    async function refreshChainState(_reason: string) {
      const demo = window.ClawHouseDemo;
      const config = configRef.current;
      if (!demo || !config) return;

      const refreshId = ++refreshIdRef.current;
      const agent = demo.getSelectedAgent();
      const side = demo.getTradeSide();
      const amount = normalizedAmount(demo.getKeyAmount());
      const holderId = accountRef.current?.accountId ?? "";
      const statePath = `/api/key-market/state?agentId=${encodeURIComponent(agent.id)}${holderId ? `&holderId=${encodeURIComponent(holderId)}` : ""}`;
      const quotePath = `/api/key-market/quote?side=${side}&agentId=${encodeURIComponent(agent.id)}&amount=${encodeURIComponent(amount)}`;
      const backendPath = `/api/backend/board?boardId=${encodeURIComponent(agent.boardId ?? agent.id)}`;

      const [stateResult, quoteResult, backendResult] = await Promise.allSettled([
        fetchJson<{ state: Record<string, any> }>(statePath),
        fetchJson<{ quote: Record<string, any>; protection: Record<string, any> }>(quotePath),
        fetchBackend(backendPath),
      ]);
      if (disposed || refreshId !== refreshIdRef.current) return;

      renderChainState({
        accountId: holderId || null,
        contractId: config.contractId,
        networkId: config.networkId,
        state: stateResult.status === "fulfilled" ? stateResult.value.state : null,
        quote: quoteResult.status === "fulfilled" ? quoteResult.value.quote : null,
        quoteSide: quoteResult.status === "fulfilled" ? side : null,
        protection: quoteResult.status === "fulfilled" ? quoteResult.value.protection : null,
        backend: backendResult.status === "fulfilled" ? backendResult.value : {
          ok: false,
          error: firstRejectedMessage([backendResult]) ?? "Backend unavailable.",
        },
        error: firstRejectedMessage([stateResult, quoteResult]),
      });
    }

    async function submitTrade(forcedSide?: TradeSide) {
      const demo = window.ClawHouseDemo;
      const config = configRef.current;
      if (!demo || !config || busyRef.current) return;

      if (!accountRef.current) {
        await connectWallet();
        if (!accountRef.current) return;
      }

      const wallet = walletRef.current ?? await connectorRef.current?.wallet();
      if (!wallet) {
        const message = "Connect a NEAR wallet first.";
        renderChainState({ pending: false, phase: "idle", statusTitle: "Wallet required", statusBody: message, statusTone: "error" });
        showToast(message);
        return;
      }

      busyRef.current = true;
      const agent = demo.getSelectedAgent();
      const side = forcedSide ?? demo.getTradeSide();
      const amount = normalizedAmount(forcedSide ? "1" : demo.getKeyAmount());
      const actionLabel = side === "buy" ? "Buy" : "Sell";

      let quoteResponse: { quote: Record<string, any>; protection: Record<string, any> };
      try {
        renderChainState({
          accountId: accountRef.current.accountId,
          pending: true,
          phase: "quoting",
          lastTxHash: null,
          explorerUrl: null,
          statusTitle: `Refreshing ${side} quote`,
          statusBody: "Reading the latest testnet key-market quote.",
          statusTone: "pending",
        });
        quoteResponse = await fetchJson(`/api/key-market/quote?side=${side}&agentId=${encodeURIComponent(agent.id)}&amount=${encodeURIComponent(amount)}`);
      } catch (error) {
        busyRef.current = false;
        renderChainState({
          accountId: accountRef.current.accountId,
          pending: false,
          phase: "idle",
          lastTxHash: null,
          explorerUrl: null,
          statusTitle: "Quote failed",
          statusBody: errorMessage(error, "Could not refresh quote."),
          statusTone: "error",
        });
        showToast(errorMessage(error, "Could not refresh quote."));
        return;
      }

      const action = side === "buy"
        ? {
            type: "FunctionCall" as const,
            params: {
              methodName: "buy_key",
              args: {
                agent_id: agent.id,
                amount,
                max_price: quoteResponse.protection.max_price,
              },
              gas: config.gas,
              deposit: quoteResponse.protection.attached_deposit,
            },
          }
        : {
            type: "FunctionCall" as const,
            params: {
              methodName: "sell_key",
              args: {
                agent_id: agent.id,
                amount,
                min_payout: quoteResponse.protection.min_payout,
              },
              gas: config.gas,
              deposit: "0",
            },
          };

      renderChainState({
        accountId: accountRef.current.accountId,
        pending: true,
        phase: "signing",
        lastTxHash: null,
        explorerUrl: null,
        statusTitle: `Confirm ${side} in wallet`,
        statusBody: `${amount} ${agent.name} key${amount === "1" ? "" : "s"} will be sent to ${config.contractId}.`,
        statusTone: "pending",
      });
      try {
        const result = await wallet.signAndSendTransaction({
          network: config.networkId,
          signerId: accountRef.current.accountId,
          receiverId: config.contractId,
          actions: [action],
        });
        const failure = executionFailure(result);
        if (failure) throw new Error(failure);

        const txHash = extractTxHash(result);
        const explorerUrl = nearBlocksTxUrl(txHash, config.networkId);
        renderChainState({
          accountId: accountRef.current.accountId,
          pending: true,
          phase: "refreshing",
          lastTxHash: txHash,
          explorerUrl,
          statusTitle: `${actionLabel} confirmed on NEAR`,
          statusBody: txHash ? `Tx ${shortHash(txHash)} confirmed. Refreshing key balance.` : "Wallet returned success. Refreshing key balance.",
          statusTone: "success",
        });
        showToast(
          txHash ? `${actionLabel} confirmed: ${shortHash(txHash)}` : "Transaction confirmed.",
          explorerUrl ? { linkUrl: explorerUrl, linkLabel: "NearBlocks", durationMs: 9000 } : undefined,
        );
        await refreshChainState("trade-confirmed");
        renderChainState({
          accountId: accountRef.current.accountId,
          pending: false,
          phase: "idle",
          lastTxHash: txHash,
          explorerUrl,
          statusTitle: `${actionLabel} complete`,
          statusBody: txHash ? `Tx ${shortHash(txHash)}. Key balance refreshed.` : "Transaction confirmed and key balance refreshed.",
          statusTone: "success",
        });
      } catch (error) {
        const message = errorMessage(error, "Transaction failed.");
        renderChainState({
          accountId: accountRef.current.accountId,
          pending: false,
          phase: "idle",
          error: message,
          lastTxHash: null,
          explorerUrl: null,
          statusTitle: `${actionLabel} failed`,
          statusBody: message,
          statusTone: "error",
        });
        showToast(message);
      } finally {
        busyRef.current = false;
      }
    }

    function renderChainState(state: DemoChainState) {
      window.ClawHouseDemo?.setChainState(state);
    }

    function showToast(message: string, options?: ToastOptions) {
      window.ClawHouseDemo?.showToast(message, options);
    }

    void initialize();

    return () => {
      disposed = true;
      unbindDomEvents();
    };
  }, []);

  return null;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const data = await response.json() as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

async function fetchBackend(path: string) {
  const response = await fetch(path);
  const data = await response.json() as Record<string, any> & { ok?: boolean; error?: string };
  return {
    ...data,
    ok: response.ok && data.ok !== false,
    status: response.status,
    error: response.ok && data.ok !== false ? null : data.error || data.errors?.board || `Backend request failed: ${response.status}`,
  };
}

function waitForDemo() {
  if (window.ClawHouseDemo) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onReady = () => {
      window.removeEventListener("clawhouse:ready", onReady);
      resolve();
    };
    window.addEventListener("clawhouse:ready", onReady);
    window.setTimeout(resolve, 1500);
  });
}

function normalizedAmount(value: string) {
  const trimmed = value.trim();
  return /^[1-9]\d*$/.test(trimmed) ? trimmed : "1";
}

function firstRejectedMessage(results: PromiseSettledResult<unknown>[]) {
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  return rejected ? errorMessage(rejected.reason, "Key market read failed.") : null;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function extractTxHash(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const record = result as {
    transaction?: { hash?: string };
    transaction_outcome?: { id?: string };
  };
  return record.transaction?.hash ?? record.transaction_outcome?.id ?? "";
}

function executionFailure(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const status = (result as { status?: unknown }).status;
  if (!status || typeof status !== "object") return "";
  if ("Failure" in status) {
    return stringifyFailure((status as { Failure?: unknown }).Failure);
  }
  return "";
}

function stringifyFailure(value: unknown) {
  if (!value) return "Transaction failed.";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "Transaction failed.";
  }
}

function shortHash(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function nearBlocksTxUrl(txHash: string, networkId: string) {
  if (!txHash) return null;
  const host = networkId === "testnet" ? "testnet.nearblocks.io" : "nearblocks.io";
  return `https://${host}/txns/${encodeURIComponent(txHash)}`;
}

function shortAccount(accountId: string) {
  return accountId.length > 20 ? `${accountId.slice(0, 10)}...${accountId.slice(-7)}` : accountId;
}
