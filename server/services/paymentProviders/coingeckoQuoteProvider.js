import { env } from '../../config/env.js'

const ETHEREUM_ID = 'ethereum'
const SGD_CURRENCY = 'sgd'

export async function fetchEthSgdQuote() {
  const baseUrl = env.coingecko.baseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/simple/price?ids=${ETHEREUM_ID}&vs_currencies=${SGD_CURRENCY}`

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw Object.assign(new Error(`CoinGecko quote failed with HTTP ${response.status}`), {
      code: 'QUOTE_PROVIDER_UNAVAILABLE',
    })
  }

  const data = await response.json()
  const rate = Number(data?.[ETHEREUM_ID]?.[SGD_CURRENCY])

  if (!Number.isFinite(rate) || rate <= 0) {
    throw Object.assign(new Error('CoinGecko returned an invalid ETH/SGD quote'), {
      code: 'QUOTE_PROVIDER_INVALID_RATE',
    })
  }

  return {
    cryptoSymbol: 'ETH',
    fiatCurrency: 'SGD',
    rateSgdPerEth: rate,
    provider: 'CoinGecko',
    fetchedAt: new Date().toISOString(),
  }
}
