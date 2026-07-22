import { JsonRpcProvider, formatEther, getAddress, isAddress, parseEther } from 'ethers'
import { env } from '../../config/env.js'

const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/
const SEPOLIA_CHAIN_ID = 11155111n
const MAX_SCAN_BLOCKS = 500

const normalizeAddress = (address) => {
  if (!address || !isAddress(address)) return null
  return getAddress(address)
}

const buildMinimumWei = (expectedEthAmount, tolerancePercent) => {
  const expectedWei = parseEther(String(expectedEthAmount))
  const toleranceBps = Math.max(0, Math.round(Number(tolerancePercent || 0) * 100))
  const multiplierBps = Math.max(0, 10000 - toleranceBps)
  return (expectedWei * BigInt(multiplierBps)) / 10000n
}

const getSepoliaProvider = async () => {
  if (!env.sepolia.rpcUrl) {
    throw Object.assign(new Error('SEPOLIA_RPC_URL is required for Sepolia verification'), {
      code: 'SEPOLIA_RPC_URL_MISSING',
    })
  }

  const provider = new JsonRpcProvider(env.sepolia.rpcUrl, Number(SEPOLIA_CHAIN_ID))
  const network = await provider.getNetwork()
  if (network.chainId !== SEPOLIA_CHAIN_ID) {
    throw Object.assign(new Error('Configured RPC URL is not connected to Ethereum Sepolia'), {
      code: 'SEPOLIA_RPC_WRONG_NETWORK',
    })
  }

  return provider
}

const serializeReceipt = (receipt, confirmations) => ({
  hash: receipt.hash,
  blockNumber: receipt.blockNumber,
  status: receipt.status,
  confirmations,
  gasUsed: receipt.gasUsed?.toString(),
})

const serializeTransaction = (tx) => ({
  hash: tx.hash,
  from: tx.from,
  to: tx.to,
  value: tx.value?.toString(),
  blockNumber: tx.blockNumber,
  nonce: tx.nonce,
})

export function isValidSepoliaTxHash(txHash) {
  return TX_HASH_PATTERN.test(String(txHash || '').trim())
}

export async function getCurrentSepoliaBlockNumber() {
  const provider = await getSepoliaProvider()
  return provider.getBlockNumber()
}

export function toWeiString(ethAmount) {
  return parseEther(String(ethAmount)).toString()
}

export async function verifySepoliaEthTransaction({
  txHash,
  receivingAddress,
  expectedEthAmount,
  tolerancePercent,
  minConfirmations = 1,
}) {
  const normalizedTxHash = String(txHash || '').trim()
  if (!isValidSepoliaTxHash(normalizedTxHash)) {
    return { status: 'INVALID_TX_HASH' }
  }

  const expectedRecipient = normalizeAddress(receivingAddress)
  if (!expectedRecipient) {
    throw Object.assign(new Error('MERCHANT_RECEIVING_ADDRESS must be a valid EVM address'), {
      code: 'MERCHANT_RECEIVING_ADDRESS_INVALID',
    })
  }

  const provider = await getSepoliaProvider()

  const tx = await provider.getTransaction(normalizedTxHash)
  if (!tx) {
    return { status: 'TX_NOT_FOUND' }
  }

  const receipt = await provider.getTransactionReceipt(normalizedTxHash)
  if (!receipt) {
    return {
      status: 'PENDING_CONFIRMATION',
      transaction: serializeTransaction(tx),
      confirmations: 0,
      amountEth: formatEther(tx.value),
    }
  }

  if (receipt.status !== 1) {
    return {
      status: 'TX_FAILED',
      transaction: serializeTransaction(tx),
      receipt: serializeReceipt(receipt, 0),
      amountEth: formatEther(tx.value),
    }
  }

  const latestBlock = await provider.getBlockNumber()
  const confirmations = Math.max(0, latestBlock - receipt.blockNumber + 1)
  if (confirmations < Number(minConfirmations || 1)) {
    return {
      status: 'PENDING_CONFIRMATION',
      transaction: serializeTransaction(tx),
      receipt: serializeReceipt(receipt, confirmations),
      confirmations,
      amountEth: formatEther(tx.value),
    }
  }

  const actualRecipient = normalizeAddress(tx.to)
  if (!actualRecipient || actualRecipient !== expectedRecipient) {
    return {
      status: 'WRONG_RECEIVING_ADDRESS',
      transaction: serializeTransaction(tx),
      receipt: serializeReceipt(receipt, confirmations),
      confirmations,
      amountEth: formatEther(tx.value),
    }
  }

  const minimumWei = buildMinimumWei(expectedEthAmount, tolerancePercent)
  if (tx.value < minimumWei) {
    return {
      status: 'UNDERPAID',
      transaction: serializeTransaction(tx),
      receipt: serializeReceipt(receipt, confirmations),
      confirmations,
      amountEth: formatEther(tx.value),
      requiredMinimumEth: formatEther(minimumWei),
    }
  }

  return {
    status: 'CONFIRMED',
    txHash: normalizedTxHash,
    fromAddress: tx.from,
    toAddress: tx.to,
    amountEth: formatEther(tx.value),
    confirmations,
    blockNumber: receipt.blockNumber,
    transaction: serializeTransaction(tx),
    receipt: serializeReceipt(receipt, confirmations),
  }
}

export async function scanSepoliaEthPayment({
  receivingAddress,
  expectedEthAmount,
  tolerancePercent,
  minConfirmations = 1,
  fromBlock,
  ignoredTxHashes = [],
}) {
  const expectedRecipient = normalizeAddress(receivingAddress)
  if (!expectedRecipient) {
    throw Object.assign(new Error('MERCHANT_RECEIVING_ADDRESS must be a valid EVM address'), {
      code: 'MERCHANT_RECEIVING_ADDRESS_INVALID',
    })
  }

  const provider = await getSepoliaProvider()
  const latestBlock = await provider.getBlockNumber()
  const safeFromBlock = Math.max(0, Number(fromBlock || latestBlock - MAX_SCAN_BLOCKS))
  const scanFromBlock = Math.max(0, Math.min(safeFromBlock, latestBlock) - 1)
  const scanToBlock = latestBlock
  const boundedFromBlock = Math.max(scanFromBlock, scanToBlock - MAX_SCAN_BLOCKS)
  const ignored = new Set(ignoredTxHashes.map((hash) => String(hash).toLowerCase()))
  const minimumWei = buildMinimumWei(expectedEthAmount, tolerancePercent)

  for (let blockNumber = scanToBlock; blockNumber >= boundedFromBlock; blockNumber -= 1) {
    const block = await provider.getBlock(blockNumber)
    if (!block) continue

    for (const txHash of block.transactions) {
      if (ignored.has(String(txHash).toLowerCase())) continue

      const tx = await provider.getTransaction(txHash)
      if (!tx || !tx.to || normalizeAddress(tx.to) !== expectedRecipient) {
        continue
      }

      const receipt = await provider.getTransactionReceipt(txHash)
      if (!receipt || receipt.status !== 1) {
        continue
      }

      const confirmations = Math.max(0, latestBlock - receipt.blockNumber + 1)
      if (confirmations < Number(minConfirmations || 1)) {
        continue
      }

      return {
        status: 'FOUND',
        txHash,
        fromAddress: tx.from,
        toAddress: tx.to,
        amountEth: formatEther(tx.value),
        confirmations,
        blockNumber: receipt.blockNumber,
        isUnderpaid: tx.value < minimumWei,
        requiredMinimumEth: formatEther(minimumWei),
        scannedFromBlock: boundedFromBlock,
        scannedToBlock: scanToBlock,
      }
    }
  }

  return {
    status: 'NOT_FOUND',
    scannedFromBlock: boundedFromBlock,
    scannedToBlock: scanToBlock,
  }
}
