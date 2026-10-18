// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Money } from '@/ui/money';
import { MoneyInput } from '@/ui/money-input';
import { DateText } from '@/ui/date-text';
import { money } from '@/core/money';

afterEach(cleanup);

describe('Money', () => {
  it('negatif tutar eksi işaretiyle, sağa hizalı ve ayırt edici renkte', () => {
    render(<Money value={money(-123456n, 'TRY')} />);
    const el = screen.getByText('−1.234,56 ₺');
    expect(el.className).toContain('text-right');
    expect(el.className).toContain('tabular-nums');
    expect(el.getAttribute('data-negative')).toBe('true');
  });
});

describe('MoneyInput', () => {
  it('odaktan çıkınca iki haneye tamamlar', () => {
    render(<MoneyInput name="tutar" currency="TRY" aria-label="Tutar" />);
    const input = screen.getByLabelText('Tutar') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12,5' } });
    fireEvent.blur(input);
    expect(input.value).toBe('12,50');
  });

  it('binlik ayırıcıyla biçimler', () => {
    render(<MoneyInput name="tutar" currency="TRY" aria-label="Tutar" />);
    const input = screen.getByLabelText('Tutar') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1234,5' } });
    fireEvent.blur(input);
    expect(input.value).toBe('1.234,50');
  });

  it('negatif değer izin verilmediyse hata gösterir', () => {
    render(<MoneyInput name="tutar" currency="TRY" aria-label="Tutar" />);
    const input = screen.getByLabelText('Tutar') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toMatch(/negatif/i);
  });
});

describe('DateText', () => {
  it('GG.AA.YYYY', () => {
    render(<DateText value="2026-10-18" />);
    expect(screen.getByText('18.10.2026').tagName).toBe('TIME');
  });
});
