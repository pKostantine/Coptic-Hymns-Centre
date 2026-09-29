// Coptic and Greek numerals, as the Bible reader numbers its Coptic and Greek
// columns — shared by the reader and the references a copy is signed with.

const COPTIC_DIGITS: Record<number, string> = { 1: 'ⲁ̅', 2: 'ⲃ̅', 3: 'ⲅ̅', 4: 'ⲇ̅', 5: 'ⲉ̅', 6: 'ⲋ', 7: 'ⲍ̅', 8: 'ⲏ̅', 9: 'ⲑ̅' };
const COPTIC_TENS: Record<number, string> = { 1: 'ⲓ̅', 2: 'ⲕ̅', 3: 'ⲗ̅', 4: 'ⲙ̅', 5: 'ⲛ̅', 6: 'ⲝ̅', 7: 'ⲟ̅', 8: 'ⲡ̅', 9: 'ϥ̅' };
const COPTIC_HUNDREDS: Record<number, string> = { 1: 'ⲣ̅', 2: 'ⲥ̅', 3: 'ⲧ̅', 4: 'ⲩ̅', 5: 'ⲫ̅', 6: 'ⲭ̅', 7: 'ⲯ̅', 8: 'ⲱ̅', 9: 'ϣ̅' };

export function formatCopticNumber(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value > 999) return String(value);
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  return `${COPTIC_HUNDREDS[hundreds] || ''}${COPTIC_TENS[tens] || ''}${COPTIC_DIGITS[ones] || ''}`;
}

const GREEK_NUMERAL_SIGN = 'ʹ';
const GREEK_THOUSANDS_SIGN = '͵';
const GREEK_DIGITS: Record<number, string> = { 1: 'Α', 2: 'Β', 3: 'Γ', 4: 'Δ', 5: 'Ε', 6: 'Ϛ', 7: 'Ζ', 8: 'Η', 9: 'Θ' };
const GREEK_TENS: Record<number, string> = { 1: 'Ι', 2: 'Κ', 3: 'Λ', 4: 'Μ', 5: 'Ν', 6: 'Ξ', 7: 'Ο', 8: 'Π', 9: 'Ϟ' };
const GREEK_HUNDREDS: Record<number, string> = { 1: 'Ρ', 2: 'Σ', 3: 'Τ', 4: 'Υ', 5: 'Φ', 6: 'Χ', 7: 'Ψ', 8: 'Ω', 9: 'Ϡ' };

export function formatGreekNumber(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value > 9999) return String(value);
  const thousands = Math.floor(value / 1000);
  const remainder = value % 1000;
  const numeral = `${thousands ? `${GREEK_THOUSANDS_SIGN}${formatGreekNumberUnderThousand(thousands)}` : ''}${formatGreekNumberUnderThousand(remainder)}`;
  return numeral ? `${numeral}${GREEK_NUMERAL_SIGN}` : String(value);
}

function formatGreekNumberUnderThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;
  return `${GREEK_HUNDREDS[hundreds] || ''}${GREEK_TENS[tens] || ''}${GREEK_DIGITS[ones] || ''}`;
}
