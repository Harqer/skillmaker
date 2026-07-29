## SKILL: StripePaymentProcessor

**Description:** Official Stripe API integration for processing payments, managing customers, creating checkout sessions, and securely handling webhooks. This skill leverages the Stripe SDKs to interact with the Stripe API following recommended security and operational patterns.

**Instructions for Use:**
This skill is designed for server-side operations requiring the `STRIPE_SECRET_KEY`. It provides methods to interact with core Stripe functionalities.

1.  **Prerequisites:**
    *   Ensure `STRIPE_SECRET_KEY` is set as an environment variable or passed securely.
    *   For client-side interactions (e.g., collecting card details, 3D Secure), use Stripe.js directly in the frontend.

2.  **Core Operations:**
    *   **Create Customer:** Use to create or retrieve customer objects for recurring billing or storing payment methods.
        *   **Pattern:** `stripe.customers.create({ email: 'customer@example.com', name: 'Test Customer' })`
    *   **Create Payment Intent:** Initiates a payment flow, indicating the amount, currency, and intended payment methods.
        *   **Pattern:** `stripe.paymentIntents.create({ amount: 2000, currency: 'usd', payment_method_types: ['card'], description: 'Order #123' })`
    *   **Confirm Payment Intent:** Finalizes a Payment Intent, often requiring a `payment_method_id` obtained securely from the client-side.
        *   **Pattern:** `stripe.paymentIntents.confirm(paymentIntentId, { payment_method: 'pm_card_visa' })`
    *   **Create Checkout Session (Stripe Checkout):** Generates a URL for a Stripe-hosted payment page.
        *   **Pattern:** `stripe.checkout.sessions.create({ line_items: [{ price_data: { currency: 'usd', product_data: { name: 'T-shirt' }, unit_amount: 2000 }, quantity: 1 }], mode: 'payment', success_url: 'https://example.com/success', cancel_url: 'https://example.com/cancel' })`
    *   **Handle Webhook:** Verifies the authenticity of a Stripe webhook event and parses its payload.
        *   **Pattern:** `stripe.webhooks.constructEvent(requestBody, signature, webhookSecret)`

3.  **Idempotency:** For retriable requests, always include an `Idempotency-Key` header to prevent duplicate operations (e.g., creating the same charge twice).
    *   **Pattern:** Pass `{ idempotencyKey: 'your_unique_key' }` in the options object for applicable SDK calls.

**Negative Constraints:**
*   NEVER expose your `STRIPE_SECRET_KEY` or `WEBHOOK_SECRET` in client-side code.
*   DO NOT store sensitive card information on your servers. Rely on Stripe.js and `PaymentMethod` objects.
*   AVOID directly trusting webhook payloads without signature verification using `stripe.webhooks.constructEvent`.
*   DO NOT ignore error responses from Stripe API calls; always implement robust error handling.

**Zero-token Interception Rules:**
*   `integrate Stripe`
*   `process payment with Stripe`
*   `Stripe webhook`
*   `create Stripe customer`
*   `Stripe Checkout`
*   `handle Stripe payment`
*   `use Stripe API`