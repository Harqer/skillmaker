import os
import json
from typing import Dict, Any

import stripe
from google.adk.agents import LlmAgent, AgentRequest, AgentResponse
from google.adk.tools import Tool

class StripePaymentAgent(LlmAgent):
    def __init__(self):
        super().__init__()
        stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
        if not stripe.api_key:
            raise ValueError("STRIPE_SECRET_KEY environment variable not set.")

        self.add_tool(Tool(
            name="create_stripe_customer",
            description="Creates a new customer in Stripe.",
            parameters={
                "type": "object",
                "properties": {
                    "email": {"type": "string", "description": "Customer's email address."},
                    "name": {"type": "string", "description": "Customer's full name."}
                },
                "required": ["email"]
            }
        ))
        self.add_tool(Tool(
            name="create_stripe_payment_intent",
            description="Creates a Stripe Payment Intent.",
            parameters={
                "type": "object",
                "properties": {
                    "amount": {"type": "integer", "description": "Amount in cents (e.g., 2000 for $20.00)."},
                    "currency": {"type": "string", "description": "Three-letter ISO currency code (e.g., 'usd')."},
                    "description": {"type": "string", "description": "Description for the payment intent."}
                },
                "required": ["amount", "currency"]
            }
        ))
        self.add_tool(Tool(
            name="confirm_stripe_payment_intent",
            description="Confirms an existing Stripe Payment Intent.",
            parameters={
                "type": "object",
                "properties": {
                    "payment_intent_id": {"type": "string", "description": "ID of the Payment Intent to confirm."},
                    "payment_method_id": {"type": "string", "description": "ID of the Payment Method to use."}
                },
                "required": ["payment_intent_id", "payment_method_id"]
            }
        ))
        self.add_tool(Tool(
            name="create_stripe_checkout_session",
            description="Creates a Stripe Checkout Session for a hosted payment page.",
            parameters={
                "type": "object",
                "properties": {
                    "product_name": {"type": "string", "description": "Name of the product/service."},
                    "unit_amount": {"type": "integer", "description": "Price per unit in cents."},
                    "currency": {"type": "string", "description": "Three-letter ISO currency code (e.g., 'usd')."},
                    "quantity": {"type": "integer", "description": "Number of units."},
                    "success_url": {"type": "string", "description": "URL to redirect to after successful payment."},
                    "cancel_url": {"type": "string", "description": "URL to redirect to if payment is cancelled."}
                },
                "required": ["product_name", "unit_amount", "currency", "quantity", "success_url", "cancel_url"]
            }
        ))
        self.add_tool(Tool(
            name="handle_stripe_webhook",
            description="Verifies and processes a Stripe webhook event.",
            parameters={
                "type": "object",
                "properties": {
                    "payload": {"type": "string", "description": "The raw request body of the webhook."},
                    "signature": {"type": "string", "description": "The value of the 'Stripe-Signature' header."}
                },
                "required": ["payload", "signature"]
            }
        ))

    async def call_tool(self, tool_name: str, args: Dict[str, Any]) -> AgentResponse:
        try:
            if tool_name == "create_stripe_customer":
                customer = stripe.Customer.create(email=args["email"], name=args.get("name"))
                return AgentResponse(output=json.dumps(customer.to_dict()))

            elif tool_name == "create_stripe_payment_intent":
                payment_intent = stripe.PaymentIntent.create(
                    amount=args["amount"],
                    currency=args["currency"],
                    description=args.get("description"),
                    payment_method_types=["card"]
                )
                return AgentResponse(output=json.dumps(payment_intent.to_dict()))

            elif tool_name == "confirm_stripe_payment_intent":
                payment_intent = stripe.PaymentIntent.confirm(
                    args["payment_intent_id"],
                    payment_method=args["payment_method_id"]
                )
                return AgentResponse(output=json.dumps(payment_intent.to_dict()))

            elif tool_name == "create_stripe_checkout_session":
                checkout_session = stripe.checkout.Session.create(
                    line_items=[
                        {
                            "price_data": {
                                "currency": args["currency"],
                                "product_data": {"name": args["product_name"]},
                                "unit_amount": args["unit_amount"],
                            },
                            "quantity": args["quantity"],
                        }
                    ],
                    mode="payment",
                    success_url=args["success_url"],
                    cancel_url=args["cancel_url"],
                )
                return AgentResponse(output=checkout_session.url)

            elif tool_name == "handle_stripe_webhook":
                webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
                if not webhook_secret:
                    raise ValueError("STRIPE_WEBHOOK_SECRET environment variable not set.")
                
                event = stripe.Webhook.construct_event(
                    payload=args["payload"],
                    sig_header=args["signature"],
                    secret=webhook_secret
                )
                return AgentResponse(output=json.dumps(event.to_dict()))

            else:
                return AgentResponse(output=f"Unknown tool: {tool_name}")

        except stripe.error.StripeError as e:
            # Handle Stripe API errors specifically
            return AgentResponse(output=f"Stripe API Error: {e}")
        except Exception as e:
            # Handle other unexpected errors
            return AgentResponse(output=f"Error: {e}")

if __name__ == "__main__":
    # Example of how to run the agent
    # In a real ADK deployment, the framework handles running the agent
    print("Starting Stripe Payment Agent...")
    # For local testing, ensure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set
    try:
        agent = StripePaymentAgent()
        print("Stripe Payment Agent initialized successfully.")
        # You can test individual tool calls here if needed
        # E.g., agent.call_tool("create_stripe_customer", {"email": "test@example.com", "name": "Test User"})
    except ValueError as e:
        print(f"Agent initialization failed: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during agent initialization: {e}")
