# AGENTS.md

## Project Overview

This project is a prototype crypto payment platform for SMEs.

The platform allows merchants to:
- create payment requests in SGD
- allow customers to pay using testnet crypto
- detect incoming blockchain transactions
- simulate crypto-to-SGD conversion
- update merchant transaction and settlement status
- view payments through a merchant dashboard

The project must simulate a realistic Singapore crypto payment flow, but it must NOT use real money.

## Core Architecture

Use this flow:

Merchant creates payment request in SGD
→ Customer selects crypto/network
→ System generates QR/payment address
→ Customer pays using testnet wallet
→ Backend detects transaction
→ Backend waits for confirmation
→ System simulates MAS-licensed provider conversion to SGD
→ Internal ledger updates merchant balance
→ Merchant dashboard shows status and settlement

## Supported Testnet Payment Types

Support these payment types as separate provider modules:

1. BTC Testnet
- Customer pays with testnet BTC.
- Detect using Bitcoin testnet APIs such as mempool.space testnet or BlockCypher testnet.
- Match transaction by receiving address and expected amount.

2. ETH Sepolia
- Customer pays with Sepolia ETH.
- Detect using ethers.js.
- Match transaction by receiving address and expected amount.

3. Stablecoin Testnet
- Customer pays with an ERC-20 test stablecoin on Sepolia.
- Detect ERC-20 Transfer events using ethers.js.
- Treat it as simulated USDC/USDT.

## Important Provider Design

Do not hard-code provider logic directly into routes.

Create a provider/service layer:

/services/paymentProviders/
  btcTestnetProvider.js
  ethSepoliaProvider.js
  stablecoinSepoliaProvider.js
  mockConversionProvider.js

The payment route should call a common interface, for example:

createPayment()
detectPayment()
confirmPayment()
convertToSgd()

The mockConversionProvider represents a MAS-licensed crypto payment provider such as Triple-A.

## Compliance Position

For the prototype:
- use testnet coins only
- do not use real customer funds
- do not perform real fiat payout
- simulate crypto-to-SGD conversion
- simulate merchant settlement

For realistic Singapore deployment:
- crypto receipt, custody, conversion, and transfer should be handled by a MAS-licensed Digital Payment Token provider
- use “MAS-licensed crypto payment provider” in code comments/docs instead of assuming BVNK
- Triple-A can be referenced as an example provider, but real API integration requires credentials and approval

## Payment Statuses

Use this status flow:

CREATED
AWAITING_CRYPTO_SELECTION
QR_GENERATED
AWAITING_PAYMENT
PAYMENT_DETECTED
CONFIRMING
CONFIRMED
CONVERTED_TO_SGD
SETTLED
PAID_OUT

Failure statuses:

INSUFFICIENT_FUNDS
UNDERPAID
WRONG_NETWORK
EXPIRED
FAILED
MANUAL_REVIEW_REQUIRED

## Database Tables

Create or support these main tables:

merchants
- id
- business_name
- email
- password_hash
- bank_account_last4
- kyc_status
- created_at

payments
- id
- merchant_id
- amount_sgd
- selected_crypto
- selected_network
- expected_crypto_amount
- receiving_address
- qr_code_data
- provider_reference
- status
- expires_at
- created_at
- updated_at

blockchain_transactions
- id
- payment_id
- tx_hash
- from_address
- to_address
- amount_crypto
- confirmations
- detected_at
- confirmed_at
- raw_payload

settlements
- id
- payment_id
- merchant_id
- gross_sgd_amount
- provider_fee
- platform_fee
- payout_fee
- net_sgd_amount
- status
- created_at

audit_logs
- id
- actor_type
- actor_id
- action
- details
- created_at

## QR Code Requirements

QR code should contain:
- receiving address
- expected amount
- selected crypto
- selected network
- payment reference/order ID

For BTC testnet, generate a Bitcoin URI style QR.

For ETH/Sepolia, generate a payment page or QR containing the address and amount.

For stablecoins, show token, network, contract address, recipient address, and amount.

## Customer Wallet Behaviour

After customer pays, wallet may show:
- Sending
- Submitted
- Pending
- Confirmed
- Failed

The platform should not mark payment as fully settled at broadcast stage.

Use:
- PAYMENT_DETECTED when transaction is seen
- CONFIRMED when blockchain confirmation is complete
- SETTLED after simulated conversion to SGD

## UX Rules

Merchant dashboard should clearly show:
- payment status
- crypto selected
- network selected
- expected amount
- received amount
- transaction hash
- confirmation count
- SGD settlement amount
- fees
- final net amount

Customer payment page should clearly show:
- selected crypto
- selected network
- amount to pay
- address
- QR code
- warning to use correct network
- warning that network fees apply

## Security Rules

Never commit real API keys, private keys, seed phrases, or wallet secrets.

Use environment variables for:
- database credentials
- API keys
- RPC URLs
- provider settings

Do not store private keys in the database.

For testnet receiving addresses, prefer generating or assigning addresses safely. If private keys are needed for testing, store them only in .env and never commit them.

## Coding Rules

Use Node.js + Express.

Use MySQL or PostgreSQL for database.

Use ethers.js for Ethereum/Sepolia and ERC-20 stablecoin detection.

Keep routes thin. Put business logic inside services.

Add clear comments for payment status transitions.

Every important payment action must create an audit log.

Avoid building real-money functionality.

## What Not To Build

Do not build:
- real exchange
- real custody system
- real fiat payout
- smart contracts unless specifically needed
- mainnet crypto payments
- production-grade compliance engine

## First Implementation Goal

Build the working MVP in this order:

1. Merchant creates payment in SGD
2. Customer selects BTC testnet / ETH Sepolia / stablecoin testnet
3. System generates payment record and QR/payment instructions
4. Customer pays using testnet wallet
5. Backend detects payment
6. Backend confirms payment
7. Mock provider converts crypto to SGD
8. Ledger updates settlement
9. Merchant dashboard shows settled transaction

## When Unsure

Prioritise:
1. working testnet payment detection
2. clear payment status flow
3. clean database records
4. realistic provider simulation
5. simple dashboard