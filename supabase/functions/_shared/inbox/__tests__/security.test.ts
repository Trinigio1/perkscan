import { containsSecurityCode } from '../security.ts';

describe('containsSecurityCode', () => {
  it.each([
    'Your OTP is 482913. Do not share it with anyone.',
    'Scotiabank: Your one-time password is 55 21 90',
    'Your OTP for the purchase of TT$144.51 at UBER * EATS is 482913',
    '482913 is your Uber code',
    'Your verification code: 7781',
    'Your Apple ID code is: 123456. Don’t share it.',
    'G-842917 is your Google verification code.',
    'Use 2FA code 908172 to sign in',
  ])('drops %p', (text) => expect(containsSecurityCode(text)).toBe(true));

  it.each([
    'There was an authorization made outside of the country for $144.51 TTD at UBER * EATS PENDING on your Scotiabank Credit Card ***0000 at 08:59 pm AST.',
    'Scotiabank will never ask for your OTP or PIN. Call the number on the back of your card.',
    'Use code SAVE20 for 20% off until Sunday',
    'Get $10 off with promo code 2024SALE',
    'Your security deposit of TT$1500 has been refunded',
    'Order #12345678 confirmed. Total TT$350.00',
    'Your flight confirmation code is XJ4K2P',
  ])('keeps %p', (text) => expect(containsSecurityCode(text)).toBe(false));
});
