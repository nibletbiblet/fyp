/**
 * mockConversionProvider.js
 * Represents a MAS-licensed Digital Payment Token provider (e.g. Triple-A).
 * Encapsulates rate conversions and platform fee logic.
 */

const EXCHANGE_RATE_SGD_PER_USD = 1.34;
const PROCESSOR_FEE_PERCENT = 1.5; // 1.5%
const NETWORK_FEE_SGD = 0.20; // 0.20 SGD flat

/**
 * Calculates expected crypto amount based on SGD fiat amount.
 * @param {number} amountSgd 
 * @returns {{ exchangeRate: number, cryptoAmount: number }}
 */
export function calculateCryptoAmount(amountSgd) {
  const rate = EXCHANGE_RATE_SGD_PER_USD;
  const cryptoAmount = Number((amountSgd / rate).toFixed(6));
  return {
    exchangeRate: rate,
    cryptoAmount
  };
}

/**
 * Calculates processor and network fees.
 * @param {number} amountSgd 
 * @returns {{ processorFee: number, networkFee: number, netSettlementAmount: number }}
 */
export function calculateFees(amountSgd) {
  const processorFee = Number((amountSgd * (PROCESSOR_FEE_PERCENT / 100)).toFixed(2));
  const networkFee = NETWORK_FEE_SGD;
  const netSettlementAmount = Number(Math.max(amountSgd - processorFee - networkFee, 0).toFixed(2));

  return {
    processorFee,
    networkFee,
    netSettlementAmount
  };
}
