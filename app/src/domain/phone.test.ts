import { describe, expect, it } from 'vitest';
import { formatPhone } from './phone';

describe('formatPhone', () => {
  it('numéro suisse en xxx xxx xx xx', () => {
    expect(formatPhone('0791234567')).toBe('079 123 45 67');
    expect(formatPhone('079-123.45 67')).toBe('079 123 45 67');
  });
  it('formate pendant la saisie', () => {
    expect(formatPhone('079')).toBe('079');
    expect(formatPhone('07912')).toBe('079 12');
    expect(formatPhone('07912345')).toBe('079 123 45');
  });
  it('+41, 0041 et +41 0', () => {
    expect(formatPhone('+41791234567')).toBe('+41 79 123 45 67');
    expect(formatPhone('0041791234567')).toBe('+41 79 123 45 67');
    expect(formatPhone('+41 079 123 45 67')).toBe('+41 79 123 45 67');
    expect(formatPhone('+41')).toBe('+41');
  });
  it('autre pays laissé tel quel', () => {
    expect(formatPhone('+51 987 654 321')).toBe('+51 987 654 321');
  });
  it('vide', () => { expect(formatPhone('')).toBe(''); });
});
