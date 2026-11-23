import type { User } from 'firebase/auth';

const ARABIC_DIGIT_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export function toAsciiDigits(raw: string): string {
  return raw.replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_DIGIT_MAP[ch] ?? ch);
}

export function normalizePhoneKey(rawPhone: string): string {
  const digits = toAsciiDigits(rawPhone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0020')) {
    return `20${digits.slice(4)}`;
  }
  if (digits.startsWith('01') && digits.length === 11) {
    return `20${digits.slice(1)}`;
  }
  return digits;
}

export function isValidPhoneDigits(rawPhone: string): boolean {
  const key = normalizePhoneKey(rawPhone);
  return key.length >= 8 && key.length <= 15;
}

export function isUserActivated(user: User | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.emailVerified);
}
