"use client";

import { useEffect, useRef } from "react";
import { NearConnector, type Account, type NearWalletBase } from "@hot-labs/near-connect";

type TradeSide = "buy" | "sell";
type TradeTone = "idle" | "pending" | "success" | "error";

type KeyMarketConfig = {
  networkId: "testnet";
  contractId: string;
  gas: string;
};

type DemoAgent = {
  id: string;
  name: string;
  displayName?: string;
  boardId?: string;
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
  phase?: "idle" | "connecting" | "quoting" | "signing" | "refreshing" | "unlocking";
  lastTxHash?: string | null;
  explorerUrl?: string | null;
  state?: Record<string, unknown> | null;
  quote?: Record<string, unknown> | null;
  quoteSide?: TradeSide | null;
  protection?: Record<string, unknown> | null;
  activity?: Record<string, unknown> | null;
  activityError?: string | null;
  backend?: Record<string, unknown> | null;
  readToken?: string | null;
  readAccess?: {
    boardId: string;
    holderAccountId: string;
    expiresAt: string;
  } | null;
  readAccessError?: string | null;
  error?: string | null;
  statusTitle?: string;
  statusBody?: string;
  statusTone?: TradeTone;
};

type DemoApi = {
  getSelectedAgent: () => DemoAgent;
  getTradeSide: () => TradeSide;
  getKeyAmount: () => string;
  setChainState: (state: DemoChainState) => void;
  showToast: (message: string, options?: ToastOptions) => void;
};

type QuoteResponse = {
  quote: Record<string, unknown>;
  protection: {
    attached_deposit?: string;
    max_price?: string;
    min_payout?: string;
  };
};

type ReadTokenChallengeResponse = {
  challenge: {
    challenge: string;
    message: string;
    recipient: string;
    nonce: string;
  };
};

type ReadTokenResponse = {
  readToken: string;
  expiresAt: string;
};

declare global {
  interface Window {
    ClawHouseDemo?: DemoApi;
  }
}

export function KeyMarketWalletBridge() {
  const connectorRef = useRef<NearConnector | null>(null);
  const walletRef = useRef<NearWalletBase | null>(null);
  const accountRef = useRef<Account | null>(null);
  const configRef = useRef<KeyMarketConfig | null>(null);
  const initializeRef = useRef<Promise<void> | null>(null);
  const busyRef = useRef(false);
  const readTokenRef = useRef<{
    boardId: string;
    holderAccountId: string;
    readToken: string;
    expiresAt: string;
  } | null>(null);

  useEffect(() => {
    let disposed = false;

    async function ensureConnector() {
      if (connectorRef.current && configRef.current) return;
      if (initializeRef.current) return initializeRef.current;

      const initializePromise = (async () => {
        const config = await fetchJson<{ config: KeyMarketConfig }>("/api/key-market/config")
          .then((response) => response.config);
        if (disposed) return;

        configRef.current = config;
        const connector = new NearConnector({
          network: config.networkId,
          features: {
            signMessage: true,
            signAndSendTransaction: true,
            signInWithoutAddKey: true,
            testnet: true,
          },
          footerBranding: null,
        });
        connectorRef.current = connector;
        await connector.whenManifestLoaded;
        if (disposed) return;

        connector.on("wallet:signIn", ({ wallet, accounts }) => {
          walletRef.current = wallet;
          accountRef.current = accounts[0] ?? null;
          renderChainState({
            accountId: accountRef.current?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
          });
          void refreshWalletRead("wallet:signIn");
        });
        connector.on("wallet:signOut", () => {
          walletRef.current = null;
          accountRef.current = null;
          readTokenRef.current = null;
          renderChainState({
            accountId: null,
            contractId: config.contractId,
            networkId: config.networkId,
            readToken: null,
            readAccess: null,
            backend: null,
          });
        });

        await restoreWallet(connector);
      })();
      initializeRef.current = initializePromise.catch((error) => {
        initializeRef.current = null;
        throw error;
      });

      return initializeRef.current;
    }

    async function restoreWallet(connector: NearConnector) {
      try {
        const connected = await connector.getConnectedWallet();
        walletRef.current = connected.wallet;
        accountRef.current = connected.accounts[0] ?? null;
        renderChainState({
          accountId: accountRef.current?.accountId ?? null,
          contractId: configRef.current?.contractId,
          networkId: configRef.current?.networkId,
        });
      } catch {
        renderChainState({
          accountId: null,
          contractId: configRef.current?.contractId,
          networkId: configRef.current?.networkId,
        });
      }
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
      if (busyRef.current) return;
      busyRef.current = true;
      renderChainState({
        pending: true,
        phase: "connecting",
        statusTitle: "Opening NEAR wallet",
        statusBody: "Choose a testnet account to continue.",
        statusTone: "pending",
      });

      try {
        await ensureConnector();
        const connector = connectorRef.current;
        if (!connector || !configRef.current) throw new Error("NEAR wallet connector is unavailable.");

        if (accountRef.current) {
          renderChainState({
            accountId: accountRef.current.accountId,
            pending: false,
            phase: "idle",
            statusTitle: "Wallet connected",
            statusBody: shortAccount(accountRef.current.accountId),
            statusTone: "success",
          });
          await refreshWalletRead("restore");
          return;
        }

        const wallet = await connector.connect();
        const accounts = await wallet.getAccounts({ network: configRef.current.networkId });
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
        await refreshWalletRead("connect");
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
      if (busyRef.current) return;
      busyRef.current = true;
      renderChainState({
        pending: true,
        phase: "connecting",
        statusTitle: "Disconnecting wallet",
        statusBody: "Clearing the active NEAR session.",
        statusTone: "pending",
      });

      try {
        await connectorRef.current?.disconnect(walletRef.current ?? undefined);
      } finally {
        walletRef.current = null;
        accountRef.current = null;
        readTokenRef.current = null;
        renderChainState({
          accountId: null,
          pending: false,
          phase: "idle",
          lastTxHash: null,
          explorerUrl: null,
          statusTitle: "Wallet disconnected",
          statusBody: "Connect Wallet",
          statusTone: "idle",
          readToken: null,
          readAccess: null,
          backend: null,
        });
        busyRef.current = false;
        showToast("NEAR wallet disconnected.");
      }
    }

    async function submitTrade(forcedSide?: TradeSide) {
      if (busyRef.current) return;
      try {
        await ensureConnector();
      } catch (error) {
        const message = errorMessage(error, "Wallet setup failed.");
        renderChainState({
          pending: false,
          phase: "idle",
          statusTitle: "Wallet setup failed",
          statusBody: message,
          statusTone: "error",
        });
        showToast(message);
        return;
      }
      const demo = window.ClawHouseDemo;
      const config = configRef.current;
      if (!demo || !config) return;

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
      const accountId = accountRef.current.accountId;

      let quoteResponse: QuoteResponse;
      try {
        renderChainState({
          accountId,
          pending: true,
          phase: "quoting",
          lastTxHash: null,
          explorerUrl: null,
          statusTitle: `Refreshing ${side} quote`,
          statusBody: "Reading the latest NEAR testnet key-market quote.",
          statusTone: "pending",
        });
        quoteResponse = await fetchJson<QuoteResponse>(
          `/api/key-market/quote?side=${side}&agentId=${encodeURIComponent(agent.id)}&amount=${encodeURIComponent(amount)}`,
        );
      } catch (error) {
        busyRef.current = false;
        renderChainState({
          accountId,
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
                max_price: requireString(quoteResponse.protection.max_price, "Missing max buy price."),
              },
              gas: config.gas,
              deposit: requireString(quoteResponse.protection.attached_deposit, "Missing attached deposit."),
            },
          }
        : {
            type: "FunctionCall" as const,
            params: {
              methodName: "sell_key",
              args: {
                agent_id: agent.id,
                amount,
                min_payout: requireString(quoteResponse.protection.min_payout, "Missing minimum payout."),
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
        statusBody: `${amount} ${agent.displayName ?? agent.name} key${amount === "1" ? "" : "s"} will be sent to ${config.contractId}.`,
        statusTone: "pending",
      });

      try {
        const result = await wallet.signAndSendTransaction({
          network: config.networkId,
          signerId: accountId,
          receiverId: config.contractId,
          actions: [action],
        });
        const failure = executionFailure(result);
        if (failure) throw new Error(failure);

        const txHash = extractTxHash(result);
        const explorerUrl = nearBlocksTxUrl(txHash, config.networkId);
        renderChainState({
          accountId,
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
        await refreshWalletRead("trade-confirmed");
        let activityRecorded = false;
        let activityReportError = "";
        if (txHash) {
          try {
            await reportKeyMarketActivity({
              txHash,
              signerId: accountId,
              agentId: agent.id,
              side,
              amount,
              contractId: config.contractId,
              networkId: config.networkId,
            });
            activityRecorded = true;
            await refreshWalletRead("activity-reported");
          } catch (error) {
            activityReportError = errorMessage(error, "Activity report failed.");
            showToast(`Activity report failed: ${activityReportError}`, { durationMs: 4200 });
          }
        }
        renderChainState({
          accountId,
          pending: false,
          phase: "idle",
          lastTxHash: txHash,
          explorerUrl,
          statusTitle: `${actionLabel} complete`,
          statusBody: txHash
            ? `Tx ${shortHash(txHash)}. Key balance refreshed.${activityRecorded ? " Activity recorded." : activityReportError ? " Activity report failed." : ""}`
            : "Transaction confirmed and key balance refreshed.",
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

    async function refreshWalletRead(_reason: string) {
      const demo = window.ClawHouseDemo;
      const config = configRef.current;
      const account = accountRef.current;
      if (!demo || !config) return;

      const agent = demo.getSelectedAgent();
      const side = demo.getTradeSide();
      const amount = normalizedAmount(demo.getKeyAmount());
      const holderParam = account?.accountId ? `&holderId=${encodeURIComponent(account.accountId)}` : "";
      const statePath = `/api/key-market/state?agentId=${encodeURIComponent(agent.id)}${holderParam}`;
      const quotePath = `/api/key-market/quote?side=${side}&agentId=${encodeURIComponent(agent.id)}&amount=${encodeURIComponent(amount)}`;
      const activityPath = `/api/key-market/activity?agentId=${encodeURIComponent(agent.id)}&limit=7`;
      const [stateResult, quoteResult, activityResult] = await Promise.allSettled([
        fetchJson<{ state: Record<string, unknown> }>(statePath),
        fetchJson<QuoteResponse>(quotePath),
        fetchJson<Record<string, unknown>>(activityPath),
      ]);
      const state = stateResult.status === "fulfilled" ? stateResult.value.state : null;
      const activeTokenResult = await Promise.allSettled([ensureReadToken(agent, state)]).then((results) => results[0]);
      const activeToken = activeTokenResult.status === "fulfilled" ? activeTokenResult.value : null;
      const backendResult = await Promise.allSettled([
        fetchBackendBoard(agent, activeToken?.readToken ?? null),
      ]).then((results) => results[0]);

      renderChainState({
        accountId: account?.accountId ?? null,
        contractId: config.contractId,
        networkId: config.networkId,
        pending: false,
        phase: "idle",
        state,
        quote: quoteResult.status === "fulfilled" ? quoteResult.value.quote : null,
        quoteSide: quoteResult.status === "fulfilled" ? side : null,
        protection: quoteResult.status === "fulfilled" ? quoteResult.value.protection : null,
        activity: activityResult.status === "fulfilled" ? activityResult.value : null,
        activityError: firstRejectedMessage([activityResult]),
        backend: backendResult.status === "fulfilled" ? backendResult.value : { ok: false, error: firstRejectedMessage([backendResult]) },
        readToken: activeToken?.readToken ?? null,
        readAccess: activeToken ? {
          boardId: activeToken.boardId,
          holderAccountId: activeToken.holderAccountId,
          expiresAt: activeToken.expiresAt,
        } : null,
        readAccessError: activeTokenResult.status === "rejected"
          ? errorMessage(activeTokenResult.reason, "Room access signature failed.")
          : null,
        error: firstRejectedMessage([stateResult, quoteResult]),
      });
    }

    async function ensureReadToken(agent: DemoAgent, state: Record<string, unknown> | null) {
      const account = accountRef.current;
      const wallet = walletRef.current;
      if (!account || !wallet || !state) {
        readTokenRef.current = null;
        return null;
      }

      const balance = Number(state.holder_balance);
      if (!Number.isFinite(balance) || balance <= 0) {
        readTokenRef.current = null;
        return null;
      }

      const boardId = agent.boardId ?? agent.id;
      const config = configRef.current;
      if (!config) throw new Error("Key-market config is unavailable.");
      const cached = readTokenRef.current;
      if (
        cached
        && cached.boardId === boardId
        && cached.holderAccountId === account.accountId
        && Date.parse(cached.expiresAt) > Date.now() + 30_000
      ) {
        return cached;
      }

      if (!wallet.manifest.features.signMessage) {
        throw new Error("Selected wallet does not support signed room access.");
      }

      renderChainState({
        accountId: account.accountId,
        pending: true,
        phase: "unlocking",
        statusTitle: "Confirm room access",
        statusBody: "Sign a wallet message to unlock Agent reasoning.",
        statusTone: "pending",
      });

      const challengeResponse = await fetchJson<ReadTokenChallengeResponse>("/api/backend/read-token/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ boardId, holderAccountId: account.accountId }),
      });
      const signedMessage = await wallet.signMessage({
        network: config.networkId,
        signerId: account.accountId,
        message: challengeResponse.challenge.message,
        recipient: challengeResponse.challenge.recipient,
        nonce: base64UrlToBytes(challengeResponse.challenge.nonce),
      });
      const readTokenResponse = await fetchJson<ReadTokenResponse>("/api/backend/read-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challenge: challengeResponse.challenge.challenge,
          signedMessage,
        }),
      });

      readTokenRef.current = {
        boardId,
        holderAccountId: account.accountId,
        readToken: readTokenResponse.readToken,
        expiresAt: readTokenResponse.expiresAt,
      };
      return readTokenRef.current;
    }

    function renderChainState(state: DemoChainState) {
      window.ClawHouseDemo?.setChainState(state);
    }

    function showToast(message: string, options?: ToastOptions) {
      window.ClawHouseDemo?.showToast(message, options);
    }

    const refreshFromUi = () => {
      if (accountRef.current) void refreshWalletRead("ui-change");
    };

    document.addEventListener("click", captureClick, true);
    window.addEventListener("clawhouse:agent-change", refreshFromUi);

    return () => {
      disposed = true;
      document.removeEventListener("click", captureClick, true);
      window.removeEventListener("clawhouse:agent-change", refreshFromUi);
    };
  }, []);

  return null;
}

async function reportKeyMarketActivity(body: Record<string, string>) {
  await fetchJson("/api/key-market/activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function fetchBackendBoard(agent: DemoAgent, readToken: string | null) {
  const boardId = agent.boardId ?? agent.id;
  const headers = readToken ? { "x-clawhouse-read-token": readToken } : undefined;
  return fetchJson<Record<string, unknown>>(`/api/backend/board?boardId=${encodeURIComponent(boardId)}`, { headers });
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = await response.json() as T & { ok?: boolean; error?: string };
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

function normalizedAmount(value: string) {
  const trimmed = value.trim();
  return /^[1-9]\d{0,5}$/.test(trimmed) ? trimmed : "1";
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function requireString(value: unknown, message: string) {
  if (typeof value !== "string" || !value) throw new Error(message);
  return value;
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
