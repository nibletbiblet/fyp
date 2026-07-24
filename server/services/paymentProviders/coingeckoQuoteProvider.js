import { env } from '../../config/env.js'

const SGD_CURRENCY = 'sgd'

const quoteConfigByAssetId = {
  'asset-btc-testnet': {
    coinGeckoId: 'bitcoin',
    displaySymbol: 'BTC',
    fallbackRate: () => env.quote.fallbackRates.btcSgd,
  },
  'asset-eth-sepolia': {
    coinGeckoId: 'ethereum',
    displaySymbol: 'ETH',
    fallbackRate: () => env.quote.fallbackRates.ethSgd,
  },
  'asset-stablecoin-sepolia': {
    coinGeckoId: 'usd-coin',
    displaySymbol: 'USDC',
    fallbackRate: () => env.quote.fallbackRates.stablecoinSgd,
  },
}

const buildQuoteError = (message, code, details = {}) => Object.assign(new Error(message), {
  code,
  details,
})

const getQuoteConfig = (asset) => {
  const config = quoteConfigByAssetId[asset.supported_asset_id]
  if (!config) {
    throw buildQuoteError(
      `No CoinGecko quote mapping is configured for ${asset.supported_asset_id}`,
      'ASSET_PRICE_NOT_CONFIGURED'
    )
  }
  return config
}

const fetchLiveCoinGeckoRate = async (coinGeckoId) => {
  const baseUrl = env.coingecko.baseUrl.replace(/\/$/, '')
  const url = `${baseUrl}/simple/price?ids=${encodeURIComponent(coinGeckoId)}&vs_currencies=${SGD_CURRENCY}`

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw buildQuoteError(`CoinGecko quote failed with HTTP ${response.status}`, 'QUOTE_PROVIDER_UNAVAILABLE')
  }

  const data = await response.json()
  const rate = Number(data?.[coinGeckoId]?.[SGD_CURRENCY])

  if (!Number.isFinite(rate) || rate <= 0) {
    throw buildQuoteError(`CoinGecko returned an invalid ${coinGeckoId}/SGD quote`, 'QUOTE_PROVIDER_INVALID_RATE')
  }

  return rate
}

const buildFallbackQuote = ({ asset, config, reason }) => {
  const rate = Number(config.fallbackRate())
  if (!Number.isFinite(rate) || rate <= 0) {
    throw buildQuoteError(
      `Fallback SGD rate is not configured for ${asset.supported_asset_id}`,
      'QUOTE_RATE_NOT_CONFIGURED',
      { reason: reason?.message || reason || null }
    )
  }

  return {
    cryptoSymbol: config.displaySymbol,
    fiatCurrency: 'SGD',
    quotedRate: rate,
    quoteSource: 'FALLBACK_ENV',
    quoteProvider: 'Fallback environment rate',
    quoteFetchedAt: new Date().toISOString(),
    coinGeckoId: config.coinGeckoId,
    fallbackReason: reason?.message || reason || null,
  }
}

export async function fetchAssetSgdQuote(asset) {
  const config = getQuoteConfig(asset)

  if (!env.quote.useLivePriceApi) {
    if (!env.quote.allowPriceFallback) {
      throw buildQuoteError(
        'Live price API is disabled and fallback quotes are not allowed',
        'QUOTE_PROVIDER_UNAVAILABLE'
      )
    }
    return buildFallbackQuote({ asset, config, reason: 'USE_LIVE_PRICE_API=false' })
  }

  try {
    const rate = await fetchLiveCoinGeckoRate(config.coinGeckoId)
    return {
      cryptoSymbol: config.displaySymbol,
      fiatCurrency: 'SGD',
      quotedRate: rate,
      quoteSource: 'LIVE_COINGECKO',
      quoteProvider: 'CoinGecko',
      quoteFetchedAt: new Date().toISOString(),
      coinGeckoId: config.coinGeckoId,
    }
  } catch (err) {
    if (!env.quote.allowPriceFallback) {
      throw err
    }
    return buildFallbackQuote({ asset, config, reason: err })
  }
}

export async function fetchEthSgdQuote() {
  const quote = await fetchAssetSgdQuote({ supported_asset_id: 'asset-eth-sepolia' })
  return {
    cryptoSymbol: 'ETH',
    fiatCurrency: 'SGD',
    rateSgdPerEth: quote.quotedRate,
    provider: quote.quoteProvider,
    quoteSource: quote.quoteSource,
    fetchedAt: quote.quoteFetchedAt,
  }
}
