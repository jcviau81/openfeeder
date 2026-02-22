"""Report formatter for OpenFeeder Validator — terminal (rich) and JSON output."""

from __future__ import annotations

import json
from typing import Any

from rich.console import Console
from rich.text import Text

from checks import CheckResult, Status, ValidationContext


STATUS_ICONS = {
    Status.PASS: ("[green]✅[/]", "pass"),
    Status.FAIL: ("[red]❌[/]", "fail"),
    Status.WARN: ("[yellow]⚠️ [/]", "warn"),
    Status.SKIP: ("[dim]⏭️ [/]", "skip"),
}


def _result_to_dict(r: CheckResult) -> dict[str, Any]:
    return {
        "name": r.name,
        "status": r.status.value,
        "message": r.message,
        "details": r.details or None,
    }


# ---------------------------------------------------------------------------
# JSON output
# ---------------------------------------------------------------------------

def format_json(ctx: ValidationContext) -> str:
    passed = sum(1 for r in ctx.results if r.status == Status.PASS)
    failed = sum(1 for r in ctx.results if r.status == Status.FAIL)
    warnings = sum(1 for r in ctx.results if r.status == Status.WARN)
    skipped = sum(1 for r in ctx.results if r.status == Status.SKIP)

    out = {
        "url": ctx.base_url,
        "version": ctx.discovery.get("version"),
        "result": "FAIL" if failed else "PASS",
        "summary": {
            "passed": passed,
            "failed": failed,
            "warnings": warnings,
            "skipped": skipped,
        },
        "checks": [_result_to_dict(r) for r in ctx.results],
    }
    return json.dumps(out, indent=2)


# ---------------------------------------------------------------------------
# Terminal output (rich)
# ---------------------------------------------------------------------------

def print_report(ctx: ValidationContext, *, verbose: bool = False) -> None:
    console = Console()

    passed = sum(1 for r in ctx.results if r.status == Status.PASS)
    failed = sum(1 for r in ctx.results if r.status == Status.FAIL)
    warnings = sum(1 for r in ctx.results if r.status == Status.WARN)

    console.print()
    console.print(f"[bold]🌐 OpenFeeder Validator — {ctx.base_url}[/]")
    console.print("[dim]" + "━" * 50 + "[/]")
    console.print()

    for r in ctx.results:
        if r.status == Status.SKIP and not verbose:
            continue

        icon, _ = STATUS_ICONS[r.status]
        line = f"{icon} {r.name}"
        if r.message:
            line += f" — {r.message}"
        console.print(line)

        if verbose and r.details:
            console.print(f"   [dim]{r.details}[/]")

    console.print()
    console.print("[dim]" + "━" * 50 + "[/]")

    if failed:
        result_str = "[bold red]FAIL[/]"
    else:
        result_str = "[bold green]PASS[/]"

    console.print(
        f"Result: {result_str} "
        f"({passed} checks passed, {warnings} warnings, {failed} failures)"
    )

    version = ctx.discovery.get("version")
    if version:
        console.print(f"OpenFeeder version: {version}")

    console.print()
