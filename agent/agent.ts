import { defineAgent } from "eve";

export const zapAgent = defineAgent({
  model: "google/gemini-2.0-flash",
  description:
    "An agent that generates structured skills/agents for other AI platforms.",
});
