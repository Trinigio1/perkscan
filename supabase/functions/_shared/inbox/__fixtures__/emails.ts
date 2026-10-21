// Fictional sample emails used by the inbox tests.
export const PROMO_HTML = `<html><head><style>.x{color:red}</style><title>Sale</title></head><body>
<img src="https://track.example.com/open.gif?u=123" width="1" height="1">
<div>Hi there,</div><p>Take <b>20%&nbsp;off</b> your next order with code <b>SPRING20</b>.</p>
<p>Offer ends April 30, 2026. <a href="https://www.acmeoutfitters.com/shop?utm_source=email&amp;id=99">Shop now</a></p>
<table><tr><td>Free</td><td>shipping</td></tr></table>
<p style="font-size:10px">You are receiving this because you signed up. <a href="https://acme.example/unsub">Unsubscribe</a></p>
<p>&copy; 2026 Acme Outfitters. All rights reserved.</p></body></html>`;

export const RECEIPT_TEXT = `Thanks for your order!
Order #112233445566778899
Paid with Visa ending in 4242
Card number on file: 4111 1111 1111 1111

Trail Runner Shoes  $89.99
Socks (3 pack)  $12.00
Total: $101.99

Returns accepted within 30 days.
https://www.acmeoutfitters.com/orders/112233445566778899

--
Acme Outfitters Customer Care`;

/** Wording of a real Scotiabank T&T alert; card digits and amount changed. */
export const SCOTIA_ALERT_TEXT = `There was an authorization made outside of the country for $144.51 TTD at UBER * EATS PENDING on your Scotiabank Credit Card ***0000 at 08:59 pm AST.

If you didn’t do this, call the number on the back of your card.`;
