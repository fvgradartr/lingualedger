//! LinguaLedger treasury.
//!
//! The human sets the rules: a price floor, a daily inference spend cap, an
//! allowlist of payees, a revenue split, and a kill switch. The agent key is
//! only useful for `record_sale`, `request_spend`, and `settle`. That limit is
//! enforced here by predecessor account, and again by the protocol when the
//! agent's function-call access key omits every other method.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, Vector};
use near_sdk::serde_json;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

pub const YOCTO_PER_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// 0.05 NEAR. A one-block job cannot be sold for less.
pub const DEFAULT_MIN_PRICE_YOCTO: u128 = 50_000_000_000_000_000_000_000;
/// 0.02 NEAR per started block of 100 words, before the floor.
pub const DEFAULT_PRICE_PER_100_YOCTO: u128 = 20_000_000_000_000_000_000_000;
/// 0.5 NEAR. Inference spends above this in a UTC day revert.
pub const DEFAULT_MAX_DAILY_SPEND_YOCTO: u128 = 500_000_000_000_000_000_000_000;
/// Left on the account so storage is not eaten by a spend or a withdrawal.
const STORAGE_BUFFER_YOCTO: u128 = 50_000_000_000_000_000_000_000;
const MAX_WORDS: u32 = 1_500;
const MAX_REASON: usize = 200;
const NS_PER_DAY: u64 = 86_400_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SplitShare {
    pub account: AccountId,
    pub bps: u16,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Policy {
    pub min_price_yocto: U128,
    pub price_per_100w_yocto: U128,
    pub max_daily_spend_yocto: U128,
    /// Index 0 is the operating reserve. Rounding dust is paid there.
    pub split_bps: Vec<SplitShare>,
    pub allow_payees: Vec<AccountId>,
    pub paused: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Status {
    Paid,
    Delivered,
    Settled,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Order {
    pub id: String,
    pub channel: String,
    pub payer: AccountId,
    pub amount_yocto: U128,
    pub currency: String,
    pub words: u32,
    pub deliverable_sha256: String,
    pub tee_sig_id: String,
    pub inference_cost_yocto: U128,
    pub status: Status,
    pub ts: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Payout {
    pub order_id: String,
    pub payee: AccountId,
    pub amount_yocto: U128,
    /// "split" moves sale revenue. "spend" pays an allowlisted cost.
    pub kind: String,
    pub reason: String,
    pub transferred: bool,
    pub ts: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct Totals {
    pub revenue_yocto: U128,
    pub costs_yocto: U128,
    pub distributed_yocto: U128,
    pub order_count: u32,
    pub day_index: u64,
    pub day_spend_yocto: U128,
}

/// Allocate `amount` by basis points. Share 0 is the reserve and receives dust
/// so the parts always sum to `amount`.
pub fn allocate_split(amount: u128, bps: &[u16]) -> Vec<u128> {
    require!(!bps.is_empty(), "split is empty");
    let sum: u32 = bps.iter().map(|b| u32::from(*b)).sum();
    require!(sum == 10_000, "split must sum to 10000");
    let mut out = vec![0u128; bps.len()];
    let mut allocated = 0u128;
    for (index, share) in bps.iter().enumerate().skip(1) {
        let cut = amount
            .checked_mul(u128::from(*share))
            .unwrap_or_else(|| env::panic_str("split overflow"))
            / 10_000;
        out[index] = cut;
        allocated = allocated.saturating_add(cut);
    }
    out[0] = amount - allocated;
    out
}

/// Price for `words`: one charge per started block of 100 words, then the
/// on-chain floor. Zero words is a zero quote; paying for it still reverts.
pub fn quote_yocto(words: u32, price_per_100_yocto: u128, min_price_yocto: u128) -> u128 {
    if words == 0 {
        return 0;
    }
    let blocks = u128::from(words).saturating_add(99) / 100;
    let raw = blocks
        .checked_mul(price_per_100_yocto)
        .unwrap_or_else(|| env::panic_str("price overflow"));
    raw.max(min_price_yocto)
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    agent: AccountId,
    policy: Policy,
    orders: IterableMap<String, Order>,
    order_index: Vector<String>,
    payouts: Vector<Payout>,
    day_index: u64,
    day_spend: u128,
    total_revenue: u128,
    total_costs: u128,
    total_distributed: u128,
}

#[near]
impl Contract {
    #[init]
    pub fn new(
        owner: AccountId,
        agent: AccountId,
        reserve: AccountId,
        contributors: AccountId,
    ) -> Self {
        let policy = Policy {
            min_price_yocto: U128(DEFAULT_MIN_PRICE_YOCTO),
            price_per_100w_yocto: U128(DEFAULT_PRICE_PER_100_YOCTO),
            max_daily_spend_yocto: U128(DEFAULT_MAX_DAILY_SPEND_YOCTO),
            split_bps: vec![
                SplitShare {
                    account: reserve.clone(),
                    bps: 7_000,
                },
                SplitShare {
                    account: owner.clone(),
                    bps: 2_000,
                },
                SplitShare {
                    account: contributors,
                    bps: 1_000,
                },
            ],
            allow_payees: vec![reserve],
            paused: false,
        };
        Self {
            owner,
            agent,
            policy,
            orders: IterableMap::new(b"o"),
            order_index: Vector::new(b"i"),
            payouts: Vector::new(b"p"),
            day_index: day_index(env::block_timestamp()),
            day_spend: 0,
            total_revenue: 0,
            total_costs: 0,
            total_distributed: 0,
        }
    }

    // --- views ---

    pub fn get_policy(&self) -> Policy {
        self.policy.clone()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_agent(&self) -> AccountId {
        self.agent.clone()
    }

    pub fn quote(&self, words: u32) -> U128 {
        U128(quote_yocto(
            words,
            self.policy.price_per_100w_yocto.0,
            self.policy.min_price_yocto.0,
        ))
    }

    pub fn get_order(&self, order_id: String) -> Option<Order> {
        self.orders.get(&order_id).cloned()
    }

    /// `from` is an offset from the newest order.
    pub fn get_orders(&self, from: u32, limit: u32) -> Vec<Order> {
        let limit = limit.min(50);
        let len = self.order_index.len();
        if from >= len || limit == 0 {
            return Vec::new();
        }
        let mut out = Vec::new();
        let mut index = len - 1 - from;
        loop {
            if let Some(id) = self.order_index.get(index) {
                if let Some(order) = self.orders.get(id) {
                    out.push(order.clone());
                }
            }
            if out.len() as u32 >= limit || index == 0 {
                break;
            }
            index -= 1;
        }
        out
    }

    pub fn get_payouts(&self, from: u32, limit: u32) -> Vec<Payout> {
        let limit = limit.min(100);
        let len = self.payouts.len();
        if from >= len || limit == 0 {
            return Vec::new();
        }
        let mut out = Vec::new();
        let mut index = len - 1 - from;
        loop {
            if let Some(payout) = self.payouts.get(index) {
                out.push(payout.clone());
            }
            if out.len() as u32 >= limit || index == 0 {
                break;
            }
            index -= 1;
        }
        out
    }

    pub fn get_totals(&self) -> Totals {
        Totals {
            revenue_yocto: U128(self.total_revenue),
            costs_yocto: U128(self.total_costs),
            distributed_yocto: U128(self.total_distributed),
            order_count: self.order_index.len(),
            day_index: day_index(env::block_timestamp()),
            day_spend_yocto: U128(self.effective_day_spend()),
        }
    }

    // --- customers ---

    #[payable]
    pub fn pay_order(&mut self, order_id: String, words: u32) {
        self.assert_running();
        assert_order_id(&order_id);
        require!(words > 0, "text is empty");
        require!(words <= MAX_WORDS, "too many words");
        require!(!self.orders.contains_key(&order_id), "order already exists");

        let quote = quote_yocto(
            words,
            self.policy.price_per_100w_yocto.0,
            self.policy.min_price_yocto.0,
        );
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit < self.policy.min_price_yocto.0 {
            env::panic_str("deposit is below the minimum price");
        }
        require!(deposit >= quote, "deposit is below the quote");

        let order = Order {
            id: order_id.clone(),
            channel: "storefront".to_string(),
            payer: env::predecessor_account_id(),
            amount_yocto: U128(deposit),
            currency: "NEAR".to_string(),
            words,
            deliverable_sha256: String::new(),
            tee_sig_id: String::new(),
            inference_cost_yocto: U128(0),
            status: Status::Paid,
            ts: env::block_timestamp(),
        };
        self.total_revenue = self.total_revenue.saturating_add(deposit);
        self.insert_order(order.clone());
        emit(
            "order_paid",
            &serde_json::json!({
                "order_id": order_id,
                "payer": order.payer,
                "amount_yocto": deposit.to_string(),
                "words": words,
                "quote_yocto": quote.to_string(),
            }),
        );
    }

    // --- agent ---

    pub fn record_sale(
        &mut self,
        order_id: String,
        channel: String,
        amount: U128,
        currency: String,
        words: u32,
        deliverable_sha256: String,
        tee_sig_id: String,
        inference_cost: U128,
        payer: AccountId,
    ) {
        self.assert_agent();
        self.assert_running();
        assert_order_id(&order_id);
        assert_channel(&channel);
        assert_currency(&currency);
        assert_sha256(&deliverable_sha256);
        require!(!tee_sig_id.is_empty() && tee_sig_id.len() <= 200, "invalid tee signature id");
        require!(words > 0 && words <= MAX_WORDS, "invalid word count");

        if let Some(mut existing) = self.orders.get(&order_id).cloned() {
            require!(existing.status != Status::Settled, "order is already settled");
            require!(existing.words == words, "word count does not match the paid order");
            existing.deliverable_sha256 = deliverable_sha256.clone();
            existing.tee_sig_id = tee_sig_id.clone();
            existing.inference_cost_yocto = inference_cost;
            existing.status = Status::Delivered;
            self.orders.insert(order_id.clone(), existing);
        } else {
            let order = Order {
                id: order_id.clone(),
                channel,
                payer,
                amount_yocto: amount,
                currency: currency.clone(),
                words,
                deliverable_sha256: deliverable_sha256.clone(),
                tee_sig_id: tee_sig_id.clone(),
                inference_cost_yocto: inference_cost,
                status: Status::Delivered,
                ts: env::block_timestamp(),
            };
            if currency == "NEAR" {
                self.total_revenue = self.total_revenue.saturating_add(amount.0);
            }
            self.insert_order(order);
        }

        emit(
            "order_delivered",
            &serde_json::json!({
                "order_id": order_id,
                "deliverable_sha256": deliverable_sha256,
                "tee_sig_id": tee_sig_id,
                "inference_cost_yocto": inference_cost.0.to_string(),
            }),
        );
    }

    pub fn request_spend(&mut self, payee: AccountId, amount: U128, reason: String) {
        self.assert_agent();
        self.assert_running();
        require!(amount.0 > 0, "amount is zero");
        require!(reason.len() <= MAX_REASON, "reason is too long");
        require!(
            self.policy.allow_payees.iter().any(|allowed| allowed == &payee),
            "payee is not allowlisted"
        );

        self.roll_day();
        let next = self
            .day_spend
            .checked_add(amount.0)
            .unwrap_or_else(|| env::panic_str("daily spend overflow"));
        require!(
            next <= self.policy.max_daily_spend_yocto.0,
            "daily spend cap exceeded"
        );
        self.assert_spend_leaves_escrow(amount.0);

        self.day_spend = next;
        self.total_costs = self.total_costs.saturating_add(amount.0);
        self.payouts.push(Payout {
            order_id: String::new(),
            payee: payee.clone(),
            amount_yocto: amount,
            kind: "spend".to_string(),
            reason: reason.clone(),
            transferred: true,
            ts: env::block_timestamp(),
        });
        Promise::new(payee.clone())
            .transfer(NearToken::from_yoctonear(amount.0))
            .detach();
        emit(
            "spend",
            &serde_json::json!({
                "payee": payee,
                "amount_yocto": amount.0.to_string(),
                "reason": reason,
                "day_spend_yocto": self.day_spend.to_string(),
            }),
        );
    }

    pub fn settle(&mut self, order_id: String) {
        self.assert_agent_or_owner();
        if env::predecessor_account_id() != self.owner {
            self.assert_running();
        }
        let mut order = self
            .orders
            .get(&order_id)
            .cloned()
            .unwrap_or_else(|| env::panic_str("order not found"));
        require!(order.status == Status::Delivered, "order is not delivered");

        let bps: Vec<u16> = self.policy.split_bps.iter().map(|share| share.bps).collect();
        let parts = allocate_split(order.amount_yocto.0, &bps);
        let transfer = order.currency == "NEAR";
        let mut distributed = 0u128;
        for (share, amount) in self.policy.split_bps.clone().into_iter().zip(parts) {
            if transfer && amount > 0 {
                Promise::new(share.account.clone())
                    .transfer(NearToken::from_yoctonear(amount))
                    .detach();
                distributed = distributed.saturating_add(amount);
            }
            self.payouts.push(Payout {
                order_id: order_id.clone(),
                payee: share.account.clone(),
                amount_yocto: U128(amount),
                kind: "split".to_string(),
                reason: order_id.clone(),
                transferred: transfer && amount > 0,
                ts: env::block_timestamp(),
            });
            emit(
                "payout",
                &serde_json::json!({
                    "order_id": order_id,
                    "payee": share.account,
                    "amount_yocto": amount.to_string(),
                    "bps": share.bps,
                    "transferred": transfer && amount > 0,
                    "currency": order.currency,
                }),
            );
        }
        if transfer {
            self.total_distributed = self.total_distributed.saturating_add(distributed);
        }
        order.status = Status::Settled;
        self.orders.insert(order_id, order);
    }

    // --- owner ---

    pub fn set_policy(&mut self, policy: Policy) {
        self.assert_owner();
        require!(policy.min_price_yocto.0 > 0, "minimum price is zero");
        require!(!policy.split_bps.is_empty(), "split is empty");
        let mut seen = Vec::new();
        let mut sum: u32 = 0;
        for share in &policy.split_bps {
            require!(share.bps > 0, "split share is zero");
            require!(!seen.contains(&share.account), "duplicate split account");
            seen.push(share.account.clone());
            sum += u32::from(share.bps);
        }
        require!(sum == 10_000, "split must sum to 10000");
        self.policy = policy;
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.policy.paused = paused;
        emit("paused", &serde_json::json!({ "paused": paused }));
    }

    pub fn add_payee(&mut self, payee: AccountId) {
        self.assert_owner();
        require!(
            !self.policy.allow_payees.iter().any(|existing| existing == &payee),
            "payee already allowlisted"
        );
        self.policy.allow_payees.push(payee);
    }

    pub fn withdraw(&mut self, amount: Option<U128>) {
        self.assert_owner();
        let available = self.surplus();
        let take = amount.map(|value| value.0).unwrap_or(available);
        require!(take > 0 && take <= available, "insufficient surplus");
        Promise::new(self.owner.clone())
            .transfer(NearToken::from_yoctonear(take))
            .detach();
    }
}

impl Contract {
    fn insert_order(&mut self, order: Order) {
        self.order_index.push(order.id.clone());
        self.orders.insert(order.id.clone(), order);
    }

    fn assert_owner(&self) {
        require!(
            env::predecessor_account_id() == self.owner,
            "only the owner can do that"
        );
    }

    fn assert_agent(&self) {
        require!(
            env::predecessor_account_id() == self.agent,
            "only the agent can do that"
        );
    }

    fn assert_agent_or_owner(&self) {
        let caller = env::predecessor_account_id();
        require!(
            caller == self.agent || caller == self.owner,
            "only the agent or the owner can do that"
        );
    }

    fn assert_running(&self) {
        require!(!self.policy.paused, "LinguaLedger is paused");
    }

    fn roll_day(&mut self) {
        let today = day_index(env::block_timestamp());
        if self.day_index != today {
            self.day_index = today;
            self.day_spend = 0;
        }
    }

    fn effective_day_spend(&self) -> u128 {
        if self.day_index == day_index(env::block_timestamp()) {
            self.day_spend
        } else {
            0
        }
    }

    fn locked_near(&self) -> u128 {
        let mut locked = 0u128;
        for id in self.order_index.iter() {
            if let Some(order) = self.orders.get(id) {
                if order.currency == "NEAR" && order.status != Status::Settled {
                    locked = locked.saturating_add(order.amount_yocto.0);
                }
            }
        }
        locked
    }

    fn liquid(&self) -> u128 {
        env::account_balance()
            .as_yoctonear()
            .saturating_sub(env::account_locked_balance().as_yoctonear())
    }

    fn surplus(&self) -> u128 {
        self.liquid()
            .saturating_sub(self.locked_near())
            .saturating_sub(STORAGE_BUFFER_YOCTO)
    }

    fn assert_spend_leaves_escrow(&self, amount: u128) {
        require!(
            amount <= self.surplus(),
            "spend would touch unsettled revenue"
        );
    }
}

fn day_index(timestamp_ns: u64) -> u64 {
    timestamp_ns / NS_PER_DAY
}

fn assert_order_id(id: &str) {
    require!(
        (8..=64).contains(&id.len())
            && id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'),
        "invalid order id"
    );
}

fn assert_channel(channel: &str) {
    require!(
        matches!(channel, "storefront" | "agent_market" | "demo"),
        "unknown channel"
    );
}

fn assert_currency(currency: &str) {
    require!(
        matches!(currency, "NEAR" | "USDC" | "other"),
        "unknown currency"
    );
}

fn assert_sha256(hash: &str) {
    require!(
        hash.len() == 64 && hash.chars().all(|c| c.is_ascii_hexdigit()),
        "deliverable hash must be sha256 hex"
    );
}

fn emit(event: &str, data: &serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        serde_json::json!({
            "standard": "lingualedger",
            "version": "1.0.0",
            "event": event,
            "data": [data],
        })
    ));
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::{testing_env, Gas};

    const HASH: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    fn context(predecessor: &str, deposit_yocto: u128, balance_near: u128) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("lingualedger.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .signer_account_id(predecessor.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit_yocto))
            .account_balance(NearToken::from_near(balance_near))
            .prepaid_gas(Gas::from_tgas(300))
            .block_timestamp(1_762_800_000 * 1_000_000_000);
        testing_env!(builder.build());
    }

    fn contract() -> Contract {
        context("owner.testnet", 0, 50);
        Contract::new(
            "owner.testnet".parse().unwrap(),
            "agent.testnet".parse().unwrap(),
            "reserve.testnet".parse().unwrap(),
            "contributors.testnet".parse().unwrap(),
        )
    }

    fn deliver(contract: &mut Contract, order_id: &str, words: u32) {
        context("agent.testnet", 0, 50);
        contract.record_sale(
            order_id.to_string(),
            "storefront".to_string(),
            U128(0),
            "NEAR".to_string(),
            words,
            HASH.to_string(),
            "tee-test".to_string(),
            U128(1),
            "payer.testnet".parse().unwrap(),
        );
    }

    #[test]
    fn quote_floors_at_min_price_and_bills_started_blocks() {
        assert_eq!(quote_yocto(0, DEFAULT_PRICE_PER_100_YOCTO, DEFAULT_MIN_PRICE_YOCTO), 0);
        assert_eq!(
            quote_yocto(41, DEFAULT_PRICE_PER_100_YOCTO, DEFAULT_MIN_PRICE_YOCTO),
            DEFAULT_MIN_PRICE_YOCTO
        );
        assert_eq!(
            quote_yocto(500, DEFAULT_PRICE_PER_100_YOCTO, DEFAULT_MIN_PRICE_YOCTO),
            5 * DEFAULT_PRICE_PER_100_YOCTO
        );
    }

    #[test]
    fn split_puts_rounding_dust_on_the_reserve() {
        let even = allocate_split(10_000, &[7_000, 2_000, 1_000]);
        assert_eq!(even, vec![7_000, 2_000, 1_000]);
        assert_eq!(even.iter().sum::<u128>(), 10_000);

        let dust = allocate_split(1, &[7_000, 2_000, 1_000]);
        assert_eq!(dust, vec![1, 0, 0]);
        assert_eq!(dust.iter().sum::<u128>(), 1);

        let ten = allocate_split(10, &[7_000, 2_000, 1_000]);
        assert_eq!(ten, vec![7, 2, 1]);
        assert_eq!(ten.iter().sum::<u128>(), 10);
    }

    #[test]
    #[should_panic(expected = "deposit is below the minimum price")]
    fn below_min_price_reverts() {
        let mut treasury = contract();
        context("payer.testnet", DEFAULT_MIN_PRICE_YOCTO - 1, 50);
        treasury.pay_order("order-0001".to_string(), 41);
    }

    #[test]
    #[should_panic(expected = "LinguaLedger is paused")]
    fn paused_agent_call_reverts() {
        let mut treasury = contract();
        context("owner.testnet", 0, 50);
        treasury.set_paused(true);
        context("agent.testnet", 0, 50);
        treasury.record_sale(
            "order-0001".to_string(),
            "agent_market".to_string(),
            U128(3_000_000),
            "USDC".to_string(),
            40,
            HASH.to_string(),
            "tee-test".to_string(),
            U128(1),
            "buyer.near".parse().unwrap(),
        );
    }

    #[test]
    #[should_panic(expected = "daily spend cap exceeded")]
    fn over_daily_cap_reverts() {
        let mut treasury = contract();
        context("agent.testnet", 0, 50);
        treasury.request_spend(
            "reserve.testnet".parse().unwrap(),
            U128(DEFAULT_MAX_DAILY_SPEND_YOCTO + 1),
            "inference".to_string(),
        );
    }

    #[test]
    #[should_panic(expected = "payee is not allowlisted")]
    fn non_allowlisted_payee_reverts() {
        let mut treasury = contract();
        context("agent.testnet", 0, 50);
        treasury.request_spend(
            "stranger.testnet".parse().unwrap(),
            U128(1),
            "inference".to_string(),
        );
    }

    #[test]
    #[should_panic(expected = "only the owner can do that")]
    fn only_owner_can_set_policy() {
        let mut treasury = contract();
        context("agent.testnet", 0, 50);
        treasury.set_paused(false);
    }

    #[test]
    #[should_panic(expected = "only the owner can do that")]
    fn agent_cannot_withdraw() {
        let mut treasury = contract();
        context("agent.testnet", 0, 50);
        treasury.withdraw(None);
    }

    #[test]
    fn settle_splits_the_whole_deposit_and_emits_three_payouts() {
        let mut treasury = contract();
        let amount = DEFAULT_MIN_PRICE_YOCTO;
        context("payer.testnet", amount, 50);
        treasury.pay_order("order-0041".to_string(), 41);
        deliver(&mut treasury, "order-0041", 41);
        context("agent.testnet", 0, 50);
        treasury.settle("order-0041".to_string());

        let payouts = treasury.get_payouts(0, 10);
        assert_eq!(payouts.len(), 3);
        let sum: u128 = payouts.iter().map(|payout| payout.amount_yocto.0).sum();
        assert_eq!(sum, amount);
        assert!(payouts.iter().all(|payout| payout.transferred));
        let reserve = payouts
            .iter()
            .find(|payout| payout.payee.as_str() == "reserve.testnet")
            .unwrap();
        let owner = payouts
            .iter()
            .find(|payout| payout.payee.as_str() == "owner.testnet")
            .unwrap();
        let contributors = payouts
            .iter()
            .find(|payout| payout.payee.as_str() == "contributors.testnet")
            .unwrap();
        assert_eq!(reserve.amount_yocto.0, amount * 7_000 / 10_000);
        assert_eq!(owner.amount_yocto.0, amount * 2_000 / 10_000);
        assert_eq!(contributors.amount_yocto.0, amount * 1_000 / 10_000);
        assert_eq!(treasury.get_order("order-0041".to_string()).unwrap().status, Status::Settled);
        assert_eq!(treasury.get_totals().distributed_yocto.0, amount);

        let logs = get_logs();
        assert!(logs.iter().any(|line| line.contains("\"event\":\"payout\"")));
        assert_eq!(logs.iter().filter(|line| line.contains("\"event\":\"payout\"")).count(), 3);
    }

    #[test]
    fn one_yocto_sale_pays_the_dust_to_the_reserve() {
        let mut treasury = contract();
        context("owner.testnet", 0, 50);
        let mut policy = treasury.get_policy();
        policy.min_price_yocto = U128(1);
        policy.price_per_100w_yocto = U128(1);
        treasury.set_policy(policy);

        context("payer.testnet", 1, 50);
        treasury.pay_order("order-dust".to_string(), 1);
        deliver(&mut treasury, "order-dust", 1);
        context("agent.testnet", 0, 50);
        treasury.settle("order-dust".to_string());

        let payouts = treasury.get_payouts(0, 10);
        let sum: u128 = payouts.iter().map(|payout| payout.amount_yocto.0).sum();
        assert_eq!(sum, 1);
        assert_eq!(
            payouts
                .iter()
                .find(|payout| payout.payee.as_str() == "reserve.testnet")
                .unwrap()
                .amount_yocto
                .0,
            1
        );
    }

    #[test]
    fn spend_under_the_cap_is_recorded() {
        let mut treasury = contract();
        context("agent.testnet", 0, 50);
        treasury.request_spend(
            "reserve.testnet".parse().unwrap(),
            U128(DEFAULT_PRICE_PER_100_YOCTO),
            "near ai inference".to_string(),
        );
        let totals = treasury.get_totals();
        assert_eq!(totals.costs_yocto.0, DEFAULT_PRICE_PER_100_YOCTO);
        assert_eq!(totals.day_spend_yocto.0, DEFAULT_PRICE_PER_100_YOCTO);
        assert_eq!(treasury.get_payouts(0, 5)[0].kind, "spend");
    }

    #[test]
    #[should_panic(expected = "spend would touch unsettled revenue")]
    fn spend_cannot_touch_unsettled_revenue() {
        let mut treasury = contract();
        let amount = DEFAULT_MIN_PRICE_YOCTO;
        context("payer.testnet", amount, 1);
        // Balance is 1 NEAR in this context. The attached deposit is not added
        // on top in the unit-test VM, so lock the order against a balance that
        // only just covers escrow plus the storage buffer.
        testing_env!(
            VMContextBuilder::new()
                .current_account_id("lingualedger.testnet".parse().unwrap())
                .predecessor_account_id("payer.testnet".parse().unwrap())
                .signer_account_id("payer.testnet".parse().unwrap())
                .attached_deposit(NearToken::from_yoctonear(amount))
                .account_balance(NearToken::from_yoctonear(amount + STORAGE_BUFFER_YOCTO))
                .prepaid_gas(Gas::from_tgas(300))
                .block_timestamp(1_762_800_000 * 1_000_000_000)
                .build()
        );
        treasury.pay_order("order-lock".to_string(), 41);
        context(
            "agent.testnet",
            0,
            0,
        );
        testing_env!(
            VMContextBuilder::new()
                .current_account_id("lingualedger.testnet".parse().unwrap())
                .predecessor_account_id("agent.testnet".parse().unwrap())
                .signer_account_id("agent.testnet".parse().unwrap())
                .attached_deposit(NearToken::from_yoctonear(0))
                .account_balance(NearToken::from_yoctonear(amount + STORAGE_BUFFER_YOCTO))
                .prepaid_gas(Gas::from_tgas(300))
                .block_timestamp(1_762_800_000 * 1_000_000_000)
                .build()
        );
        treasury.request_spend(
            "reserve.testnet".parse().unwrap(),
            U128(1),
            "should fail".to_string(),
        );
    }
}
