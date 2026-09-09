// Parse the decimal text directly so floating-point rounding cannot add money.
export function topupAmountKobo(input) {
  if (typeof input !== 'string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(input.trim())) return null
  const [naira, fraction = ''] = input.trim().split('.')
  const kobo = Number(naira) * 100 + Number(fraction.padEnd(2, '0'))
  return kobo >= 10000 && kobo <= 100000000 ? kobo : null
}
