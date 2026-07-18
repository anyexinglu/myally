#!/usr/bin/env python3
"""
我在 A/B 对比测试 — 本地开关控制

用法：
  # 对照组：裸模型（无记忆无 Agent）
  python3 ab_test.py scenarios/health-memory.json --mode raw

  # 实验组：完整产品（Agent + 记忆 + 知识）
  python3 ab_test.py scenarios/health-memory.json --mode product

  # 两边同时跑，对比输出（默认）
  python3 ab_test.py scenarios/health-memory.json --compare

  # 只看汇总对比，不显示详情
  python3 ab_test.py scenarios/health-memory.json --compare --summary
"""

import json
import subprocess
import sys
import os
from pathlib import Path

HARNESS_DIR = Path(__file__).parent
BRIDGE_JS = HARNESS_DIR / "bridge.js"


def call_harness(mode: str, payload: dict, prev_result: dict = None) -> dict:
    """调用 Node.js harness bridge"""
    cmd = ["node", str(BRIDGE_JS), mode, json.dumps(payload)]
    if prev_result:
        cmd.append(json.dumps(prev_result))
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return {"error": result.stderr.strip() or result.stdout.strip()}
    return json.loads(result.stdout)


def load_scenario(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_single(scenario: dict, mode: str, verbose: bool = False):
    """单模式跑完全部轮次"""
    name = scenario.get("name", "未命名")
    steps = scenario.get("steps", [])
    results = []
    state = {}

    for step in steps:
        turn = step["turn"]
        text = step["user"]
        payload = {"text": text, "turn": turn}
        result = call_harness(mode, payload, state)
        if "convId" in result:
            state["convId"] = result["convId"]
        results.append({
            "turn": turn,
            "user": text,
            "reply": result.get("reply", f"[错误] {result.get('error', '')}"),
            "memories_used": result.get("usedMemories", []),
            "memories_created": result.get("createdMemories", []),
            "memory_status": result.get("memoryStatus", ""),
        })

    return results


def print_side_by_side(results_a: list, results_b: list, scenario: dict, verbose: bool):
    """A/B 并排对比输出"""
    name = scenario.get("name", "未命名场景")
    desc = scenario.get("description", "")
    steps = scenario.get("steps", [])

    W = 38
    print()
    print("=" * 80)
    print(f"  A/B 对比: {name}")
    if desc:
        print(f"  {desc}")
    print("=" * 80)
    print()

    for i, step in enumerate(steps):
        turn = step["turn"]
        note = step.get("note", "")
        a = results_a[i] if i < len(results_a) else {}
        b = results_b[i] if i < len(results_b) else {}

        print(f"── 第{turn}轮 ──")
        print(f"用户: {step['user']}")
        if note:
            print(f"  ({note})")
        print()

        r_a = a.get("reply", "")
        r_b = b.get("reply", "")

        disp_a = r_a[:200] + ("..." if len(r_a) > 200 else "")
        disp_b = r_b[:200] + ("..." if len(r_b) > 200 else "")

        print(f"  {'A: 裸模型':^{W}}  {'B: 我在（产品）':^{W}}")
        print(f"  {'─' * W}  {'─' * W}")
        lines_a = disp_a.split("\n")
        lines_b = disp_b.split("\n")
        max_l = max(len(lines_a), len(lines_b))
        for li in range(max_l):
            la = lines_a[li] if li < len(lines_a) else ""
            lb = lines_b[li] if li < len(lines_b) else ""
            print(f"  {la:<{W}}  {lb:<{W}}")
        print(f"  {'─' * W}  {'─' * W}")

        # B的记忆信息
        mu = b.get("memories_used", [])
        mc = b.get("memories_created", [])
        if mu:
            for m in mu:
                print(f"  📌 B用了记忆: [{m['type']}] {m['value']}")
        if mc:
            for m in mc:
                print(f"  📝 B新建记忆: [{m['type']}] {m['value']}")
        if b.get("memory_status"):
            print(f"  💾 B记忆状态: {b['memory_status']}")
        print(f"  💾 A: 裸模型（无记忆）")
        print()

    # 汇总对比
    print("─" * 40)
    print("  对比总结")
    print("─" * 40)
    print()
    print("  [1] 个性化：B是否使用了用户历史信息？A没有？")
    print("  [2] 连贯性：B在多轮后是否持续记住早期信息？")
    print("  [3] 知识域：回答是否有权威依据？")
    print('  [4] 综合体感：哪个更像在跟一个"越来越懂你"的人聊天？')
    print()


def print_single(results: list, scenario: dict, mode_label: str, verbose: bool):
    """单模式输出"""
    name = scenario.get("name", "未命名")
    steps = scenario.get("steps", [])

    print()
    print("=" * 60)
    print(f"  模式: {mode_label}")
    print(f"  场景: {name}")
    print("=" * 60)
    print()

    for i, s in enumerate(steps):
        r = results[i] if i < len(results) else {}
        print(f"── 第{s['turn']}轮: {s['user']} ──")
        print()
        print(r.get("reply", "[无回复]"))
        print()

        mc = r.get("memories_created", [])
        if mc:
            for m in mc:
                print(f"  📝 新建: [{m['type']}] {m['value']}")
        print()


def main():
    if len(sys.argv) < 2:
        print("用法:")
        print("  python3 ab_test.py <场景.json>              # 对比模式（默认）")
        print("  python3 ab_test.py <场景.json> --mode raw     # 只跑裸模型")
        print("  python3 ab_test.py <场景.json> --mode product # 只跑产品")
        print("  python3 ab_test.py <场景.json> --compare      # 明确对比模式")
        print("  python3 ab_test.py <场景.json> --compare --summary  # 只汇总")
        sys.exit(1)

    scenario_path = sys.argv[1]
    if not os.path.exists(scenario_path):
        p2 = str(HARNESS_DIR / "scenarios" / scenario_path)
        if os.path.exists(p2):
            scenario_path = p2
        else:
            print(f"找不到: {scenario_path}")
            sys.exit(1)

    verbose = "--verbose" in sys.argv
    summary_only = "--summary" in sys.argv
    mode = None
    do_compare = False

    for a in sys.argv[2:]:
        if a.startswith("--mode="):
            mode = a.split("=", 1)[1]
        elif a == "--mode" and len(sys.argv) > sys.argv.index(a) + 1:
            mode = sys.argv[sys.argv.index(a) + 1]
        elif a == "--compare":
            do_compare = True

    scenario = load_scenario(scenario_path)

    if mode == "raw":
        results = run_single(scenario, "raw", verbose)
        print_single(results, scenario, "裸模型（raw）", verbose)
    elif mode == "product":
        results = run_single(scenario, "product", verbose)
        print_single(results, scenario, "我在产品（product）", verbose)
    else:
        # 默认对比模式
        do_compare = True

    if do_compare or mode is None:
        results_a = run_single(scenario, "raw", verbose)
        results_b = run_single(scenario, "product", verbose)
        if summary_only:
            # 简短对比
            print()
            print("=" * 60)
            print("  A/B 对比摘要")
            print("=" * 60)
            for i, s in enumerate(scenario.get("steps", [])):
                a = results_a[i] if i < len(results_a) else {}
                b = results_b[i] if i < len(results_b) else {}
                r_a = a.get("reply", "")
                r_b = b.get("reply", "")
                len_a = len(r_a)
                len_b = len(r_b)
                mu = len(b.get("memories_used", []))
                mc = len(b.get("memories_created", []))
                print(f"  第{s['turn']}轮: A({len_a}c)")
                if mu: print(f"       B: {mu}条记忆被使用, {mc}条新建")
            print()
        else:
            print_side_by_side(results_a, results_b, scenario, verbose)


if __name__ == "__main__":
    main()
