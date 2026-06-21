import 'dotenv/config'

const toInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
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
  jwtSecret: process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production',
  encryptionKey: process.env.ENCRYPTION_KEY ?? '0000000000000000000000000000000000000000000000000000000000000000',
}
