# Codex Task Prompt

Read AGENTS.md first.

Help me build the MVP for this crypto payment platform.

Start by checking the current project structure. Then implement the backend payment flow with these priorities:

1. Merchant can create a payment request in SGD.
2. Customer can select BTC testnet, ETH Sepolia, or test stablecoin.
3. System creates a payment record.
4. System generates QR/payment instructions.
5. Backend can detect or simulate payment detection.
6. Backend updates payment status correctly.
7. Mock conversion provider converts crypto to SGD.
8. Merchant dashboard can show payment and settlement status.

Do not use real crypto mainnet.
Do not use real fiat payout.
Do not hard-code secrets.
Use environment variables.
Keep code modular with services/providers.