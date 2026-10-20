import { buildModelInput, cleanEmailText, decodeEntities, fromDomain, htmlToText, luhnValid, maskCardNumbers, MAX_MODEL_CHARS } from '../clean.ts';
import { PROMO_HTML, RECEIPT_TEXT } from '../__fixtures__/emails.ts';

describe('htmlToText', () => {
  const text = htmlToText(PROMO_HTML);
  it('drops styles, titles and tracking pixels', () => {
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('open.gif');
    expect(text).not.toContain('<');
  });
  it('keeps the offer and decodes entities', () => {
    expect(text).toContain('20% off');
    expect(text).toContain('SPRING20');
  });
});

describe('cleanEmailText', () => {
  it('removes the unsubscribe footer and copyright', () => {
    const out = cleanEmailText(htmlToText(PROMO_HTML));
    expect(out).not.toMatch(/unsubscribe/i);
    expect(out).not.toMatch(/all rights reserved/i);
    expect(out).toContain('Offer ends April 30, 2026.');
  });
  it('replaces links with their domain', () => {
    expect(cleanEmailText('Shop https://www.acme.com/x?utm=1 now')).toBe('Shop [link: acme.com] now');
  });
  it('masks full card numbers but keeps order numbers and last-four mentions', () => {
    const out = cleanEmailText(RECEIPT_TEXT);
    expect(out).toContain('Card number on file: •••• 1111');
    expect(out).not.toContain('4111 1111 1111 1111');
    expect(out).toContain('Order #112233445566778899');
    expect(out).toContain('Visa ending in 4242');
  });
  it('stops at a signature delimiter', () => {
    expect(cleanEmailText(RECEIPT_TEXT)).not.toContain('Customer Care');
  });
  it('collapses whitespace', () => {
    expect(cleanEmailText('a   b\n\n\n\n\nc')).toBe('a b\n\nc');
  });
});

describe('helpers', () => {
  it('luhn', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
  });
  it('maskCardNumbers leaves non-card digit runs alone', () => {
    expect(maskCardNumbers('Order 1234567890123')).toBe('Order 1234567890123');
    // Luhn-valid and card-like, but introduced as an order/tracking number.
    expect(maskCardNumbers('Order # 4111111111111111')).toBe('Order # 4111111111111111');
    expect(maskCardNumbers('Tracking: 4111111111111111')).toBe('Tracking: 4111111111111111');
    expect(maskCardNumbers('Card 5555-5555-5555-4444')).toBe('Card •••• 4444');
  });
  it('decodeEntities', () => {
    expect(decodeEntities('Tom &amp; Jerry&#39;s &#x24;5 &zwnj;off')).toBe("Tom & Jerry's $5 off");
  });
  it('fromDomain keeps only the registrable domain', () => {
    expect(fromDomain('Acme <orders@mail.shop.acme.com>')).toBe('acme.com');
    expect(fromDomain('no address')).toBeNull();
  });
});

describe('buildModelInput', () => {
  it('uses the HTML part when there is no text part and never includes the full sender address', () => {
    const input = buildModelInput({ subject: 'Spring sale', from: 'Acme <deals@acme.com>', date: '2026-04-01', html: PROMO_HTML, text: '' });
    expect(input.startsWith('Subject: Spring sale\nFrom domain: acme.com\nDate: 2026-04-01')).toBe(true);
    expect(input).not.toContain('deals@');
    expect(input).toContain('SPRING20');
  });
  it('truncates very long emails', () => {
    const input = buildModelInput({ text: 'x '.repeat(20_000) });
    expect(input.length).toBeLessThanOrEqual(MAX_MODEL_CHARS + 20);
    expect(input.endsWith('[truncated]')).toBe(true);
  });
});
