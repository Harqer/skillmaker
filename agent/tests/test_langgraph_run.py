"""LangGraph pipeline smoke test — verifies the compiled workflow runs.

Builds a minimal StateGraph with a reducer channel, streams it through an
InMemorySaver checkpointer, and asserts the messages flow end-to-end. This
exercises the same LangGraph primitives the orchestrator pipeline relies on
(nodes, edges, state channels, checkpointer) without hitting Redis or the LLM.
"""

import operator
from typing import Annotated, TypedDict

from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph


class State(TypedDict):
    messages: Annotated[list, operator.add]


def dummy_node(state: State) -> dict:
    return {"messages": [HumanMessage(content="Hello!")]}


def test_langgraph_workflow_streams_and_persists():
    workflow = StateGraph(State)
    workflow.add_node("dummy", dummy_node)
    workflow.add_edge(START, "dummy")
    workflow.add_edge("dummy", END)
    checkpointer = InMemorySaver()
    app = workflow.compile(checkpointer=checkpointer)

    config = {"configurable": {"thread_id": "smoke-123"}}
    events = [event for event in app.stream({"messages": []}, config=config)]

    assert events, "expected at least one streamed event"
    assert "dummy" in events[0]

    final_state = app.get_state(config)
    assert final_state.values["messages"]
    assert final_state.values["messages"][0].content == "Hello!"


def test_langgraph_workflow_preserves_state_across_turns():
    workflow = StateGraph(State)
    workflow.add_node("dummy", dummy_node)
    workflow.add_edge(START, "dummy")
    workflow.add_edge("dummy", END)
    app = workflow.compile(checkpointer=InMemorySaver())

    config = {"configurable": {"thread_id": "smoke-456"}}
    for _ in app.stream({"messages": []}, config=config):
        pass
    for _ in app.stream({"messages": []}, config=config):
        pass

    final_state = app.get_state(config)
    assert len(final_state.values["messages"]) == 2
