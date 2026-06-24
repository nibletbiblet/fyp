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
  },
  btcTestnet: {
    apiBaseUrl: process.env.BTC_TESTNET_API_BASE_URL ?? 'https://mempool.space/testnet/api',
  },
  jwtSecret: required('JWT_SECRET'),
  encryptionKey: requiredHex('ENCRYPTION_KEY', 32),
}
