import {
  createPayment,
  getCheckoutDetails,
  selectAsset,
} from '../services/paymentService.js'

export async function createPaymentRequest(req, res) {
  try {
    const {
      amountSgd,
      merchantOrderReference,
      description,
      customerReference,
    } = req.body
    const parsedAmount = Number(amountSgd)

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'amountSgd must be a positive number' })
    }

    const payment = await createPayment({
      merchantId: req.merchantId,
      amountSgd: parsedAmount,
      merchantOrderReference,
      description,
      customerReference,
    })

    res.status(201).json({
      message: 'Payment request created',
      payment,
    })
  } catch (err) {
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
    console.error('Select payment asset error:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
