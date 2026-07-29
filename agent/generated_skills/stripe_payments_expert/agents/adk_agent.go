package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"

	adk "google.golang.org/adk/v2"
	"github.com/stripe/stripe-go/v72"
	"github.com/stripe/stripe-go/v72/checkout/session"
	"github.com/stripe/stripe-go/v72/customer"
	"github.com/stripe/stripe-go/v72/paymentintent"
	"github.com/stripe/stripe-go/v72/webhook"
)

// Agent implements the ADK agent interface.
type StripePaymentAgent struct{}

func (a *StripePaymentAgent) Act(ctx context.Context, request *adk.AgentRequest) (*adk.AgentResponse, error) {
	// Initialize Stripe with secret key from environment
	stripe.Key = os.Getenv("STRIPE_SECRET_KEY")
	if stripe.Key == "" {
		return nil, fmt.Errorf("STRIPE_SECRET_KEY environment variable not set")
	}

	toolName := request.Tool.Name
	args := request.Tool.Args

	switch toolName {
	case "create_stripe_customer":
		return a.createCustomer(ctx, args)
	case "create_stripe_payment_intent":
		return a.createPaymentIntent(ctx, args)
	case "confirm_stripe_payment_intent":
		return a.confirmPaymentIntent(ctx, args)
	case "create_stripe_checkout_session":
		return a.createCheckoutSession(ctx, args)
	case "handle_stripe_webhook":	
		return a.handleWebhook(ctx, args)
	default:
		return nil, fmt.Errorf("unknown tool: %s", toolName)
	}
}

func (a *StripePaymentAgent) createCustomer(ctx context.Context, args map[string]string) (*adk.AgentResponse, error) {
	email := args["email"]
	name := args["name"]

	params := &stripe.CustomerParams{
		Email: stripe.String(email),
		Name:  stripe.String(name),
	}

	c, err := customer.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create customer: %w", err)
	}

	respBytes, _ := json.Marshal(c)
	return &adk.AgentResponse{Output: string(respBytes)}, nil
}

func (a *StripePaymentAgent) createPaymentIntent(ctx context.Context, args map[string]string) (*adk.AgentResponse, error) {
	amountStr := args["amount"]
	currency := args["currency"]
	description := args["description"]

	amount, err := parseAmount(amountStr)
	if err != nil {
		return nil, fmt.Errorf("invalid amount: %w", err)
	}

	params := &stripe.PaymentIntentParams{
		Amount:             stripe.Int64(amount),
		Currency:           stripe.String(currency),
		Description:        stripe.String(description),
		PaymentMethodTypes: stripe.StringSlice([]string{"card"}),
	}

	pi, err := paymentintent.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create payment intent: %w", err)
	}

	respBytes, _ := json.Marshal(pi)
	return &adk.AgentResponse{Output: string(respBytes)}, nil
}

func (a *StripePaymentAgent) confirmPaymentIntent(ctx context.Context, args map[string]string) (*adk.AgentResponse, error) {
	piID := args["payment_intent_id"]
	pmID := args["payment_method_id"]

	params := &stripe.PaymentIntentConfirmParams{
		PaymentMethod: stripe.String(pmID),
	}

	pi, err := paymentintent.Confirm(piID, params)
	if err != nil {
		return nil, fmt.Errorf("failed to confirm payment intent: %w", err)
	}

	respBytes, _ := json.Marshal(pi)
	return &adk.AgentResponse{Output: string(respBytes)}, nil
}

func (a *StripePaymentAgent) createCheckoutSession(ctx context.Context, args map[string]string) (*adk.AgentResponse, error) {
	productName := args["product_name"]
	unitAmountStr := args["unit_amount"]
	currency := args["currency"]
	quantityStr := args["quantity"]
	successURL := args["success_url"]
	cancelURL := args["cancel_url"]

	unitAmount, err := parseAmount(unitAmountStr)
	if err != nil {
		return nil, fmt.Errorf("invalid unit_amount: %w", err)
	}
	quantity, err := parseInt(quantityStr)
	if err != nil {
		return nil, fmt.Errorf("invalid quantity: %w", err)
	}

	params := &stripe.CheckoutSessionParams{
		Mode:       stripe.String(string(stripe.CheckoutSessionModePayment)),
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Quantity: stripe.Int64(quantity),
				PriceData: &stripe.CheckoutSessionLineItemPriceDataParams{
					Currency:   stripe.String(currency),
					UnitAmount: stripe.Int64(unitAmount),
					ProductData: &stripe.CheckoutSessionLineItemPriceDataProductDataParams{
						Name: stripe.String(productName),
					},
				},
			},
		},
	}

	sess, err := session.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create checkout session: %w", err)
	}

	return &adk.AgentResponse{Output: sess.URL}, nil
}

func (a *StripePaymentAgent) handleWebhook(ctx context.Context, args map[string]string) (*adk.AgentResponse, error) {
	// In a real application, this would receive the raw request body and signature from the HTTP request.
	// For simplicity in this agent context, we assume they are passed as strings.
	payload := args["payload"]
	signature := args["signature"]
	webhookSecret := os.Getenv("STRIPE_WEBHOOK_SECRET")

	if webhookSecret == "" {
		return nil, fmt.Errorf("STRIPE_WEBHOOK_SECRET environment variable not set")
	}

	event, err := webhook.ConstructEvent([]byte(payload), signature, webhookSecret)
	if err != nil {
		return nil, fmt.Errorf("failed to verify webhook signature: %w", err)
	}

	respBytes, _ := json.Marshal(event)
	return &adk.AgentResponse{Output: string(respBytes)}, nil
}

func parseAmount(s string) (int64, error) {
	var i int64
	_, err := fmt.Sscanf(s, "%d", &i)
	return i, err
}

func parseInt(s string) (int64, error) {
	var i int64
	_, err := fmt.Sscanf(s, "%d", &i)
	return i, err
}

func main() {
	adk.Run("stripe-payment-agent", &StripePaymentAgent{})
}
