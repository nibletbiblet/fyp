import 'dotenv/config'

const toInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const required = (name) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const requiredHex = (name, byteLength) => {
  const value = required(name)
  const expectedLength = byteLength * 2
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length !== expectedLength) {
    throw new Error(`${name} must be a ${expectedLength}-character hex string`)
  }
  return value
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: toInteger(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: toInteger(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'crypto_payment_platform',
    ssl: process.env.DB_SSL === 'true',
  },
  sepolia: {
    rpcUrl: process.env.SEPOLIA_RPC_URL ?? '',
    stablecoinContractAddress: process.env.SEPOLIA_STABLECOIN_CONTRACT_ADDRESS ?? '',
    merchantReceivingAddress: process.env.MERCHANT_RECEIVING_ADDRESS ?? process.env.MOCK_ETH_SEPOLIA_RECEIVING_ADDRESS ?? '',
  },
  coingecko: {
    baseUrl: process.env.COINGECKO_BASE_URL ?? 'https://api.coingecko.com/api/v3',
  },
  rateLockMinutes: toInteger(process.env.RATE_LOCK_MINUTES, 15),
  paymentTolerancePercent: Number.parseFloat(process.env.PAYMENT_TOLERANCE_PERCENT ?? '1'),
  btcTestnet: {
    apiBaseUrl: process.env.BTC_TESTNET_API_BASE_URL ?? 'https://mempool.space/testnet/api',
  },
  mockPayments: {
    btcTestnetReceivingAddress: process.env.MOCK_BTC_TESTNET_RECEIVING_ADDRESS ?? 'tb1qchainforgephase1mockaddress000000000',
    ethSepoliaReceivingAddress: process.env.MOCK_ETH_SEPOLIA_RECEIVING_ADDRESS ?? '0x1111111111111111111111111111111111111111',
    stablecoinSepoliaReceivingAddress: process.env.MOCK_STABLECOIN_SEPOLIA_RECEIVING_ADDRESS ?? '0x2222222222222222222222222222222222222222',
    btcSgdRate: Number.parseFloat(process.env.MOCK_BTC_SGD_RATE ?? '90000'),
    ethSgdRate: Number.parseFloat(process.env.MOCK_ETH_SGD_RATE ?? '4500'),
    stablecoinSgdRate: Number.parseFloat(process.env.MOCK_STABLECOIN_SGD_RATE ?? '1.35'),
  },
  jwtSecret: required('JWT_SECRET'),
  encryptionKey: requiredHex('ENCRYPTION_KEY', 32),
}
