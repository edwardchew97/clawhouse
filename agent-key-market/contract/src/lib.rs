use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise};

const YOCTO_PER_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
const BASE_PRICE_YOCTO: u128 = YOCTO_PER_NEAR / 20; // 0.05 NEAR
const CURVE_SCALE: u128 = 2_000;
const FEE_DENOMINATOR_BPS: u128 = 10_000;
const PROTOCOL_FEE_BPS: u128 = 500;
const CREATOR_FEE_BPS: u128 = 500;
const MIN_AGENT_ID_LEN: usize = 3;
const MAX_AGENT_ID_LEN: usize = 64;
const MAX_NAME_LEN: usize = 80;
const MAX_METADATA_URI_LEN: usize = 256;

#[derive(BorshDeserialize, BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Agents,
    Balances,
}

#[derive(BorshSerialize)]
struct BalanceKey {
    agent_id: String,
    account_id: AccountId,
}

#[derive(BorshDeserialize, BorshSerialize, Clone)]
pub struct Agent {
    pub agent_id: String,
    pub creator_id: AccountId,
    pub name: String,
    pub metadata_uri: String,
    pub supply: u64,
    pub reserve: u128,
    pub created_at_ns: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct AgentView {
    pub agent_id: String,
    pub creator_id: AccountId,
    pub name: String,
    pub metadata_uri: String,
    pub supply: U64,
    pub reserve: U128,
    pub created_at_ns: U64,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PriceQuote {
    pub agent_id: String,
    pub amount: U64,
    pub supply_before: U64,
    pub supply_after: U64,
    pub price: U128,
    pub protocol_fee: U128,
    pub creator_fee: U128,
    pub total_cost: U128,
    pub payout: U128,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct TradeResult {
    pub agent_id: String,
    pub trader_id: AccountId,
    pub amount: U64,
    pub supply_after: U64,
    pub trader_balance_after: U64,
    pub reserve_after: U128,
    pub price: U128,
    pub protocol_fee: U128,
    pub creator_fee: U128,
    pub total_cost: U128,
    pub payout: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct KeyTradeEventData {
    pub agent_id: String,
    pub side: String,
    pub trader_id: AccountId,
    pub amount: U64,
    pub supply_after: U64,
    pub trader_balance_after: U64,
    pub reserve_after: U128,
    pub price: U128,
    pub protocol_fee: U128,
    pub creator_fee: U128,
    pub total_cost: U128,
    pub payout: U128,
}

#[near(event_json(standard = "clawhouse-key-market"))]
pub enum KeyMarketEvent {
    #[event_version("1.0.0")]
    KeyTrade(Vec<KeyTradeEventData>),
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct MarketState {
    pub agent: AgentView,
    pub holder_id: Option<AccountId>,
    pub holder_balance: Option<U64>,
    pub next_buy_price: PriceQuote,
    pub next_sell_price: Option<PriceQuote>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    treasury_id: AccountId,
    agents: UnorderedMap<String, Agent>,
    balances: LookupMap<BalanceKey, u64>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(treasury_id: AccountId) -> Self {
        assert!(!env::state_exists(), "Contract is already initialized");

        Self {
            treasury_id,
            agents: UnorderedMap::new(StorageKey::Agents),
            balances: LookupMap::new(StorageKey::Balances),
        }
    }

    #[payable]
    pub fn create_agent_key(
        &mut self,
        agent_id: String,
        name: String,
        metadata_uri: String,
    ) -> AgentView {
        validate_agent_id(&agent_id);
        assert!(name.len() <= MAX_NAME_LEN, "Name is too long");
        assert!(
            metadata_uri.len() <= MAX_METADATA_URI_LEN,
            "Metadata URI is too long"
        );
        assert!(
            self.agents.get(&agent_id).is_none(),
            "Agent key market already exists"
        );

        let storage_start = env::storage_usage();
        let creator_id = env::predecessor_account_id();
        let agent = Agent {
            agent_id: agent_id.clone(),
            creator_id: creator_id.clone(),
            name,
            metadata_uri,
            supply: 1,
            reserve: 0,
            created_at_ns: env::block_timestamp(),
        };

        self.agents.insert(&agent_id, &agent);
        self.balances.insert(
            &BalanceKey {
                agent_id,
                account_id: creator_id,
            },
            &1,
        );
        refund_storage_deposit(storage_start, 0);

        agent.into()
    }

    pub fn get_buy_price(&self, agent_id: String, amount: U64) -> PriceQuote {
        let agent = self.internal_get_agent(&agent_id);
        quote_buy(&agent, amount.0)
    }

    #[payable]
    pub fn buy_key(&mut self, agent_id: String, amount: U64, max_price: U128) -> TradeResult {
        let amount = amount.0;
        assert!(amount > 0, "Amount must be greater than zero");

        let storage_start = env::storage_usage();
        let buyer_id = env::predecessor_account_id();
        let mut agent = self.internal_get_agent(&agent_id);
        let quote = quote_buy(&agent, amount);
        assert!(
            quote.total_cost.0 <= max_price.0,
            "Total cost exceeds max_price"
        );

        let balance_key = BalanceKey {
            agent_id: agent_id.clone(),
            account_id: buyer_id.clone(),
        };
        let balance_after = self
            .balances
            .get(&balance_key)
            .unwrap_or(0)
            .checked_add(amount)
            .expect("Balance overflow");
        let supply_after = agent.supply.checked_add(amount).expect("Supply overflow");
        let reserve_after = agent
            .reserve
            .checked_add(quote.price.0)
            .expect("Reserve overflow");

        agent.supply = supply_after;
        agent.reserve = reserve_after;
        self.agents.insert(&agent_id, &agent);
        self.balances.insert(&balance_key, &balance_after);

        let storage_cost = storage_cost_since(storage_start);
        let required_deposit = quote
            .total_cost
            .0
            .checked_add(storage_cost)
            .expect("Required deposit overflow");
        assert_attached_deposit(required_deposit);
        transfer_if_positive(self.treasury_id.clone(), quote.protocol_fee.0);
        transfer_if_positive(agent.creator_id, quote.creator_fee.0);
        refund_attached_deposit(required_deposit);

        let result = TradeResult {
            agent_id,
            trader_id: buyer_id,
            amount: U64(amount),
            supply_after: U64(supply_after),
            trader_balance_after: U64(balance_after),
            reserve_after: U128(reserve_after),
            price: quote.price,
            protocol_fee: quote.protocol_fee,
            creator_fee: quote.creator_fee,
            total_cost: quote.total_cost,
            payout: U128(0),
        };
        emit_key_trade("buy", &result);
        result
    }

    pub fn get_sell_price(&self, agent_id: String, amount: U64) -> PriceQuote {
        let agent = self.internal_get_agent(&agent_id);
        quote_sell(&agent, amount.0)
    }

    pub fn sell_key(&mut self, agent_id: String, amount: U64, min_payout: U128) -> TradeResult {
        assert_eq!(
            env::attached_deposit().as_yoctonear(),
            0,
            "Do not attach deposit when selling"
        );
        let amount = amount.0;
        assert!(amount > 0, "Amount must be greater than zero");

        let seller_id = env::predecessor_account_id();
        let mut agent = self.internal_get_agent(&agent_id);
        let quote = quote_sell(&agent, amount);
        assert!(quote.payout.0 >= min_payout.0, "Payout below min_payout");

        let balance_key = BalanceKey {
            agent_id: agent_id.clone(),
            account_id: seller_id.clone(),
        };
        let current_balance = self.balances.get(&balance_key).unwrap_or(0);
        assert!(current_balance >= amount, "Insufficient key balance");
        let balance_after = current_balance - amount;
        let supply_after = agent.supply - amount;
        let reserve_after = agent
            .reserve
            .checked_sub(quote.price.0)
            .expect("Insufficient reserve");

        agent.supply = supply_after;
        agent.reserve = reserve_after;
        self.agents.insert(&agent_id, &agent);

        if balance_after == 0 {
            self.balances.remove(&balance_key);
        } else {
            self.balances.insert(&balance_key, &balance_after);
        }

        transfer_if_positive(seller_id.clone(), quote.payout.0);
        transfer_if_positive(self.treasury_id.clone(), quote.protocol_fee.0);
        transfer_if_positive(agent.creator_id, quote.creator_fee.0);

        let result = TradeResult {
            agent_id,
            trader_id: seller_id,
            amount: U64(amount),
            supply_after: U64(supply_after),
            trader_balance_after: U64(balance_after),
            reserve_after: U128(reserve_after),
            price: quote.price,
            protocol_fee: quote.protocol_fee,
            creator_fee: quote.creator_fee,
            total_cost: U128(0),
            payout: quote.payout,
        };
        emit_key_trade("sell", &result);
        result
    }

    pub fn get_agent(&self, agent_id: String) -> Option<AgentView> {
        self.agents.get(&agent_id).map(Into::into)
    }

    pub fn get_balance(&self, agent_id: String, account_id: AccountId) -> U64 {
        U64(self.internal_get_balance(&agent_id, &account_id))
    }

    pub fn get_supply(&self, agent_id: String) -> U64 {
        U64(self.internal_get_agent(&agent_id).supply)
    }

    pub fn get_state(&self, agent_id: String, holder_id: Option<AccountId>) -> MarketState {
        let agent = self.internal_get_agent(&agent_id);
        let holder_balance = holder_id
            .as_ref()
            .map(|account_id| U64(self.internal_get_balance(&agent_id, account_id)));
        let next_sell_price = if agent.supply > 1 {
            Some(quote_sell(&agent, 1))
        } else {
            None
        };

        MarketState {
            agent: agent.clone().into(),
            holder_id,
            holder_balance,
            next_buy_price: quote_buy(&agent, 1),
            next_sell_price,
        }
    }

    fn internal_get_agent(&self, agent_id: &str) -> Agent {
        self.agents
            .get(&agent_id.to_string())
            .unwrap_or_else(|| env::panic_str("Agent key market does not exist"))
    }

    fn internal_get_balance(&self, agent_id: &str, account_id: &AccountId) -> u64 {
        self.balances
            .get(&BalanceKey {
                agent_id: agent_id.to_string(),
                account_id: account_id.clone(),
            })
            .unwrap_or(0)
    }
}

impl From<Agent> for AgentView {
    fn from(agent: Agent) -> Self {
        Self {
            agent_id: agent.agent_id,
            creator_id: agent.creator_id,
            name: agent.name,
            metadata_uri: agent.metadata_uri,
            supply: U64(agent.supply),
            reserve: U128(agent.reserve),
            created_at_ns: U64(agent.created_at_ns),
        }
    }
}

fn validate_agent_id(agent_id: &str) {
    assert!(
        agent_id.len() >= MIN_AGENT_ID_LEN && agent_id.len() <= MAX_AGENT_ID_LEN,
        "Agent id length is invalid"
    );
    assert!(
        agent_id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_'),
        "Agent id must use lowercase letters, digits, hyphen, or underscore"
    );
}

fn emit_key_trade(side: &str, result: &TradeResult) {
    KeyMarketEvent::KeyTrade(vec![KeyTradeEventData {
        agent_id: result.agent_id.clone(),
        side: side.to_string(),
        trader_id: result.trader_id.clone(),
        amount: result.amount,
        supply_after: result.supply_after,
        trader_balance_after: result.trader_balance_after,
        reserve_after: result.reserve_after,
        price: result.price,
        protocol_fee: result.protocol_fee,
        creator_fee: result.creator_fee,
        total_cost: result.total_cost,
        payout: result.payout,
    }])
    .emit();
}

fn quote_buy(agent: &Agent, amount: u64) -> PriceQuote {
    assert!(amount > 0, "Amount must be greater than zero");

    let supply_after = agent.supply.checked_add(amount).expect("Supply overflow");
    let price = price_range(agent.supply, amount);
    price_quote(agent, amount, agent.supply, supply_after, price, true)
}

fn quote_sell(agent: &Agent, amount: u64) -> PriceQuote {
    assert!(amount > 0, "Amount must be greater than zero");
    assert!(amount < agent.supply, "Cannot sell final key");

    let supply_after = agent.supply - amount;
    let price = price_range(supply_after, amount);
    price_quote(agent, amount, agent.supply, supply_after, price, false)
}

fn price_quote(
    agent: &Agent,
    amount: u64,
    supply_before: u64,
    supply_after: u64,
    price: u128,
    is_buy: bool,
) -> PriceQuote {
    let protocol_fee = fee(price, PROTOCOL_FEE_BPS);
    let creator_fee = fee(price, CREATOR_FEE_BPS);
    let total_fees = protocol_fee.checked_add(creator_fee).expect("Fee overflow");
    let total_cost = if is_buy {
        price.checked_add(total_fees).expect("Total cost overflow")
    } else {
        0
    };
    let payout = if is_buy {
        0
    } else {
        price.checked_sub(total_fees).expect("Payout underflow")
    };

    PriceQuote {
        agent_id: agent.agent_id.clone(),
        amount: U64(amount),
        supply_before: U64(supply_before),
        supply_after: U64(supply_after),
        price: U128(price),
        protocol_fee: U128(protocol_fee),
        creator_fee: U128(creator_fee),
        total_cost: U128(total_cost),
        payout: U128(payout),
    }
}

fn price_range(start_supply: u64, amount: u64) -> u128 {
    assert!(amount > 0, "Amount must be greater than zero");

    let start = u128::from(start_supply);
    let end = start
        .checked_add(u128::from(amount))
        .and_then(|value| value.checked_sub(1))
        .expect("Supply range overflow");
    let base = BASE_PRICE_YOCTO
        .checked_mul(u128::from(amount))
        .expect("Base price overflow");
    let square_sum = sum_squares(end)
        .checked_sub(if start == 0 {
            0
        } else {
            sum_squares(start - 1)
        })
        .expect("Square sum underflow");
    let curve = square_sum
        .checked_mul(YOCTO_PER_NEAR)
        .and_then(|value| value.checked_div(CURVE_SCALE))
        .expect("Curve price overflow");

    base.checked_add(curve).expect("Price overflow")
}

fn sum_squares(n: u128) -> u128 {
    n.checked_mul(n + 1)
        .and_then(|value| value.checked_mul(2 * n + 1))
        .and_then(|value| value.checked_div(6))
        .expect("Square sum overflow")
}

fn fee(price: u128, fee_bps: u128) -> u128 {
    price
        .checked_mul(fee_bps)
        .and_then(|value| value.checked_div(FEE_DENOMINATOR_BPS))
        .expect("Fee overflow")
}

fn storage_cost_since(storage_start: u64) -> u128 {
    let used = env::storage_usage()
        .checked_sub(storage_start)
        .expect("Storage usage underflow");
    u128::from(used)
        .checked_mul(env::storage_byte_cost().as_yoctonear())
        .expect("Storage cost overflow")
}

fn refund_storage_deposit(storage_start: u64, extra_required: u128) {
    let required = storage_cost_since(storage_start)
        .checked_add(extra_required)
        .expect("Required deposit overflow");
    assert_attached_deposit(required);
    refund_attached_deposit(required);
}

fn assert_attached_deposit(required: u128) {
    let attached = env::attached_deposit().as_yoctonear();
    assert!(
        attached >= required,
        "Attached deposit is too small: required {} yoctoNEAR",
        required
    );
}

fn refund_attached_deposit(required: u128) {
    let attached = env::attached_deposit().as_yoctonear();
    let refund = attached
        .checked_sub(required)
        .expect("Attached deposit below required amount");
    transfer_if_positive(env::predecessor_account_id(), refund);
}

fn transfer_if_positive(account_id: AccountId, amount: u128) {
    if amount > 0 {
        Promise::new(account_id)
            .transfer(NearToken::from_yoctonear(amount))
            .detach();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::testing_env;

    fn account(account_id: &str) -> AccountId {
        account_id.parse().unwrap()
    }

    fn near(amount: u128) -> NearToken {
        NearToken::from_yoctonear(amount * YOCTO_PER_NEAR)
    }

    fn set_context(predecessor: &str, deposit: NearToken) {
        let mut builder = VMContextBuilder::new();
        builder
            .predecessor_account_id(account(predecessor))
            .attached_deposit(deposit)
            .prepaid_gas(near_sdk::Gas::from_tgas(300));
        testing_env!(builder.build());
    }

    fn create_contract() -> Contract {
        set_context("owner.testnet", NearToken::from_yoctonear(0));
        Contract::new(account("treasury.testnet"))
    }

    fn create_market(contract: &mut Contract) {
        set_context("creator.testnet", near(1));
        contract.create_agent_key(
            "terminal_chad".to_string(),
            "Terminal Chad".to_string(),
            "ipfs://terminal-chad".to_string(),
        );
    }

    fn default_storage_deposit() -> NearToken {
        NearToken::from_yoctonear(YOCTO_PER_NEAR / 50)
    }

    #[test]
    fn create_market_mints_initial_creator_key() {
        let mut contract = create_contract();
        create_market(&mut contract);

        assert_eq!(contract.get_supply("terminal_chad".to_string()).0, 1);
        assert_eq!(
            contract
                .get_balance("terminal_chad".to_string(), account("creator.testnet"))
                .0,
            1
        );
    }

    #[test]
    fn create_market_accepts_default_storage_deposit() {
        let mut contract = create_contract();
        let agent_id = "a".repeat(MAX_AGENT_ID_LEN);
        let name = "n".repeat(MAX_NAME_LEN);
        let metadata_uri = "m".repeat(MAX_METADATA_URI_LEN);
        let creator_id = "c".repeat(64);
        set_context(&creator_id, default_storage_deposit());
        let storage_before = env::storage_usage();

        contract.create_agent_key(agent_id.clone(), name, metadata_uri);

        let storage_used = env::storage_usage() - storage_before;
        let required_deposit =
            u128::from(storage_used) * env::storage_byte_cost().as_yoctonear();

        assert!(required_deposit < default_storage_deposit().as_yoctonear());
        assert_eq!(contract.get_supply(agent_id).0, 1);
    }

    #[test]
    fn first_buy_accepts_default_storage_deposit_buffer() {
        let mut contract = create_contract();
        create_market(&mut contract);
        let quote = contract.get_buy_price("terminal_chad".to_string(), U64(1));
        let attached_deposit = quote.total_cost.0 + default_storage_deposit().as_yoctonear();

        set_context("buyer.testnet", NearToken::from_yoctonear(attached_deposit));
        let result = contract.buy_key("terminal_chad".to_string(), U64(1), quote.total_cost);

        assert_eq!(result.supply_after.0, 2);
        assert_eq!(result.trader_balance_after.0, 1);
    }

    #[test]
    fn buy_quote_uses_near_curve_and_fees() {
        let mut contract = create_contract();
        create_market(&mut contract);

        let quote = contract.get_buy_price("terminal_chad".to_string(), U64(1));

        assert_eq!(quote.price.0, 50_500_000_000_000_000_000_000);
        assert_eq!(quote.protocol_fee.0, 2_525_000_000_000_000_000_000);
        assert_eq!(quote.creator_fee.0, 2_525_000_000_000_000_000_000);
        assert_eq!(quote.total_cost.0, 55_550_000_000_000_000_000_000);
    }

    #[test]
    fn buy_key_updates_supply_balance_and_reserve() {
        let mut contract = create_contract();
        create_market(&mut contract);
        let quote = contract.get_buy_price("terminal_chad".to_string(), U64(2));

        set_context("buyer.testnet", near(2));
        let result = contract.buy_key("terminal_chad".to_string(), U64(2), quote.total_cost);

        assert_eq!(result.supply_after.0, 3);
        assert_eq!(result.trader_balance_after.0, 2);
        assert_eq!(result.reserve_after.0, quote.price.0);
    }

    #[test]
    fn buy_key_emits_key_trade_event() {
        let mut contract = create_contract();
        create_market(&mut contract);
        let quote = contract.get_buy_price("terminal_chad".to_string(), U64(1));

        set_context("buyer.testnet", near(2));
        contract.buy_key("terminal_chad".to_string(), U64(1), quote.total_cost);

        let logs = get_logs();
        let event = logs.last().expect("expected key trade event log");
        assert!(event.starts_with("EVENT_JSON:"));
        assert!(event.contains(r#""standard":"clawhouse-key-market""#));
        assert!(event.contains(r#""event":"key_trade""#));
        assert!(event.contains(r#""agent_id":"terminal_chad""#));
        assert!(event.contains(r#""side":"buy""#));
        assert!(event.contains(r#""trader_id":"buyer.testnet""#));
    }

    #[test]
    #[should_panic(expected = "Total cost exceeds max_price")]
    fn buy_key_rejects_when_max_price_is_too_low() {
        let mut contract = create_contract();
        create_market(&mut contract);
        let quote = contract.get_buy_price("terminal_chad".to_string(), U64(1));

        set_context("buyer.testnet", near(1));
        contract.buy_key(
            "terminal_chad".to_string(),
            U64(1),
            U128(quote.total_cost.0 - 1),
        );
    }

    #[test]
    fn sell_key_updates_supply_balance_and_reserve() {
        let mut contract = create_contract();
        create_market(&mut contract);
        let buy_quote = contract.get_buy_price("terminal_chad".to_string(), U64(2));
        set_context("buyer.testnet", near(2));
        contract.buy_key("terminal_chad".to_string(), U64(2), buy_quote.total_cost);

        let sell_quote = contract.get_sell_price("terminal_chad".to_string(), U64(1));
        set_context("buyer.testnet", NearToken::from_yoctonear(0));
        let result = contract.sell_key("terminal_chad".to_string(), U64(1), sell_quote.payout);

        assert_eq!(result.supply_after.0, 2);
        assert_eq!(result.trader_balance_after.0, 1);
        assert_eq!(
            result.reserve_after.0,
            buy_quote.price.0 - sell_quote.price.0
        );
    }

    #[test]
    fn sell_key_emits_key_trade_event() {
        let mut contract = create_contract();
        create_market(&mut contract);
        let buy_quote = contract.get_buy_price("terminal_chad".to_string(), U64(2));
        set_context("buyer.testnet", near(2));
        contract.buy_key("terminal_chad".to_string(), U64(2), buy_quote.total_cost);
        let sell_quote = contract.get_sell_price("terminal_chad".to_string(), U64(1));

        set_context("buyer.testnet", NearToken::from_yoctonear(0));
        contract.sell_key("terminal_chad".to_string(), U64(1), sell_quote.payout);

        let logs = get_logs();
        let event = logs.last().expect("expected key trade event log");
        assert!(event.starts_with("EVENT_JSON:"));
        assert!(event.contains(r#""standard":"clawhouse-key-market""#));
        assert!(event.contains(r#""event":"key_trade""#));
        assert!(event.contains(r#""agent_id":"terminal_chad""#));
        assert!(event.contains(r#""side":"sell""#));
        assert!(event.contains(r#""trader_id":"buyer.testnet""#));
    }

    #[test]
    #[should_panic(expected = "Cannot sell final key")]
    fn cannot_sell_final_key() {
        let mut contract = create_contract();
        create_market(&mut contract);

        set_context("creator.testnet", NearToken::from_yoctonear(0));
        contract.sell_key("terminal_chad".to_string(), U64(1), U128(0));
    }
}
