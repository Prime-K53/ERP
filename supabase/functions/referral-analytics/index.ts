// Referral Analytics Generator Edge Function
// Scheduled via Supabase Cron: generates periodic analytics snapshots

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json().catch(() => ({}))
    const period = body.period || 'monthly'

    const now = new Date()
    let startDate: string

    if (period === 'daily') {
      startDate = now.toISOString().slice(0, 10)
    } else if (period === 'weekly') {
      const d = new Date(now)
      d.setDate(d.getDate() - d.getDay())
      startDate = d.toISOString().slice(0, 10)
    } else if (period === 'yearly') {
      startDate = `${now.getFullYear()}-01-01`
    } else {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    }

    const endDate = now.toISOString().slice(0, 10)

    const { data, error } = await supabase.rpc('generate_referral_analytics', {
      p_period: period,
      p_start_date: startDate,
      p_end_date: endDate,
    })

    if (error) throw error

    return new Response(JSON.stringify({ analyticsId: data, period, startDate, endDate }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
