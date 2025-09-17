import { Router } from 'itty-router'
import { hashPassword, verifyPassword, generateJWT, verifyJWT } from './utils/auth.js'
import { insertUser, findUserByEmail, verifyUserKYC, lockUserName } from './utils/db.js'

const router = Router()

// ✅ Signup
router.post('/api/signup', async (request, env) => {
  try {
    const { name, email, password } = await request.json()
    if (!name || !email || !password) {
      return new Response(JSON.stringify({ error: 'All fields required' }), { status: 400 })
    }

    const existing = await findUserByEmail(env.DB, email)
    if (existing) {
      return new Response(JSON.stringify({ error: 'Email already registered' }), { status: 400 })
    }

    const password_hash = await hashPassword(password)
    const userId = await insertUser(env.DB, { name, email, password_hash })

    const token = await generateJWT({ id: userId, email })

    return new Response(JSON.stringify({ token, kyc: false }), { status: 201 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// ✅ Login
router.post('/api/login', async (request, env) => {
  try {
    const { email, password } = await request.json()
    const user = await findUserByEmail(env.DB, email)
    if (!user) return new Response(JSON.stringify({ error: 'Invalid login' }), { status: 401 })

    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) return new Response(JSON.stringify({ error: 'Invalid login' }), { status: 401 })

    const token = await generateJWT({ id: user.id, email: user.email })
    return new Response(JSON.stringify({ token, kyc: !!user.is_kyc_verified }), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// ✅ Protected profile
router.get('/api/me', async (request, env) => {
  try {
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

    const token = authHeader.split(' ')[1]
    const payload = await verifyJWT(token, env.JWT_SECRET)

    const user = await findUserByEmail(env.DB, payload.email)
    if (!user) return new Response(JSON.stringify({ error: 'User not found' }), { status: 404 })

    return new Response(JSON.stringify({
      id: user.id,
      name: user.name,
      email: user.email,
      kyc: !!user.is_kyc_verified
    }), { status: 200 })
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401 })
  }
})

// ✅ KYC Verification with Gemini
router.post('/api/kyc/verify', async (request, env) => {
  try {
    const { email, idImageBase64, selfieBase64 } = await request.json()
    if (!email || !idImageBase64 || !selfieBase64) {
      return new Response(JSON.stringify({ error: 'Missing KYC data' }), { status: 400 })
    }

    // 🔗 Call Gemini API (mock example)
    const geminiResp = await fetch('https://api.google.com/gemini/v1/kyc', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GEMINI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id_image: idImageBase64,
        selfie: selfieBase64
      }),
    })

    const result = await geminiResp.json()

    if (result.verified) {
      await verifyUserKYC(env.DB, email)
      await lockUserName(env.DB, email) // 🚫 cannot change name after KYC
      return new Response(JSON.stringify({ success: true, message: 'KYC passed ✅' }), { status: 200 })
    }

    return new Response(JSON.stringify({ success: false, message: 'KYC failed ❌' }), { status: 400 })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// Fallback
router.all('*', () => new Response('Not Found', { status: 404 }))

export default {
  fetch: (request, env, ctx) => router.handle(request, env, ctx),
}