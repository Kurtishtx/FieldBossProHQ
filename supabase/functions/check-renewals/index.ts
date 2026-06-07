import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function addOneYear(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setFullYear(d.getFullYear() + 1)
  return d.toISOString().split('T')[0]
}

Deno.serve(async () => {
  const today = new Date()
  const currentYear = today.getFullYear()
  const todayMMDD =
    String(today.getMonth() + 1).padStart(2, '0') + '/' +
    String(today.getDate()).padStart(2, '0')

  // Find packages whose renewal date matches today and haven't renewed this year yet
  const { data: packages } = await sb
    .from('Packages')
    .select('id, user_id, name, renewal_date, last_renewed_year')
    .eq('renewal_date', todayMMDD)
    .eq('active', true)

  if (!packages || !packages.length) {
    return new Response(JSON.stringify({ renewed: 0, message: 'No packages due today' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let renewedCount = 0

  for (const pkg of packages) {
    // Skip if already renewed this year
    if (pkg.last_renewed_year === currentYear) continue

    // Get the package service template rows
    const { data: psRows } = await sb
      .from('package_services')
      .select('*')
      .eq('package_id', pkg.id)
      .order('id')

    if (!psRows || !psRows.length) continue

    const psIds = psRows.map((r: any) => r.id)

    // Get all distinct properties subscribed to this package
    const { data: svcRows } = await sb
      .from('Services')
      .select('property_id, customer_id, client_name, address, package_service_id, amount')
      .in('package_service_id', psIds)
      .not('property_id', 'is', null)

    if (!svcRows || !svcRows.length) continue

    // Build per-property info and rate map
    const propMap: Record<string, any> = {}
    const rateMap: Record<string, Record<string, number>> = {}

    for (const s of svcRows) {
      if (!propMap[s.property_id]) propMap[s.property_id] = s
      if (!rateMap[s.property_id]) rateMap[s.property_id] = {}
      rateMap[s.property_id][s.package_service_id] = parseFloat(s.amount) || 0
    }

    for (const propId of Object.keys(propMap)) {
      const info = propMap[propId]
      const rates = rateMap[propId] || {}

      // Build new service inserts with dates shifted +1 year
      const inserts = psRows
        .filter((ps: any) => ps.start_date) // only rows with dates
        .map((ps: any) => ({
          user_id: pkg.user_id,
          property_id: propId,
          customer_id: info.customer_id || null,
          client_name: info.client_name || '',
          address: info.address || '',
          service: ps.name || ps.service_name || '',
          amount: rates[ps.id] ?? (parseFloat(ps.default_rate) || 0),
          min_days: ps.min_days || 0,
          package_service_id: ps.id,
          start_date: addOneYear(ps.start_date),
          end_date: ps.end_date ? addOneYear(ps.end_date) : null,
          dispatched: false,
          status: 'pending'
        }))

      if (inserts.length) {
        const { error } = await sb.from('Services').insert(inserts)
        if (!error) renewedCount++
      }
    }

    // Mark this package as renewed for the current year
    await sb.from('Packages').update({ last_renewed_year: currentYear }).eq('id', pkg.id)
  }

  return new Response(JSON.stringify({ renewed: renewedCount }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
