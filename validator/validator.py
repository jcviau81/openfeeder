"""OpenFeeder Validator CLI — checks if a website is OpenFeeder-compliant."""

from __future__ import annotations

import sys

import click

from checks import Status, run_all_checks
from report import format_json, print_report


@click.command()
@click.argument("url")
@click.option("--verbose", "-v", is_flag=True, help="Show full details for each check.")
@click.option("--json", "json_output", is_flag=True, help="Output results as JSON (for CI).")
@click.option("--endpoint", default=None, help="Override the feed endpoint URL.")
def main(url: str, verbose: bool, json_output: bool, endpoint: str | None) -> None:
    """Validate an OpenFeeder-compliant website.

    URL is the base URL of the site to check (e.g. https://example.com).
    """
    # Normalize URL
    if not url.startswith("http"):
        url = f"https://{url}"

    try:
        ctx = run_all_checks(url, endpoint_override=endpoint)
    except Exception as exc:
        if json_output:
            import json
            click.echo(json.dumps({"url": url, "result": "ERROR", "error": str(exc)}, indent=2))
        else:
            click.echo(f"Error: could not reach {url} — {exc}", err=True)
        sys.exit(2)

    if json_output:
        click.echo(format_json(ctx))
    else:
        print_report(ctx, verbose=verbose)

    # Exit code
    has_fail = any(r.status == Status.FAIL for r in ctx.results)
    has_any_pass = any(r.status == Status.PASS for r in ctx.results)

    if not has_any_pass and not ctx.results:
        sys.exit(2)
    elif has_fail:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
