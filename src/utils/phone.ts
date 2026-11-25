/** Turns 01xxxxxxxxx / +20 1xxxxxxxxx / 201xxxxxxxxx into 201xxxxxxxxx for wa.me links. */
export function toWhatsAppNumber(raw: string | undefined | null): string {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) return `20${digits.slice(1)}`;
  return digits;
}
