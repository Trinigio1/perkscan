import { sanitizeEvent } from '../analyticsEvents';

describe('sanitizeEvent', () => {
  it('keeps allowed properties with allowed values', () => {
    expect(sanitizeEvent('review_submitted', { verdict: 'wrong' })).toEqual({ event: 'review_submitted', properties: { verdict: 'wrong' } });
    expect(sanitizeEvent('onboarding_completed', { cards: 2, student: true })).toEqual({ event: 'onboarding_completed', properties: { cards: 2, student: true } });
  });
  it('drops anything personal or unexpected', () => {
    const out = sanitizeEvent('card_added', { count: 1, email: 'me@example.com', last_four: '1234', merchant: 'Courts', amount: 99 });
    expect(out?.properties).toEqual({ count: 1 });
    expect(sanitizeEvent('school_selected', { country: 'University of Florida' })?.properties).toEqual({});
    expect(sanitizeEvent('text_added', { result: 'Your OTP is 1234' })?.properties).toEqual({});
  });
  it('buckets counts and refuses unknown events', () => {
    expect(sanitizeEvent('card_added', { count: 57 })?.properties).toEqual({ count: 20 });
    expect(sanitizeEvent('card_added', { count: -1 })?.properties).toEqual({});
    expect(sanitizeEvent('user_signed_in_with_email', { email: 'x' })).toBeNull();
  });
});
