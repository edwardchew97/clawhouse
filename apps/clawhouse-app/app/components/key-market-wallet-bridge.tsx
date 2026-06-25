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

type ReadAccessState = {
  boardId: string;
  holderAccountId: string;
  expiresAt: string;
};

type WalletSessionState = {
  accountId: string;
  expiresAt: string;
};

type DemoChainState = {
  accountId?: string | null;
  contractId?: string;
  networkId?: string;
  pending?: boolean;
  phase?: "idle" | "connecting" | "authenticating" | "quoting" | "signing" | "refreshing";
  lastTxHash?: string | null;
  explorerUrl?: string | null;
  state?: Record<string, unknown> | null;
  quote?: Record<string, unknown> | null;
  quoteSide?: TradeSide | null;
  protection?: Record<string, unknown> | null;
  maxBuy?: Record<string, unknown> | null;
  maxBuyError?: string | null;
  stateLoading?: boolean;
  quoteLoading?: boolean;
  maxBuyLoading?: boolean;
  activityLoading?: boolean;
  backendLoading?: boolean;
  readAccessLoading?: boolean;
  activity?: Record<string, unknown> | null;
  activityError?: string | null;
  backend?: Record<string, unknown> | null;
  readAccess?: ReadAccessState | null;
  readAccessError?: string | null;
  error?: string | null;
  statusTitle?: string;
  statusBody?: string;
  statusTone?: TradeTone;
};

type DemoApi = {
  getSelectedAgent: () => DemoAgent | null;
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

type WalletSessionChallengeResponse = {
  challenge: {
    challenge: string;
    message: string;
    recipient: string;
    nonce: string;
  };
};

type WalletSessionResponse = {
  valid: boolean;
  accountId?: string;
  expiresAt?: string;
};

type ReadSessionResponse = {
  valid: boolean;
  boardId?: string;
  holderAccountId?: string;
  expiresAt?: string;
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
  const walletSessionRef = useRef<WalletSessionState | null>(null);
  const walletSessionRequestRef = useRef<{ accountId: string; promise: Promise<WalletSessionState | null> } | null>(null);
  const readAccessRef = useRef<Map<string, ReadAccessState>>(new Map());
  const readAccessRequestRef = useRef<{ key: string; promise: Promise<ReadAccessState | null> } | null>(null);
  const clearSessionRef = useRef<Promise<void> | null>(null);
  const walletReadRefreshRef = useRef(0);

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
          void ensureWalletSession("wallet:signIn")
            .then(() => refreshWalletRead("wallet:signIn"))
            .catch((error) => {
              const message = errorMessage(error, "Wallet session signature failed.");
              renderChainState({
                accountId: accountRef.current?.accountId ?? null,
                pending: false,
                phase: "idle",
                statusTitle: "Wallet session failed",
                statusBody: message,
                statusTone: "error",
              });
              showToast(message);
            });
        });
        connector.on("wallet:signOut", () => {
          walletRef.current = null;
          accountRef.current = null;
          walletSessionRef.current = null;
          walletSessionRequestRef.current = null;
          readAccessRef.current.clear();
          readAccessRequestRef.current = null;
          walletReadRefreshRef.current += 1;
          void clearReadSession();
          renderChainState({
            accountId: null,
            contractId: config.contractId,
            networkId: config.networkId,
            readAccess: null,
            readAccessLoading: false,
            backend: null,
            backendLoading: false,
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
        if (accountRef.current) {
          window.setTimeout(() => {
            void ensureWalletSession("restore")
              .then(() => refreshWalletRead("restore"))
              .catch((error) => {
                const message = errorMessage(error, "Wallet session signature failed.");
                renderChainState({
                  accountId: accountRef.current?.accountId ?? null,
                  pending: false,
                  phase: "idle",
                  statusTitle: "Wallet session failed",
                  statusBody: message,
                  statusTone: "error",
                });
                showToast(message);
              });
          }, 0);
        }
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

      if (tradeButton && !accountRef.current) {
        await connectWallet();
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
          await ensureWalletSession("restore");
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
        if (accountRef.current) await ensureWalletSession("connect");
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
        await clearReadSession();
        walletRef.current = null;
        accountRef.current = null;
        walletSessionRef.current = null;
        walletSessionRequestRef.current = null;
        readAccessRef.current.clear();
        readAccessRequestRef.current = null;
        walletReadRefreshRef.current += 1;
        renderChainState({
          accountId: null,
          pending: false,
          phase: "idle",
          lastTxHash: null,
          explorerUrl: null,
          statusTitle: "Wallet disconnected",
          statusBody: "Connect Wallet",
          statusTone: "idle",
          readAccess: null,
          readAccessLoading: false,
          backend: null,
          backendLoading: false,
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
      const accountId = accountRef.current.accountId;
      if (!agent) {
        busyRef.current = false;
        const message = "No agent selected.";
        renderChainState({
          accountId,
          pending: false,
          phase: "idle",
          statusTitle: "No agent selected",
          statusBody: "Onboard the first paper-trading agent before buying keys.",
          statusTone: "idle",
        });
        showToast(message);
        return;
      }
      const side = forcedSide ?? demo.getTradeSide();
      const amount = normalizedAmount(forcedSide ? "1" : demo.getKeyAmount());
      const actionLabel = side === "buy" ? "Buy" : "Sell";

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
          pending: false,
          phase: "idle",
          lastTxHash: txHash,
          explorerUrl,
          statusTitle: `${actionLabel} confirmed on NEAR`,
          statusBody: txHash ? `Tx ${shortHash(txHash)} confirmed. Refreshing key data.` : "Wallet returned success. Refreshing key data.",
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
      const retryAttempt = readAccessRetryAttempt(_reason);

      const agent = demo.getSelectedAgent();
      const refreshId = ++walletReadRefreshRef.current;
      if (!agent) {
        renderChainState({
          accountId: account?.accountId ?? null,
          contractId: config.contractId,
          networkId: config.networkId,
          pending: false,
          phase: "idle",
          state: null,
          quote: null,
          quoteSide: null,
          protection: null,
          maxBuy: null,
          maxBuyError: null,
          activity: null,
          activityError: null,
          backend: null,
          backendLoading: false,
          readAccess: null,
          readAccessLoading: false,
          readAccessError: null,
          error: null,
          statusTitle: "No agent selected",
          statusBody: "Fresh staging has no public agent board yet.",
          statusTone: "idle",
        });
        return;
      }
      const selectedKey = agentSelectionKey(agent);
      const refreshStillApplies = () => {
        if (disposed || refreshId !== walletReadRefreshRef.current) return false;
        const currentAgent = demo.getSelectedAgent();
        return Boolean(currentAgent && agentSelectionKey(currentAgent) === selectedKey);
      };
      const renderRefreshState = (state: DemoChainState) => {
        if (refreshStillApplies()) renderChainState(state);
      };
      const side = demo.getTradeSide();
      const amount = normalizedAmount(demo.getKeyAmount());
      const holderParam = account?.accountId ? `&holderId=${encodeURIComponent(account.accountId)}` : "";
      const statePath = `/api/key-market/state?agentId=${encodeURIComponent(agent.id)}${holderParam}`;
      const quotePath = `/api/key-market/quote?side=${side}&agentId=${encodeURIComponent(agent.id)}&amount=${encodeURIComponent(amount)}`;
      const activityPath = `/api/key-market/activity?agentId=${encodeURIComponent(agent.id)}&limit=7`;
      const maxBuyPath = account?.accountId
        ? `/api/key-market/max-buy?agentId=${encodeURIComponent(agent.id)}&accountId=${encodeURIComponent(account.accountId)}`
        : "";
      let shouldRetryReadAccess = Boolean(account?.accountId);
      let shouldRetryBackend = false;
      let restoredReadAccess: ReadAccessState | null = null;
      renderChainState({
        accountId: account?.accountId ?? null,
        contractId: config.contractId,
        networkId: config.networkId,
        stateLoading: true,
        quoteLoading: true,
        activityLoading: true,
        maxBuyLoading: Boolean(maxBuyPath),
        backendLoading: true,
        readAccessLoading: Boolean(account?.accountId),
        readAccessError: null,
      });
      const statePromise = fetchJson<{ state: Record<string, unknown> }>(statePath)
        .then((response) => {
          const balance = Number(response.state?.holder_balance);
          shouldRetryReadAccess = Number.isFinite(balance) ? balance > 0 : Boolean(account?.accountId);
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            state: response.state,
            stateLoading: false,
            error: null,
          });
          return response.state;
        })
        .catch((error) => {
          shouldRetryReadAccess = Boolean(account?.accountId);
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            stateLoading: false,
            error: errorMessage(error, "Key market state read failed."),
          });
          return null;
        });

      const quotePromise = fetchJson<QuoteResponse>(quotePath)
        .then((response) => {
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            quote: response.quote,
            quoteSide: side,
            protection: response.protection,
            quoteLoading: false,
            error: null,
          });
        })
        .catch((error) => {
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            quoteLoading: false,
            error: errorMessage(error, "Key market quote read failed."),
          });
        });

      const activityPromise = fetchJson<Record<string, unknown>>(activityPath)
        .then((activity) => {
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            activity,
            activityLoading: false,
            activityError: null,
          });
        })
        .catch((error) => {
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            activityLoading: false,
            activityError: errorMessage(error, "Key activity read failed."),
          });
        });

      const maxBuyPromise = maxBuyPath
        ? fetchJson<Record<string, unknown>>(maxBuyPath)
          .then((maxBuy) => {
            renderRefreshState({
              accountId: account?.accountId ?? null,
              contractId: config.contractId,
              networkId: config.networkId,
              maxBuy,
              maxBuyLoading: false,
              maxBuyError: null,
            });
          })
          .catch((error) => {
            renderRefreshState({
              accountId: account?.accountId ?? null,
              contractId: config.contractId,
              networkId: config.networkId,
              maxBuyLoading: false,
              maxBuyError: errorMessage(error, "Max buy read failed."),
            });
          })
        : Promise.resolve().then(() => {
          renderRefreshState({ accountId: account?.accountId ?? null, maxBuy: null, maxBuyLoading: false, maxBuyError: null });
        });

      const activeAccessPromise = statePromise
        .then((state) => ensureReadAccess(agent, state, refreshId))
        .then((activeAccess) => {
          restoredReadAccess = activeAccess;
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            readAccess: activeAccess ? {
              boardId: activeAccess.boardId,
              holderAccountId: activeAccess.holderAccountId,
              expiresAt: activeAccess.expiresAt,
            } : null,
            readAccessLoading: false,
            readAccessError: null,
          });
          return activeAccess;
        })
        .catch((error) => {
          const retryingReadAccess = Boolean(account?.accountId && shouldRetryReadAccess && retryAttempt < 3);
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            readAccess: null,
            readAccessLoading: retryingReadAccess,
            readAccessError: retryingReadAccess ? null : errorMessage(error, "Room access refresh failed."),
          });
          return null;
        });

      const backendPromise = activeAccessPromise
        .then(async (activeAccess) => {
          if (!refreshStillApplies()) return null;
          if (activeAccess) await sleep(75);
          const backend = await fetchBackendBoard(agent);
          return { activeAccess, backend };
        })
        .then((result) => {
          if (!result) return;
          if (result.activeAccess && !backendHasReadablePaperActivity(result.backend)) {
            shouldRetryBackend = true;
            renderRefreshState({
              accountId: account?.accountId ?? null,
              contractId: config.contractId,
              networkId: config.networkId,
              backendLoading: true,
            });
            return;
          }
          renderRefreshState({ accountId: account?.accountId ?? null, contractId: config.contractId, networkId: config.networkId, backend: result.backend, backendLoading: false });
        })
        .catch((error) => {
          const retryingBackend = Boolean(restoredReadAccess && retryAttempt < 3);
          shouldRetryBackend = retryingBackend;
          renderRefreshState({
            accountId: account?.accountId ?? null,
            contractId: config.contractId,
            networkId: config.networkId,
            backendLoading: retryingBackend,
            ...(retryingBackend ? {} : { backend: { ok: false, error: errorMessage(error, "Backend read failed.") } }),
          });
        });

      await Promise.allSettled([statePromise, quotePromise, activityPromise, maxBuyPromise, activeAccessPromise, backendPromise]);
      const retryingRoomRead = refreshStillApplies()
        && account?.accountId
        && ((shouldRetryReadAccess && !restoredReadAccess) || shouldRetryBackend)
        && retryAttempt < 3;
      if (retryingRoomRead) {
        window.setTimeout(() => {
          if (refreshStillApplies()) void refreshWalletRead(`read-access-retry:${retryAttempt + 1}`);
        }, 800 * (retryAttempt + 1));
      }
      renderRefreshState({
        accountId: account?.accountId ?? null,
        contractId: config.contractId,
        networkId: config.networkId,
        pending: false,
        phase: "idle",
        backendLoading: Boolean(retryingRoomRead),
        readAccessLoading: Boolean(retryingRoomRead && !restoredReadAccess),
        ...(retryingRoomRead ? { readAccessError: null } : {}),
      });
    }

    async function ensureReadAccess(agent: DemoAgent, state: Record<string, unknown> | null, refreshId: number) {
      const account = accountRef.current;
      if (!account) {
        readAccessRef.current.clear();
        return null;
      }

      const boardId = agent.boardId ?? agent.id;
      const accessKey = readAccessCacheKey(boardId, account.accountId);
      if (state) {
        const balance = Number(state.holder_balance);
        if (!Number.isFinite(balance) || balance <= 0) {
          readAccessRef.current.delete(accessKey);
          return null;
        }
      }

      const cached = readAccessRef.current.get(accessKey) ?? null;
      if (
        cached
        && cached.boardId === boardId
        && cached.holderAccountId === account.accountId
        && Date.parse(cached.expiresAt) > Date.now() + 30_000
      ) {
        return cached;
      }

      const requestKey = `${boardId}:${account.accountId}:${refreshId}`;
      if (readAccessRequestRef.current?.key === requestKey) {
        return readAccessRequestRef.current.promise;
      }

      const requestPromise = (async () => {
        const sessionAccess = await restoreReadSession(boardId, account.accountId);
        if (sessionAccess) return sessionAccess;
        readAccessRef.current.delete(accessKey);
        return null;
      })();
      readAccessRequestRef.current = { key: requestKey, promise: requestPromise };

      try {
        return await requestPromise;
      } finally {
        if (readAccessRequestRef.current?.promise === requestPromise) {
          readAccessRequestRef.current = null;
        }
      }
    }

    async function restoreReadSession(boardId: string, holderAccountId: string) {
      const accessKey = readAccessCacheKey(boardId, holderAccountId);
      const session = await fetchJson<ReadSessionResponse>(
        `/api/backend/read-token/session?boardId=${encodeURIComponent(boardId)}&holderAccountId=${encodeURIComponent(holderAccountId)}`,
      );
      if (!session.valid || !session.boardId || !session.holderAccountId || !session.expiresAt) {
        readAccessRef.current.delete(accessKey);
        return null;
      }
      const restored = {
        boardId: session.boardId,
        holderAccountId: session.holderAccountId,
        expiresAt: session.expiresAt,
      };
      if (
        restored.boardId !== boardId
        || restored.holderAccountId !== holderAccountId
        || Date.parse(restored.expiresAt) <= Date.now() + 30_000
      ) {
        readAccessRef.current.delete(accessKey);
        return null;
      }
      readAccessRef.current.set(accessKey, restored);
      return restored;
    }

    async function ensureWalletSession(_reason: string) {
      const account = accountRef.current;
      const wallet = walletRef.current;
      const config = configRef.current;
      if (!account || !wallet || !config) return null;

      const cached = walletSessionRef.current;
      if (
        cached
        && cached.accountId === account.accountId
        && Date.parse(cached.expiresAt) > Date.now() + 30_000
      ) {
        return cached;
      }

      if (walletSessionRequestRef.current?.accountId === account.accountId) {
        return walletSessionRequestRef.current.promise;
      }

      const requestPromise = (async () => {
        const restored = await restoreWalletSession(account.accountId);
        if (restored) return restored;

        if (!wallet.manifest.features.signMessage) {
          throw new Error("Selected wallet does not support signed ClawHouse sessions.");
        }

        renderChainState({
          accountId: account.accountId,
          pending: true,
          phase: "authenticating",
          statusTitle: "Confirm ClawHouse session",
          statusBody: "Sign once to keep this wallet session active for 30 days.",
          statusTone: "pending",
        });

        const challengeResponse = await fetchJson<WalletSessionChallengeResponse>("/api/backend/read-token/wallet-session/nonce", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accountId: account.accountId }),
        });
        const signedMessage = await wallet.signMessage({
          network: config.networkId,
          signerId: account.accountId,
          message: challengeResponse.challenge.message,
          recipient: challengeResponse.challenge.recipient,
          nonce: base64UrlToBytes(challengeResponse.challenge.nonce),
        });
        const sessionResponse = await fetchJson<WalletSessionResponse>("/api/backend/read-token/wallet-session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challenge: challengeResponse.challenge.challenge,
            signedMessage,
          }),
        });
        if (!sessionResponse.valid || !sessionResponse.accountId || !sessionResponse.expiresAt) {
          walletSessionRef.current = null;
          return null;
        }
        walletSessionRef.current = {
          accountId: sessionResponse.accountId,
          expiresAt: sessionResponse.expiresAt,
        };
        return walletSessionRef.current;
      })();
      walletSessionRequestRef.current = { accountId: account.accountId, promise: requestPromise };

      try {
        return await requestPromise;
      } finally {
        if (walletSessionRequestRef.current?.promise === requestPromise) {
          walletSessionRequestRef.current = null;
        }
      }
    }

    async function restoreWalletSession(accountId: string) {
      const session = await fetchJson<WalletSessionResponse>(
        `/api/backend/read-token/wallet-session?accountId=${encodeURIComponent(accountId)}`,
      );
      if (!session.valid || !session.accountId || !session.expiresAt) {
        walletSessionRef.current = null;
        return null;
      }
      const restored = {
        accountId: session.accountId,
        expiresAt: session.expiresAt,
      };
      if (
        restored.accountId !== accountId
        || Date.parse(restored.expiresAt) <= Date.now() + 30_000
      ) {
        walletSessionRef.current = null;
        return null;
      }
      walletSessionRef.current = restored;
      return restored;
    }

    async function clearReadSession() {
      if (clearSessionRef.current) return clearSessionRef.current;
      clearSessionRef.current = fetch("/api/backend/read-token/session", { method: "DELETE" })
        .catch(() => undefined)
        .then(() => undefined)
        .finally(() => {
          clearSessionRef.current = null;
        });
      return clearSessionRef.current;
    }

    function renderChainState(state: DemoChainState) {
      window.ClawHouseDemo?.setChainState(state);
    }

    function showToast(message: string, options?: ToastOptions) {
      window.ClawHouseDemo?.showToast(message, options);
    }

    const restoreFromUi = () => {
      void ensureConnector().then(() => {
        if (accountRef.current) void refreshWalletRead("ui-ready");
      });
    };

    const refreshFromUi = () => {
      if (accountRef.current) void refreshWalletRead("ui-change");
    };

    document.addEventListener("click", captureClick, true);
    window.addEventListener("clawhouse:ready", restoreFromUi);
    window.addEventListener("clawhouse:agent-change", refreshFromUi);

    return () => {
      disposed = true;
      document.removeEventListener("click", captureClick, true);
      window.removeEventListener("clawhouse:ready", restoreFromUi);
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

async function fetchBackendBoard(agent: DemoAgent) {
  const boardId = agent.boardId ?? agent.id;
  return fetchJson<Record<string, unknown>>(`/api/backend/board?boardId=${encodeURIComponent(boardId)}`);
}

function agentSelectionKey(agent: DemoAgent) {
  return agent.boardId ?? agent.id;
}

function readAccessRetryAttempt(reason: string) {
  const match = reason.match(/^read-access-retry:(\d+)$/);
  return match ? Number(match[1]) || 0 : 0;
}

function readAccessCacheKey(boardId: string, holderAccountId: string) {
  return `${boardId}:${holderAccountId}`;
}

function backendHasReadablePaperActivity(backend: Record<string, unknown>) {
  const paperActivity = backend.paperActivity as { ok?: unknown; account?: unknown } | undefined;
  return Boolean(paperActivity?.ok && paperActivity.account);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
