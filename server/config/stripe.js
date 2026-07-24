import Stripe from 'stripe'
import { env } from './env.js'

if (!env.stripe.secretKey) {
  throw new Error('STRIPE_SECRET_KEY is missing from .env')
}

if (!env.stripe.secretKey.includes('_test_')) {
  throw new Error('Stripe Sandbox key required. Live keys are blocked for this project.')
}

const stripe = new Stripe(env.stripe.secretKey)

export default stripe
