/**
 * mockConversionProvider.js
 * Encapsulates simulated crypto-to-SGD conversion and platform fee logic.
 */

const EXCHANGE_RATE_SGD_PER_USD = 1.34;
const PLATFORM_FEE_PERCENT = 1.5; // ChainForge platform fee: 1.5%
const CONVERSION_COST_PERCENT = 0.5; // Simulated actual exchange/liquidity cost: 0.5%
const MAX_TOTAL_MDR_PERCENT = 3; // Maximum provisional MDR charged to merchant: 3%
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
 * Calculates transparent settlement fees.
 * @param {number} amountSgd 
 * @returns {{
 *   processorFee: number,
 *   platformFee: number,
 *   conversionCost: number,
 *   networkFee: number,
 *   bufferReserved: number,
 *   bufferReleased: number,
 *   maxTotalMdr: number,
 *   chargedDeduction: number,
 *   netSettlementAmount: number
 * }}
 */
export function calculateFees(amountSgd) {
  const platformFee = Number((amountSgd * (PLATFORM_FEE_PERCENT / 100)).toFixed(2));
  const conversionCost = Number((amountSgd * (CONVERSION_COST_PERCENT / 100)).toFixed(2));
  const networkFee = NETWORK_FEE_SGD;
  const maxTotalMdr = Number((amountSgd * (MAX_TOTAL_MDR_PERCENT / 100)).toFixed(2));
  const actualDeduction = Number((platformFee + conversionCost + networkFee).toFixed(2));
  const chargedDeduction = Number(Math.min(actualDeduction, maxTotalMdr).toFixed(2));
  const bufferReserved = Number(Math.max(maxTotalMdr - platformFee, 0).toFixed(2));
  const bufferReleased = Number(Math.max(maxTotalMdr - chargedDeduction, 0).toFixed(2));
  const netSettlementAmount = Number(Math.max(amountSgd - chargedDeduction, 0).toFixed(2));

  return {
    processorFee: platformFee,
    platformFee,
    conversionCost,
    networkFee,
    bufferReserved,
    bufferReleased,
    maxTotalMdr,
    chargedDeduction,
    netSettlementAmount
  };
}
