#!/usr/bin/env python3
"""
我在 A/B 测试评估框架

核心思路：
  A（裸模型）：直接调LLM，无记忆无上下文
  B（我在产品）：走完整Hermes-lite流水线（Agent+记忆+技能+知识）

对比维度：
  1. 个性化：B是否使用了用户历史信息
  2. 知识深度：B是否引用了权威来源
  3. 长期记忆：B在多轮后是否持续记住用户情况
  4. 综合能力：综合各维度的整体体验

用法：
  python3 ab_test.py scenarios/health-memory.json
  python3 ab_test.py scenarios/health-memory.json --verbose  # 显示完整回复
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
        # 支持JSON和带注释的JSON
        content = f.read()
        # 去掉注释行
        lines = [l for l in content.split("\n") if not l.strip().startswith("//") and not l.strip().startswith("#")]
        return json.loads("\n".join(lines))


def run_scenario(scenario: dict, verbose: bool = False):
    """跑一个场景：A/B 对比全部轮次"""
    name = scenario.get("name", "未命名场景")
    steps = scenario.get("steps", [])

    print("=" * 72)
    print(f"  A/B 测试: {name}")
    print(f"  {scenario.get('description', '')}")
    print("=" * 72)
    print()

    product_state = {}  # 存B的对话状态

    for step in steps:
        turn = step.get("turn", 0)
        user_text = step.get("user", "")
        note = step.get("note", "")

        print(f"── 第{turn}轮 ──")
        print(f"用户: {user_text}")
        if note:
            print(f"     ({note})")
        print()

        # A: 裸模型（无记忆）
        result_a = call_harness("raw", {"text": user_text})
        reply_a = result_a.get("reply", f"[错误] {result_a.get('error', '未知')}")

        # B: 产品（有记忆）
        result_b = call_harness("product", {"text": user_text, "turn": turn}, product_state)
        if "convId" in result_b:
            product_state["convId"] = result_b["convId"]
        reply_b = result_b.get("reply", f"[错误] {result_b.get('error', '未知')}")

        # 输出对比
        _print_comparison(reply_a, reply_b, result_b, verbose)
        print()

    # 最终评价
    print("─" * 72)
    print("  评估总结")
    print("─" * 72)
    _print_evaluation(len(steps), verbose)
    print()


def _print_comparison(reply_a: str, reply_b: str, result_b: dict, verbose: bool):
    """并排展示A/B回复"""
    # 截断显示
    display_a = reply_a if verbose else reply_a[:300] + ("..." if len(reply_a) > 300 else "")
    display_b = reply_b if verbose else reply_b[:300] + ("..." if len(reply_b) > 300 else "")

    width = 35
    print(f"  {'─' * width}  {'─' * width}")
    print(f"  {'A: 裸模型':<{width}}  {'B: 我在（Harness）':<{width}}")
    print(f"  {'─' * width}  {'─' * width}")
    print()

    # 分行对比
    lines_a = display_a.split("\n")
    lines_b = display_b.split("\n")
    max_lines = max(len(lines_a), len(lines_b))
    for i in range(max_lines):
        la = lines_a[i] if i < len(lines_a) else ""
        lb = lines_b[i] if i < len(lines_b) else ""
        print(f"  {la:<{width}}  {lb:<{width}}")

    print(f"  {'─' * width}  {'─' * width}")

    # B的额外信息
    mem_used = result_b.get("usedMemories", [])
    mem_created = result_b.get("createdMemories", [])
    mem_status = result_b.get("memoryStatus", "")
    if mem_used:
        for m in mem_used:
            print(f"  📌 B使用了记忆: [{m['type']}] {m['value']}")
    if mem_created:
        for m in mem_created:
            print(f"  📝 B新建记忆: [{m['type']}] {m['value']}")
    if mem_status:
        print(f"  💾 记忆状态: {mem_status}")

    # A的额外信息（裸模型无记忆）
    print(f"  💾 A: 无记忆（裸模型）")


def _print_evaluation(total_turns: int, verbose: bool):
    """根据测试轮次给出定性评价"""
    print()
    print(f"  共 {total_turns} 轮对话")
    print()
    print("  对比要点：")
    print("  1. 个性化：B的回答是否使用了用户的个人情况？A是否完全没有？")
    print("  2. 知识深度：回答是否有权威依据，还是泛泛而谈？")
    print("  3. 长期记忆：多轮后B是否持续记住用户早期说的信息？")
    print("  4. 综合吸引力：作为用户，你更愿意跟A还是B聊下去？")
    print()
    print("  评估方式：")
    print("  • 当前：人工阅读对比")
    print("  • 后续可演化为：LLM自动评分 + 人工校验")
    print()


def main():
    if len(sys.argv) < 2:
        print("用法: python3 ab_test.py <场景文件.json> [--verbose]")
        print("示例: python3 ab_test.py scenarios/health-memory.json")
        sys.exit(1)

    scenario_path = sys.argv[1]
    verbose = "--verbose" in sys.argv

    if not os.path.exists(scenario_path):
        # 尝试从 scenarios/ 下找
        scenario_path = str(HARNESS_DIR / "scenarios" / scenario_path)
        if not os.path.exists(scenario_path):
            print(f"找不到场景文件: {sys.argv[1]}")
            sys.exit(1)

    scenario = load_scenario(scenario_path)
    run_scenario(scenario, verbose)


if __name__ == "__main__":
    main()
