"""
evaluate_skill.py — LangSmith offline evaluation for Skill Maker.

Runs two experiments against a short-lived dataset:
  baseline — plain Gemini response with no skill guidance
  guided   — Gemini response instructed by the generated SKILL.md

Uses the 2026 LangSmith SDK pattern:
  • client.evaluate(target, data=dataset_name, evaluators=[...])
  • Evaluator signature: (inputs, outputs, reference_outputs) — plain dicts
  • openevals for the LLM-as-judge scaffolding (Gemini model via create_llm_as_judge)

References:
  https://docs.langchain.com/langsmith/evaluation-quickstart
  https://docs.langchain.com/langsmith/evaluate-llm-application
"""

import json
import sys
import time
import uuid

import config  # noqa — runs Infisical SDK bootstrap, sets LANGCHAIN_TRACING_V2 & API keys
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langsmith import Client

# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_llm() -> ChatGoogleGenerativeAI:
    """Always temperature=0 for deterministic evaluation runs."""
    return ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0)


def _token_count(response) -> int:
    if hasattr(response, "response_metadata"):
        return response.response_metadata.get("token_usage", {}).get("total_tokens", 0)
    return 0


# ── Main entry point ──────────────────────────────────────────────────────────


def evaluate_skill(prompt: str, skill_content: str, assertions: list) -> dict:
    """
    Run an evaluation comparing baseline vs skill-guided output.
    Uses LangSmith offline evaluation when available, falling back to direct
    LLM-as-judge evaluation if LangSmith is unconfigured or unreachable.

    Args:
        prompt:        The user prompt to evaluate.
        skill_content: The SKILL.md content to inject into the guided target.
        assertions:    A list of strings that the guided output must satisfy.

    Returns:
        {
          "score": int,
          "feedback": str,
          "improvements": list,
          "baseline":  {"output": str, "total_tokens": int, "latency": float, "grades": list},
          "withSkill": {"output": str, "total_tokens": int, "latency": float, "grades": list},
        }
    """
    def baseline_app(inputs: dict) -> dict:
        """Vanilla LLM — no skill guidance."""
        llm = _make_llm()
        chain = (
            ChatPromptTemplate.from_messages(
                [
                    ("system", "You are a helpful AI assistant."),
                    ("user", "{prompt}"),
                ]
            )
            | llm
        )
        response = chain.invoke({"prompt": inputs["prompt"]})
        return {"output": response.content, "tokens": _token_count(response)}

    def guided_app(inputs: dict) -> dict:
        """Skill-guided LLM — instructed by the SKILL.md content."""
        llm = _make_llm()
        chain = (
            ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "You are an expert agent. Follow these strict skill guidelines:\n\n{skill_content}",
                    ),
                    ("user", "{prompt}"),
                ]
            )
            | llm
        )
        response = chain.invoke(
            {
                "prompt": inputs["prompt"],
                "skill_content": skill_content,
            }
        )
        return {"output": response.content, "tokens": _token_count(response)}

    def llm_judge(inputs: dict, outputs: dict, reference_outputs: dict) -> dict:
        """Grade the LLM output against each assertion."""
        llm = _make_llm()
        output_text = outputs.get("output", "")
        assertions_list = reference_outputs.get("assertions", [])

        grader_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "You are an objective expert agent evaluator acting as a skill-testing grader.",
                ),
                (
                    "user",
                    (
                        "Output to grade:\n{output}\n\nAssertions:\n{assertions_text}\n\n"
                        "For each assertion, determine if the Output passed it and provide evidence. "
                        "Your response MUST be a JSON array of objects with keys "
                        "'assertion' (string), 'passed' (boolean), and 'evidence' (string) "
                        "corresponding to each assertion in order."
                    ),
                ),
            ]
        )

        assertions_text = "\n".join(
            f"{i + 1}. {a}" for i, a in enumerate(assertions_list)
        )
        response = (grader_prompt | llm).invoke(
            {
                "output": output_text,
                "assertions_text": assertions_text,
            }
        )

        try:
            text = response.content.replace("```json", "").replace("```", "").strip()
            result = json.loads(text)
        except Exception:
            result = [
                {
                    "assertion": a,
                    "passed": False,
                    "evidence": "Failed to parse grader JSON",
                }
                for a in assertions_list
            ]

        all_passed = all(r.get("passed", False) for r in result)
        return {
            "key": "llm_judge",
            "score": 1.0 if all_passed else 0.0,
            "comment": json.dumps(result),
        }

    final_baseline = None
    final_guided = None

    # Try LangSmith Evaluation first
    try:
        ls_client = Client()
        dataset_name = f"skill_eval_{uuid.uuid4().hex[:8]}"

        dataset = ls_client.create_dataset(
            dataset_name, description=f"Skill Maker evaluation dataset — {prompt[:60]}"
        )
        ls_client.create_examples(
            inputs=[{"prompt": prompt}],
            outputs=[{"assertions": assertions}],
            dataset_id=dataset.id,
        )

        baseline_results = ls_client.evaluate(
            baseline_app,
            data=dataset_name,
            evaluators=[llm_judge],
            experiment_prefix="baseline",
            max_concurrency=1,
        )

        guided_results = ls_client.evaluate(
            guided_app,
            data=dataset_name,
            evaluators=[llm_judge],
            experiment_prefix="guided",
            max_concurrency=1,
        )

        def extract_metrics(experiment_results) -> dict:
            rows = list(experiment_results)
            if not rows:
                return {"output": "", "total_tokens": 0, "latency": 0.0, "grades": []}

            row = rows[0]
            run_obj = row.get("run")
            outputs = run_obj.outputs if run_obj else {}
            output_text = outputs.get("output", "")
            tokens = outputs.get("tokens", 0)

            latency = 0.0
            if run_obj and run_obj.end_time and run_obj.start_time:
                latency = (run_obj.end_time - run_obj.start_time).total_seconds()

            grades = []
            eval_results = row.get("evaluation_results", {})
            for e in eval_results.get("results", []):
                if getattr(e, "key", "") == "llm_judge" and getattr(e, "comment", ""):
                    try:
                        grades = json.loads(e.comment)
                    except Exception:
                        grades = []
                    break

            return {
                "output": output_text,
                "total_tokens": tokens,
                "latency": latency,
                "grades": grades,
            }

        final_baseline = extract_metrics(baseline_results)
        final_guided = extract_metrics(guided_results)

        all_guided_passed = all(
            g.get("passed", False) for g in final_guided.get("grades", [])
        )
        if all_guided_passed:
            try:
                ls_client.delete_dataset(dataset_id=dataset.id)
            except Exception:
                pass

    except Exception as ls_err:
        print(f"[evaluate_skill] LangSmith evaluation fallback triggered: {ls_err}")
        # Direct fallback execution
        t0 = time.time()
        base_res = baseline_app({"prompt": prompt})
        t1 = time.time()
        guided_res = guided_app({"prompt": prompt})
        t2 = time.time()

        base_judge = llm_judge({"prompt": prompt}, base_res, {"assertions": assertions})
        guided_judge = llm_judge({"prompt": prompt}, guided_res, {"assertions": assertions})

        try:
            base_grades = json.loads(base_judge.get("comment", "[]"))
        except Exception:
            base_grades = []

        try:
            guided_grades = json.loads(guided_judge.get("comment", "[]"))
        except Exception:
            guided_grades = []

        final_baseline = {
            "output": base_res.get("output", ""),
            "total_tokens": base_res.get("tokens", 0),
            "latency": round(t1 - t0, 3),
            "grades": base_grades,
        }
        final_guided = {
            "output": guided_res.get("output", ""),
            "total_tokens": guided_res.get("tokens", 0),
            "latency": round(t2 - t1, 3),
            "grades": guided_grades,
        }

    # Calculate unified metrics (score, feedback, improvements)
    grades = final_guided.get("grades", [])
    if grades:
        passed_count = sum(1 for g in grades if g.get("passed", False))
        score = int((passed_count / len(grades)) * 100)
    else:
        score = 0

    feedback = final_guided.get("output", "") or "Evaluation completed successfully."
    improvements = [
        f"{g.get('assertion')}: {g.get('evidence', 'Failed validation')}"
        for g in grades
        if not g.get("passed", False)
    ]

    return {
        "score": score,
        "feedback": feedback,
        "improvements": improvements,
        "baseline": final_baseline,
        "withSkill": final_guided,
    }


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python evaluate_skill.py '<json_input>'")
        print('  json_input: {"prompt": str, "skill_content": str, "assertions": list}')
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])
        results = evaluate_skill(
            input_data["prompt"],
            input_data.get("skill_content", ""),
            input_data.get("assertions", []),
        )
        print(json.dumps(results, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
