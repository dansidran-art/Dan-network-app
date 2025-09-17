import { Hono } from 'hono'
import { jwt } from 'hono/jwt'

const app = new Hono()

// Middleware: Protect routes with JWT
app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/public')) {
    return next()
  }
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token) return c.json({ error: 'No token provided' }, 401)

  try {
    const payload = await jwt.verify(token, c.env.JWT_SECRET)
    c.set('user', payload)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})

// --- PUBLIC ROUTES --- //
app.post('/api/public/signup', async (c) => {
  const { name, email, password } = await c.req.json()

  // insert into D1
  await c.env.DB.prepare(
    'INSERT INTO users (name, email, password) VALUES (?, ?, ?)'
  ).bind(name, email, password).run()

  return c.json({ message: 'User created successfully' })
})

app.post('/api/public/login', async (c) => {
  const { email, password } = await c.req.json()

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE email = ? AND password = ?'
  ).bind(email, password).first()

  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await jwt.sign({ id: user.id, email: user.email }, c.env.JWT_SECRET)
  return c.json({ token })
})

// --- PROTECTED ROUTES --- //
app.get('/api/products', async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM products').all()
  return c.json(result.results)
})

app.post('/api/products', async (c) => {
  const user = c.get('user')
  const { name, price } = await c.req.json()

  await c.env.DB.prepare(
    'INSERT INTO products (name, price, seller_id) VALUES (?, ?, ?)'
  ).bind(name, price, user.id).run()

  return c.json({ message: 'Product added successfully' })
})

export default app