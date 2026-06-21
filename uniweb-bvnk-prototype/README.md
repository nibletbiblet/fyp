# Uniweb BVNK Prototype

This is a Node.js + Express + EJS + Bootstrap prototype for a crypto-to-SGD merchant payment system.

## What the prototype does

1. Merchant creates a SGD payment request.
2. Uniweb generates mock crypto payment details.
3. Customer payment is simulated.
4. Mock BVNK confirms the blockchain payment.
5. Mock BVNK settles the amount to the merchant in SGD.
6. Merchant dashboard displays transaction and settlement status.

## What is mocked

- BVNK API
- Blockchain transaction
- Crypto wallet payment
- Stablecoin-to-SGD conversion
- Bank settlement

## How to run

```bash
npm install
npm start
```

Then open:

```bash
http://localhost:3000
```

## Suggested demo flow

1. Go to Create Payment.
2. Enter merchant, customer, and amount.
3. Generate payment page.
4. Click Simulate Customer Payment.
5. Click Simulate BVNK SGD Settlement.
6. Check Dashboard and Transactions page.
```
