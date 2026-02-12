"""Direct-mode tool loop runtime for memory tools."""
from __future__ import annotations

import json
import logging
from typing import Any

from config import settings

logger = logging.getLogger(__name__)

MAX_TOOL_OUTPUT_CHARS = 4000

MEMORY_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "memory_search",
            "description": (
                "Semantically search the agent's memory files (MEMORY.md + memory/*.md). "
                "Use before answering questions about prior work, decisions, dates, people, "
                "preferences, or todos."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query",
                    },
                    "maxResults": {
                        "type": "integer",
                        "description": "Maximum results to return (default 5)",
                    },
                    "minScore": {
                        "type": "number",
                        "description": "Minimum relevance score 0-1 (default 0.3)",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memory_read",
            "description": "Read content from a memory file. Use after memory_search to get full context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path (MEMORY.md or memory/*.md)",
                    },
                    "from": {
                        "type": "integer",
                        "description": "Start line (1-indexed, optional)",
                    },
                    "lines": {
                        "type": "integer",
                        "description": "Number of lines to read (optional)",
                    },
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memory_write",
            "description": "Write or append to a memory file. Use for storing important information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path (MEMORY.md or memory/*.md)",
                    },
                    "content": {
                        "type": "string",
                        "description": "Content to write",
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["overwrite", "append"],
                        "description": "Write mode (default: append)",
                    },
                },
                "required": ["path", "content"],
            },
        },
    },
]


async def _execute_tool(
    name: str,
    arguments_json: str,
    workspace: str | None,
    claw_agent_id: str,
) -> str:
    """Execute a single tool call and return the result string."""
    from services import memory_bridge

    try:
        args = json.loads(arguments_json) if arguments_json else {}
    except json.JSONDecodeError:
        return f"Error: invalid JSON arguments: {arguments_json[:200]}"

    try:
        if name == "memory_search":
            results = await memory_bridge.search(
                claw_agent_id=claw_agent_id,
                query=args.get("query", ""),
                limit=int(args.get("maxResults", 5)),
                min_score=float(args.get("minScore", 0.3)),
            )
            if not results:
                return "No results found."
            return json.dumps(results, indent=2)

        elif name == "memory_read":
            return memory_bridge.read(
                workspace=workspace,
                path=args.get("path", ""),
                start_line=args.get("from"),
                num_lines=args.get("lines"),
            )

        elif name == "memory_write":
            return memory_bridge.write(
                workspace=workspace,
                path=args.get("path", ""),
                content=args.get("content", ""),
                mode=args.get("mode", "append"),
            )

        else:
            return f"Error: unknown tool '{name}'"

    except Exception:
        logger.exception("[ToolRuntime] Tool execution failed: %s", name)
        return f"Error: tool '{name}' failed unexpectedly"


async def run_tool_loop(
    *,
    client: Any,
    model: str,
    messages: list[dict],
    workspace: str | None,
    claw_agent_id: str,
    user_tag: str | None = None,
    timeout_s: float = 60.0,
    max_steps: int | None = None,
) -> dict[str, Any]:
    """Run the direct-mode tool loop.

    Calls client.chat_completion() with memory tools. If the LLM returns
    tool_calls, executes them and re-calls. Bounded by max_steps.

    Returns the same dict shape as DirectLLMClient.chat_completion().
    """
    if max_steps is None:
        max_steps = settings.direct_tool_max_steps

    # Work with a mutable copy of messages
    loop_messages = list(messages)
    tool_calls_total = 0

    for step in range(max_steps):
        result = await client.chat_completion(
            model=model,
            messages=loop_messages,
            user_tag=user_tag,
            timeout_s=timeout_s,
            tools=MEMORY_TOOLS,
        )

        choices = result.get("choices", [])
        if not choices:
            return result

        assistant_msg = choices[0].get("message", {})
        tool_calls = assistant_msg.get("tool_calls")

        if not tool_calls:
            # No tool calls — this is the final content response
            return result

        # Append the assistant message (with tool_calls) to the loop
        loop_messages.append(assistant_msg)

        # Execute each tool call
        for tc in tool_calls:
            tool_calls_total += 1
            fn = tc.get("function", {})
            tool_name = fn.get("name", "")
            tool_args = fn.get("arguments", "{}")
            tool_call_id = tc.get("id", "")

            output = await _execute_tool(
                name=tool_name,
                arguments_json=tool_args,
                workspace=workspace,
                claw_agent_id=claw_agent_id,
            )

            # Truncate large outputs
            if len(output) > MAX_TOOL_OUTPUT_CHARS:
                output = output[:MAX_TOOL_OUTPUT_CHARS] + "\n... (truncated)"

            loop_messages.append({
                "role": "tool",
                "tool_call_id": tool_call_id,
                "content": output,
            })

        logger.info(
            "[ToolRuntime] Step %d/%d: executed %d tool call(s)",
            step + 1,
            max_steps,
            len(tool_calls),
        )

    # Exceeded max steps — nudge the LLM to respond without tools
    logger.warning(
        "[ToolRuntime] Max steps (%d) reached with %d total tool calls, forcing final response",
        max_steps,
        tool_calls_total,
    )
    loop_messages.append({
        "role": "system",
        "content": "You have used the maximum number of tool calls. Please respond to the user now using the information you have gathered.",
    })

    result = await client.chat_completion(
        model=model,
        messages=loop_messages,
        user_tag=user_tag,
        timeout_s=timeout_s,
    )
    return result
