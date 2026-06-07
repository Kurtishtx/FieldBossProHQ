import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().split('T')[0]
}

Deno.serve(async () => {
  const today = new Date()
  const currentYear = today.getFullYear()

  // Get all active packages that have a renewal date configured
  const { data: packages } = await sb
    .from('Packages')
    .select('id, user_id, name, renewal_date, last_renewed_year')
    .not('renewal_date', 'is', null)
    .eq('active', true)

  if (!packages || !packages.length) {
    return new Response(JSON.stringify({ renewed: 0, message: 'No packages with renewal dates' }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  let renewedCount = 0

  for (const pkg of packages) {
    if (!pkg.renewal_date) continue

    const parts = pkg.renewal_date.split('/')
    if (parts.length < 2) continue
    const renewalMonth = parseInt(parts[0]) - 1 // 0-indexed
    const renewalDay = parseInt(parts[1])

    // Determine the most recent renewal that SHOULD have occurred by today
    // e.g. if renewal is 12/31 and today is 01/05/2027, expected = 2026
    // e.g. if renewal is 01/01 and today is 01/05/2027, expected = 2027
    const renewalThisYear = new Date(currentYear, renewalMonth, renewalDay)
    const expectedRenewalYear = today >= renewalThisYear ? currentYear : currentYear - 1

    // Skip if already renewed for the expected year (or later)
    if ((pkg.last_renewed_year || 0) >= expectedRenewalYear) continue

    // Get the package service template rows
    const { data: psRows } = await sb
      .from('package_services')
      .select('*')
      .eq('package_id', pkg.id)
      .order('id')

    if (!psRows || !psRows.length) continue

    const psIds = psRows.map((r: any) => r.id)

    // Determine the template year from the first row that has a start_date
    const firstDated = psRows.find((ps: any) => ps.start_date)
    if (!firstDated) continue
    const templateYear = new Date(firstDated.start_date + 'T00:00:00').getFullYear()

    // Get all services for this package across all properties
    const { data: svcRows } = await sb
      .from('Services')
      .select('property_id, customer_id, client_name, address, package_service_id, amount, start_date')
      .in('package_service_id', psIds)
      .not('property_id', 'is', null)

    if (!svcRows || !svcRows.length) continue

    // Build per-property info, rate map, and latest service year
    const propMap: Record<string, any> = {}
    const rateMap: Record<string, Record<string, number>> = {}
    const latestYearMap: Record<string, number> = {}

    for (const s of svcRows) {
      if (!propMap[s.property_id]) propMap[s.property_id] = s
      if (!rateMap[s.property_id]) rateMap[s.property_id] = {}
      rateMap[s.property_id][s.package_service_id] = parseFloat(s.amount) || 0
      if (s.start_date) {
        const yr = new Date(s.start_date + 'T00:00:00').getFullYear()
        latestYearMap[s.property_id] = Math.max(latestYearMap[s.property_id] || 0, yr)
      }
    }

    for (const propId of Object.keys(propMap)) {
      const info = propMap[propId]
      const rates = rateMap[propId] || {}

      // Shift dates forward from the latest existing services, not always from template
      // This ensures correct year even if multiple renewals were missed
      const latestYear = latestYearMap[propId] || templateYear
      const yearsToShift = latestYear - templateYear + 1

      const inserts = psRows
        .filter((ps: any) => ps.start_date)
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
          start_date: addYears(ps.start_date, yearsToShift),
          end_date: ps.end_date ? addYears(ps.end_date, yearsToShift) : null,
          dispatched: false,
          status: 'pending'
        }))

      if (inserts.length) {
        const { error } = await sb.from('Services').insert(inserts)
        if (!error) renewedCount++
      }
    }

    // Mark package as renewed for the expected year
    await sb.from('Packages').update({ last_renewed_year: expectedRenewalYear }).eq('id', pkg.id)
  }

  return new Response(JSON.stringify({ renewed: renewedCount }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
