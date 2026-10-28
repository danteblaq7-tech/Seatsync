import jwt from 'jsonwebtoken'
import { findById } from '../repositories/sqlRepository.js'

import {
  refreshSession,
  setAuthCookies,
  verifyRefreshToken
} from '../services/auth/authService.js'

const JWT_SECRET = process.env.JWT_SECRET || 'seatsync-dev-secret'

const verifyToken = (token, expectedType = 'access') => {
  const decoded = jwt.verify(token, JWT_SECRET)
  if (expectedType && decoded.type !== expectedType) {
    throw new Error(`Expected ${expectedType} token.`)
  }
  return decoded
}

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization
  const tokenFromHeader =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null
  const tokenFromCookie = req.cookies?.accessToken
  const token = tokenFromHeader || tokenFromCookie

  if (!token) {
    return res.status(401).json({ message: 'Authentication required.' })
  }

  try {
    req.user = verifyToken(token, 'access')
    const storedUser = await findById('users', req.user.id)
    if (!storedUser || !(storedUser.isActive ?? storedUser.is_active)) {
      return res.status(403).json({
        message: 'This account has been blocked. Contact an administrator.'
      })
    }
    return next()
  } catch (error) {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ message: 'Invalid or expired token.' })
    }

    try {
      const refreshed = await refreshSession(refreshToken)
      const user = refreshed.user

      req.user = {
        id: user.id,
        email: user.email,
        roles: user.roles || []
      }

      setAuthCookies(res, refreshed.accessToken, refreshed.refreshToken)
      req.accessToken = refreshed.accessToken
      req.refreshToken = refreshed.refreshToken

      return next()
    } catch (refreshError) {
      console.error('Access token refresh failed:', refreshError.message)
      return res
        .status(401)
        .json({ message: 'Session expired. Please log in again.' })
    }
  }
}

export const requireRefreshToken = (req, res, next) => {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken

  if (!refreshToken) {
    return res.status(401).json({ message: 'Refresh token required.' })
  }

  try {
    req.user = verifyRefreshToken(refreshToken)
    next()
  } catch (error) {
    return res
      .status(401)
      .json({ message: 'Invalid or expired refresh token.' })
  }
}

export const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user || !req.user.roles) {
      return res.status(403).json({ message: 'Access denied.' })
    }

    const userRoles = Array.isArray(req.user.roles)
      ? req.user.roles
      : [req.user.roles]
    const hasAccess = allowedRoles.some(role => userRoles.includes(role))

    if (!hasAccess) {
      return res.status(403).json({
        message: 'You do not have permission to access this resource.'
      })
    }

    next()
  }
