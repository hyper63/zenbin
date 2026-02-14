// JWT Verification Middleware for ZenBin
// Verifies API keys from the ZenBin Portal

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// Environment variable - must match portal's ZENBIN_JWT_SECRET
const ZENBIN_JWT_SECRET = process.env.ZENBIN_JWT_SECRET || 'change-me-in-production'

// Rate limit for free users (no API key)
const FREE_MONTHLY_LIMIT = 10
const FREE_MONTHLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

// In-memory usage tracking (replace with Redis for production)
const freeUsage = new Map<string, { count: number, resetTime: number }>()

interface JwtPayload {
  sub: string
  email: string
  plan: string
  monthlyRequests: number
  apiKeyId: string
}

export function verifyApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  const apiKey = req.headers['x-api-key'] as string

  // No API key provided - apply free tier limits
  if (!authHeader && !apiKey) {
    return handleFreeTier(req, res, next)
  }

  const token = apiKey || authHeader?.replace('Bearer ', '')

  if (!token) {
    return res.status(401).json({ error: 'API key required' })
  }

  try {
    const decoded = jwt.verify(token, ZENBIN_JWT_SECRET) as JwtPayload
    
    // Attach user info to request
    (req as any).user = decoded
    
    // Track usage for rate limiting
    trackUsage(decoded.sub, decoded.monthlyRequests)
    
    next()
  } catch (err) {
    // Invalid token - try as legacy key or reject
    if (token.startsWith('zb_live_')) {
      return res.status(401).json({ error: 'Invalid API key' })
    }
    return handleFreeTier(req, res, next)
  }
}

function handleFreeTier(req: Request, res: Response, next: NextFunction) {
  const clientId = getClientId(req)
  const now = Date.now()
  
  let usage = freeUsage.get(clientId)
  
  // Reset if window expired
  if (!usage || now > usage.resetTime) {
    usage = { count: 0, resetTime: now + FREE_MONTHLY_WINDOW_MS }
    freeUsage.set(clientId, usage)
  }
  
  if (usage.count >= FREE_MONTHLY_LIMIT) {
    res.set('Retry-After', String(Math.floor((usage.resetTime - now) / 1000)))
    return res.status(429).json({ 
      error: 'Free tier limit exceeded',
      limit: FREE_MONTHLY_LIMIT,
      resetsAt: new Date(usage.resetTime).toISOString()
    })
  }
  
  usage.count++
  (req as any).user = { plan: 'free', monthlyRequests: FREE_MONTHLY_LIMIT }
  next()
}

function getClientId(req: Request): string {
  // Use IP + user agent as client identifier for free tier
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const ua = req.headers['user-agent'] || 'unknown'
  return `${ip}:${ua.slice(0, 50)}`
}

function trackUsage(userId: string, limit: number) {
  // In production, track in Redis with daily/weekly rolling window
  // This is a simplified version
  console.log(`[API Key] User ${userId} - limit: ${limit}`)
}

export function requirePlan(...allowedPlans: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' })
    }
    
    if (!allowedPlans.includes(user.plan)) {
      return res.status(403).json({ 
        error: 'Plan upgrade required',
        currentPlan: user.plan,
        requiredPlans: allowedPlans
      })
    }
    
    next()
  }
}
