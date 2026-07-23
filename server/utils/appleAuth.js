import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

/**
 * Generates the Apple Client Secret JWT.
 * Real keys require a valid ECDSA ES256 key. Mock configs are bypassed.
 */
export function generateAppleClientSecret() {
  const { teamId, keyId, privateKey, clientId } = env.apple

  if (!teamId || !keyId || !privateKey || !clientId) {
    throw new Error('Missing Apple environment variables')
  }

  // If mock configuration is active, return a simulated client secret
  if (privateKey.includes('MOCK') || privateKey === '') {
    return 'mock-apple-client-secret'
  }

  try {
    const time = Math.floor(Date.now() / 1000)
    const payload = {
      iss: teamId,
      iat: time,
      exp: time + (86400 * 180), // 6 months expiration limit
      aud: 'https://appleid.apple.com',
      sub: clientId,
    }

    const headers = {
      alg: 'ES256',
      kid: keyId,
    }

    // Format the private key if it has escaped newlines
    const formattedKey = privateKey.replace(/\\n/g, '\n')

    return jwt.sign(payload, formattedKey, { algorithm: 'ES256', header: headers })
  } catch (err) {
    console.warn('⚠️ Failed to generate real Apple Client Secret, falling back to mock. Error:', err.message)
    return 'mock-apple-client-secret'
  }
}

/**
 * Exchanges the Authorization Code for an access token / id_token with Apple.
 */
export async function verifyAppleAuthorizationCode(code) {
  const { clientId, redirectUri, privateKey } = env.apple

  // If mock mode, simulate verification
  if (privateKey.includes('MOCK') || privateKey === '' || code.startsWith('mock_')) {
    console.log('🍎 [SIMULATOR] Bypassing Apple server request (Mock mode active)')
    return {
      isMock: true,
      email: 'apple.merchant@example.com',
      sub: `mock-apple-id-${code}`,
    }
  }

  try {
    const clientSecret = generateAppleClientSecret()

    const bodyParams = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    })

    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Apple Token endpoint returned status ${response.status}: ${errorText}`)
    }

    const tokenData = await response.json()
    
    // Decode the id_token to extract the user email and identifier (sub)
    const decoded = jwt.decode(tokenData.id_token)
    if (!decoded) {
      throw new Error('Unable to decode id_token from Apple response')
    }

    return {
      isMock: false,
      email: decoded.email,
      sub: decoded.sub,
    }
  } catch (err) {
    console.error('❌ Real Apple OAuth2 verification failed:', err)
    throw err
  }
}
