#!/usr/bin/env python3
"""Stress-test a fast solution against a brute force.

Usage:
  stress.py --gen "python3 gen.py" --fast "python3 sol.py" --brute "python3 brute.py" [-n 1000] [--timeout 5]

The generator receives a seed as its first argument and prints one test input.
Stops at the first mismatch and saves the input to stress_fail.txt.
"""
import argparse, os, shlex, subprocess, sys

def run(cmd, inp, timeout):
    r = subprocess.run(shlex.split(cmd, posix=(os.name != "nt")), input=inp, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd!r} exited {r.returncode}:\n{r.stderr}")
    return r.stdout

def norm(s):
    return [line.rstrip() for line in s.strip().splitlines()]

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gen", required=True)
    p.add_argument("--fast", required=True)
    p.add_argument("--brute", required=True)
    p.add_argument("-n", type=int, default=1000)
    p.add_argument("--timeout", type=float, default=5.0)
    a = p.parse_args()
    for seed in range(1, a.n + 1):
        inp = run(f"{a.gen} {seed}", "", a.timeout)
        try:
            fast = run(a.fast, inp, a.timeout)
        except subprocess.TimeoutExpired:
            fast = "<TIMEOUT>"
        brute = run(a.brute, inp, a.timeout)
        if norm(fast) != norm(brute):
            open("stress_fail.txt", "w").write(inp)
            print(f"MISMATCH on seed {seed} (saved to stress_fail.txt)\n--- input ---\n{inp}\n--- fast ---\n{fast}\n--- brute ---\n{brute}")
            sys.exit(1)
        if seed % 100 == 0:
            print(f"{seed} tests OK", flush=True)
    print(f"All {a.n} tests agree.")

if __name__ == "__main__":
    main()
