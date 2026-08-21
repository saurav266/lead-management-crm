// Generates the fallback unique key for a lead when the sheet doesn't supply one:
//   FirstName-City-<last 2 digits of MOB>   e.g. "Surender-Sonipat-31"
export function generateLeadKey({ name, city, mob }) {
  const firstName = (name || '').trim().split(/\s+/)[0] || 'Unknown';
  const cityPart = (city || '').trim() || 'Unknown';
  const digitsOnly = (mob || '').replace(/\D/g, '');
  const last2 = digitsOnly.slice(-2).padStart(2, '0') || '00';
  return `${firstName}-${cityPart}-${last2}`;
}
