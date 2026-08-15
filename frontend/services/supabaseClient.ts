import { createClient } from '@supabase/supabase-js'
import { PLACEHOLDER_SUPABASE_URL } from './cloudMode'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Set them in .env file or Netlify environment variables.'
  )
}

const TIMEOUT_MS = 30000
const TIMEOUT_MS_IDEMPOTENCY = 10000

function fetchWithTimeout(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const signal = options?.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal

  return fetch(url, { ...options, signal })
    .finally(() => clearTimeout(id))
}

function fetchWithIdempotencyTimeout(url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS_IDEMPOTENCY)

  const signal = options?.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal

  return fetch(url, { ...options, signal })
    .finally(() => clearTimeout(id))
}

export const supabase = createClient(
  supabaseUrl || PLACEHOLDER_SUPABASE_URL,
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'prime-erp-supabase-auth',
      storage: localStorage
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
    global: {
      fetch: fetchWithTimeout
    }
  }
)

export const supabaseIdempotency = createClient(
  supabaseUrl || PLACEHOLDER_SUPABASE_URL,
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'prime-erp-supabase-auth-idempotency',
      storage: localStorage
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    },
    global: {
      fetch: fetchWithIdempotencyTimeout
    }
  }
)

export const getSupabase = () => supabase
