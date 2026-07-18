#!/usr/bin/env python3
"""
我在 A/B 测试评估框架 v2
— 直接调用 CloudBase 云函数（走真实 hy3），不走 UI 自动化

对照组 A（raw）：调云函数 mode=raw，无记忆无 Agent，直出 hy3
实验组 B（product）：调云函数 mode=product，完整产品管线

用法：
  python3 ab_test.py scenarios/health-memory.json                 # A/B 对比
  python3 ab_test.py scenarios/health-memory.json --mode=raw      # 只跑 A
  python3 ab_test.py scenarios/health-memory.json --mode=product  # 只跑 B
  python3 ab_test.py scenarios/health-memory.json --summary       # 只看摘要
"""

import json
import subprocess
import sys
import os
import time
from pathlib import Path

HARNESS_DIR = Path(__file__).parent
SCENARIOS_DIR = HARNESS_DIR / "scenarios"

# ======== 云函数调用（通过 wx-server-sdk） ========

def call_cloud_function(action: str, payload: dict, mode: str = "product") -> dict:
    """
    通过 Node.js 桥接调用 CloudBase 云函数。
    bridge.js 支持 mode=raw / mode=product 两种模式。
    """
    cmd = [
        "node", str(HARNESS_DIR / "bridge.js"),
        mode,
        json.dumps({"text": payload.get("text", ""), "turn": payload.get("turn", 1)}),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        return {"error": result.stderr.strip() or result.stdout.strip()}
    return json.loads(result.stdout)


# ======== 场景加载 ========

def load_scenario(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ======== 运行单模式 ========

def run_scenario(scenario: dict, mode: str):
    name = scenario.get("name", "未命名")
    steps = scenario.get("steps", [])
    results = []
    state = {}

    for step in steps:
        turn = step["turn"]
        text = step["user"]
        payload = {"text": text, "turn": turn}

        start = time.time()
        result = call_cloud_function("send", payload, mode)
        elapsed = time.time() - start

        reply = result.get("reply", "")
        if not reply:
            reply = f"[错误] {result.get('error', '未知')}"

        results.append({
            "turn": turn,
            "user": text,
            "reply": reply,
            "reply_length": len(reply),
            "elapsed": round(elapsed, 1),
            "memories_used": result.get("usedMemories", []),
            "memories_created": result.get("createdMemories", []),
            "memory_status": result.get("memoryStatus", ""),
            "mode": mode,
        })

        # 保留 convId 用于多轮
        if result.get("convId"):
            state["convId"] = result["convId"]

    return results


# ======== 输出 ========

MODE_LABEL = {"raw": "A: 裸 hy3（对照组）", "product": "B: 我在产品（实验组）"}

def print_comparison(results_a: list, results_b: list, scenario: dict):
    name = scenario.get("name", "")
    desc = scenario.get("description", "")

    print()
    print("=" * 72)
    print(f"  A/B 对比: {name}")
    if desc:
        print(f"  {desc}")
    print(f"  模型: hy3（CloudBase）")
    print("=" * 72)
    print()

    for i, step in enumerate(scenario.get("steps", [])):
        a = results_a[i] if i < len(results_a) else {}
        b = results_b[i] if i < len(results_b) else {}
        note = step.get("note", "")

        print(f"── 第{step['turn']}轮 ──")
        print(f"用户: {step['user']}")
        if note:
            print(f"  ({note})")
        print()

        r_a = a.get("reply", "")
        r_b = b.get("reply", "")
        t_a = a.get("elapsed", 0)
        t_b = b.get("elapsed", 0)

        disp_a = r_a[:250] + ("..." if len(r_a) > 250 else "")
        disp_b = r_b[:250] + ("..." if len(r_b) > 250 else "")

        w = 35
        print(f"  {'A: 裸 hy3':^{w}}  {'B: 我在产品':^{w}}")
        print(f"  {'─' * w}  {'─' * w}")
        lines_a = disp_a.split("\n")
        lines_b = disp_b.split("\n")
        max_l = max(len(lines_a), len(lines_b))
        for li in range(max_l):
            la = lines_a[li] if li < len(lines_a) else ""
            lb = lines_b[li] if li < len(lines_b) else ""
            print(f"  {la:<{w}}  {lb:<{w}}")
        print(f"  {'─' * w}  {'─' * w}")
        print(f"  ⏱ {t_a}s{' ' * (w - 6)}  ⏱ {t_b}s")

        # B 的记忆信息
        mu = b.get("memories_used", [])
        mc = b.get("memories_created", [])
        if mu:
            for m in mu:
                print(f"  📌 B 用了记忆: [{m['type']}] {m['value']}")
        if mc:
            for m in mc:
                print(f"  📝 B 新建记忆: [{m['type']}] {m['value']}")
        if b.get("memory_status"):
            print(f"  💾 B 记忆状态: {b['memory_status']}")
        print(f"  💾 A: 无记忆（裸 hy3）")
        print()

    # 对比总结
    print("─" * 40)
    print("  对比总结")
    print("─" * 40)
    print()
    print("  1. B 是否使用了用户历史信息（memory > 0）？A 始终无记忆")
    print("  2. B 答案是否越来越个性化，A 是否原地踏步？")
    print("  3. 作为一个真实用户，你更愿意跟谁聊下去？")
    print()


def print_single(results: list, scenario: dict, mode: str):
    label = MODE_LABEL.get(mode, mode)
    name = scenario.get("name", "")
    print()
    print("=" * 60)
    print(f"  {label}")
    print(f"  场景: {name}")
    print("=" * 60)
    print()

    for r in results:
        print(f"── 第{r['turn']}轮 ──")
        print(f"用户: {r['user']}")
        print(f"⏱ {r['elapsed']}s | {r['reply_length']}字")
        print()
        print(r["reply"][:300])
        print()

        mc = r.get("memories_created", [])
        if mc:
            for m in mc:
                print(f"  📝 新建: [{m['type']}] {m['value']}")
        print()


# ======== 主入口 ========

def main():
    if len(sys.argv) < 2:
        print("用法:")
        print("  python3 ab_test.py <场景.json>            # A/B 对比（默认）")
        print("  python3 ab_test.py <场景.json> --mode=raw  # 只跑对照组")
        print("  python3 ab_test.py <场景.json> --mode=product")
        print("  python3 ab_test.py <场景.json> --summary   # 摘要")
        sys.exit(1)

    path = sys.argv[1]
    if not os.path.exists(path):
        alt = SCENARIOS_DIR / path
        if alt.exists():
            path = str(alt)
        else:
            print(f"找不到: {path}")
            sys.exit(1)

    mode = None
    summary = "--summary" in sys.argv
    for a in sys.argv[2:]:
        if a.startswith("--mode="):
            mode = a.split("=", 1)[1]

    scenario = load_scenario(path)

    if mode:
        results = run_scenario(scenario, mode)
        print_single(results, scenario, mode)
    else:
        print("▶ 运行对照组 A（裸 hy3）...")
        results_a = run_scenario(scenario, "raw")
        print("▶ 运行实验组 B（我在产品）...")
        results_b = run_scenario(scenario, "product")
        if summary:
            print()
            print("=" * 50)
            print("  A/B 摘要")
            print("=" * 50)
            for i, s in enumerate(scenario.get("steps", [])):
                a = results_a[i] if i < len(results_a) else {}
                b = results_b[i] if i < len(results_b) else {}
                mu = len(b.get("memories_used", []))
                mc = len(b.get("memories_created", []))
                print(f"  第{s['turn']}轮: A({a.get('reply_length',0)}字)  B({b.get('reply_length',0)}字 记忆:{mu}条/{mc}条)")
        else:
            print_comparison(results_a, results_b, scenario)


if __name__ == "__main__":
    main()
