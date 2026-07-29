## Edge-Case Failure Guards and Error Recovery Procedures for Stripe Integration

1.  **API Key Validation:**
    *   **Failure:** `AuthenticationError` (e.g., invalid API key, missing `STRIPE_SECRET_KEY`).
    *   **Guard:** Prioritize checking for `STRIPE_SECRET_KEY` at application startup. Implement explicit checks before making any API calls.
    *   **Recovery:** Log a critical error, alert operations, and return a `500 Internal Server Error` to the client. Do not proceed with payment.

2.  **Network or API Downtime:**
    *   **Failure:** `ApiConnectionError`, `RateLimitError`.
    *   **Guard:** Implement exponential backoff with jitter for retries on transient network errors or rate limit exceeding. Use `Idempotency-Key` for all retriable write operations.
    *   **Recovery:** For persistent errors, fail the request, log details, and inform the user of a temporary issue, suggesting they try again later.

3.  **Payment Processing Failures (Card Declines, Insufficient Funds):**
    *   **Failure:** `CardError`, `PaymentIntentUnexpectedState`.
    *   **Guard:** Inspect the `code` and `decline_code` from the Stripe error object.
    *   **Recovery:** Provide specific, user-friendly feedback (e.g., "Your card was declined," "Insufficient funds"). Do not retry the same card automatically without user intervention or a different payment method.

4.  **Webhook Signature Mismatch:**
    *   **Failure:** `SignatureVerificationError` from `stripe.webhooks.constructEvent`.
    *   **Guard:** Always verify the `stripe-signature` header against the raw request body and `WEBHOOK_SECRET`.
    *   **Recovery:** Immediately reject the webhook event with a `400 Bad Request`. Log the incident as a potential security breach or misconfiguration. Never process unverified webhook events.

5.  **Invalid Input Data:**
    *   **Failure:** `InvalidRequestError` (e.g., invalid amount, currency, or customer email format).
    *   **Guard:** Implement strong input validation on all data sent to Stripe (e.g., positive integer for amount, valid email format).
    *   **Recovery:** Return a `400 Bad Request` to the client with specific details about the invalid input.

6.  **Concurrency and Idempotency:**
    *   **Failure:** Duplicate charges or operations due to multiple requests for the same action.
    *   **Guard:** Consistently use `Idempotency-Key` for all non-GET requests where retries or concurrent calls could lead to unwanted duplicate actions (e.g., `PaymentIntent` creation, `Charge` creation).
    *   **Recovery:** Stripe's API will automatically handle idempotency. Ensure your system correctly stores and reuses these keys on retries.