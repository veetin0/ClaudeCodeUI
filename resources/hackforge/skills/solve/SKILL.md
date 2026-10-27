---
name: solve
description: Solves an algorithmic or well-specified coding problem rigorously — restate constraints, write tests from the examples, brute force, optimised solution, stress test against the brute force. Use for competitive programming, coding-challenge tasks, take-home tests and puzzle rounds in hackathons.
argument-hint: "[problem file, URL or text] [--lang py|cpp|ts|...]"
---

# HackForge solve — $ARGUMENTS

1. **Restate.** Input format, output format, every constraint with its bound (n ≤ …, time limit, memory), edge cases the statement implies (empty, n = 1, max size, duplicates, negatives, overflow). From the bounds, write the required complexity (e.g. n = 2·10⁵ → O(n log n)).
2. **Tests from the statement.** Put every sample into `tests/` exactly as given. Add hand-made edge cases with expected answers you have reasoned out.
3. **Brute force.** The obviously-correct slow solution. It must pass every sample.
4. **Real solution.** Explain the idea and why it is correct in a few lines (invariant, exchange argument, DP state and transition), and its complexity. Then implement it in the requested language (default: Python, or C++ when the limits are tight).
5. **Stress test.** Use `bash "${CLAUDE_PLUGIN_ROOT}/scripts/hf-run.sh" py "${CLAUDE_PLUGIN_ROOT}/scripts/stress.py" --gen … --fast … --brute …`: random small inputs, compare fast vs brute until 1 000+ agree, minimise any counterexample and fix. Then time it on a maximum-size input against the limit.
6. **Deliver** the final solution file, how to run it, the complexity, and the test results. Never call it done on samples alone.

**Reversing tasks** (a binary, APK, firmware image, packet capture or WASM module to analyse: CTF-style rounds, interoperability, "what does this do"):
- **Tools:** with REA (`mcp__rea__*`), start static: `open_binary` then `binary_overview`, `analyze_function` and the call and string searches; `inspect_android_package`; `inspect_firmware_regions`; `inspect_packet_capture`; `inspect_wasm_artifact`. Without it, use `strings`, `file`, `objdump` and `xxd`.
- **Evidence:** record each finding with REA's evidence and unknowns in `notes/reversing.md`.
- **Running the target:** only when static analysis can't answer, and only after asking. It runs foreign code with your permissions.
- **Done:** the answer (a key, a flag, a protocol, an algorithm) needs a check that runs: a script that verifies it against the artifact or replays the protocol. Never deliver a reading of the code alone.

Be wary of: integer overflow, recursion depth, 0/1 indexing, reading input fast enough, floating-point comparisons, and output formatting (trailing spaces, newline, case).
