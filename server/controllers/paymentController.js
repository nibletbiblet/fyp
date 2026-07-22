import {
  createPayment,
  detectSepoliaPayment,
  getCheckoutDetails,
  selectAsset,
  submitSepoliaTransactionHash,
} from '../services/paymentService.js'

export async function createPaymentRequest(req, res) {
  try {
    const {
      amountSgd,
      description,
      supportedAssetId,
      assetId,
    } = req.body
    const parsedAmount = Number(amountSgd)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amountSgd must be a positive number' })
    }

    const payment = await createPayment({
      merchantId: req.merchantId,
      amountSgd: parsedAmount,
      description,
    })

    const selectedAssetId = supportedAssetId || assetId
    if (selectedAssetId) {
      const checkout = await selectAsset(payment.paymentId, selectedAssetId)
      return res.status(201).json({
        message: 'Payment request created',
        payment: {
          ...checkout.payment,
          checkoutUrl: payment.checkoutUrl,
        },
        supportedAssets: checkout.supportedAssets,
      })
    }

    return res.status(201).json({
      message: 'Payment request created',
      payment,
    })
  } catch (err) {
    if (err.code === 'ASSET_NOT_FOUND') {
      return res.status(404).json({ error: err.message })
    }
    if (
      err.code === 'QUOTE_RATE_NOT_CONFIGURED' ||
      err.code === 'RECEIVING_ADDRESS_NOT_CONFIGURED'
    ) {
      return res.status(400).json({ error: err.message })
    }
    if (
      err.code === 'QUOTE_PROVIDER_UNAVAILABLE' ||
      err.code === 'QUOTE_PROVIDER_INVALID_RATE'
    ) {
      return res.status(502).json({ error: err.message })
    }
    console.error('Create payment request error:', err)
    res.status(500).json({ error: 'Internal server error during payment creation' })
  }
}

export async function getCheckout(req, res) {
  try {
    const checkout = await getCheckoutDetails(req.params.paymentId)
    res.json(checkout)
  } catch (err) {
    if (err.code === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: err.message })
    }
    console.error('Fetch checkout error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function selectPaymentAsset(req, res) {
  try {
    const { supportedAssetId } = req.body
    if (!supportedAssetId) {
      return res.status(400).json({ error: 'supportedAssetId is required' })
    }

    const checkout = await selectAsset(req.params.paymentId, supportedAssetId)
    res.json({
      message: 'Payment asset selected',
      ...checkout,
    })
  } catch (err) {
    if (err.code === 'PAYMENT_NOT_FOUND' || err.code === 'ASSET_NOT_FOUND') {
      return res.status(404).json({ error: err.message })
    }
    if (
      err.code === 'INVALID_PAYMENT_STATUS' ||
      err.code === 'QUOTE_RATE_NOT_CONFIGURED' ||
      err.code === 'RECEIVING_ADDRESS_NOT_CONFIGURED'
    ) {
      return res.status(400).json({ error: err.message })
    }
    if (
      err.code === 'QUOTE_PROVIDER_UNAVAILABLE' ||
      err.code === 'QUOTE_PROVIDER_INVALID_RATE'
    ) {
      return res.status(502).json({ error: err.message })
    }
    console.error('Select payment asset error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}

export async function detectPaymentTransaction(req, res) {
  try {
    const result = await detectSepoliaPayment(req.params.paymentId)

    if (result.status === 'CONFIRMED') {
      return res.json({
        message: 'Payment detected and settled',
        ...result,
      })
    }

    if (result.status === 'EXPIRED') {
      return res.status(410).json(result)
    }

    return res.status(202).json(result)
  } catch (err) {
    if (err.code === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: err.message })
    }
    if (err.code === 'PAYMENT_NOT_READY' || err.code === 'UNSUPPORTED_PAYMENT_ASSET') {
      return res.status(400).json({ error: err.message })
    }
    if (
      err.code === 'SEPOLIA_RPC_URL_MISSING' ||
      err.code === 'MERCHANT_RECEIVING_ADDRESS_INVALID' ||
      err.code === 'SEPOLIA_RPC_WRONG_NETWORK'
    ) {
      return res.status(500).json({ error: err.message })
    }
    console.error('Detect payment transaction error:', err)
    res.status(500).json({ error: 'Internal server error during payment detection' })
  }
}

export async function submitPaymentTransaction(req, res) {
  try {
    const { txHash } = req.body
    if (!txHash) {
      return res.status(400).json({
        status: 'INVALID_TX_HASH',
        error: 'txHash is required',
      })
    }

    const result = await submitSepoliaTransactionHash(req.params.paymentId, txHash)

    if (result.status === 'CONFIRMED') {
      return res.json({
        message: 'Payment verified and settled',
        ...result,
      })
    }

    if (result.status === 'PENDING_CONFIRMATION') {
      return res.status(202).json(result)
    }

    const statusCodeByVerificationStatus = {
      INVALID_TX_HASH: 400,
      TX_NOT_FOUND: 404,
      TX_FAILED: 400,
      WRONG_RECEIVING_ADDRESS: 400,
      UNDERPAID: 400,
      EXPIRED: 410,
      TX_ALREADY_USED: 409,
    }

    return res.status(statusCodeByVerificationStatus[result.status] || 400).json(result)
  } catch (err) {
    if (err.code === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: err.message })
    }
    if (err.code === 'PAYMENT_NOT_READY' || err.code === 'UNSUPPORTED_PAYMENT_ASSET') {
      return res.status(400).json({ error: err.message })
    }
    if (
      err.code === 'SEPOLIA_RPC_URL_MISSING' ||
      err.code === 'MERCHANT_RECEIVING_ADDRESS_INVALID' ||
      err.code === 'SEPOLIA_RPC_WRONG_NETWORK'
    ) {
      return res.status(500).json({ error: err.message })
    }
    console.error('Submit payment transaction error:', err)
    res.status(500).json({ error: 'Internal server error during transaction verification' })
  }
}
