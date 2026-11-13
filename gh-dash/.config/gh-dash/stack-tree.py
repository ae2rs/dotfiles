#!/usr/bin/env python3
"""Print the stack of open PRs that contains a given PR, as a tree.

Usage: stack-tree.py OWNER/REPO PR_NUMBER

A stack is the chain of the PR author's open PRs linked by base branch to head branch.
"""

import json
import subprocess
import sys

BOLD, DIM, GREEN, RED, YELLOW, RESET = "\033[1m", "\033[2m", "\033[32m", "\033[31m", "\033[33m", "\033[0m"
REVIEW = {
    "APPROVED": f"{GREEN}approved{RESET}",
    "CHANGES_REQUESTED": f"{RED}changes requested{RESET}",
}


def gh(*args):
    return json.loads(subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout)


def describe(pr, selected):
    tags = [f"{DIM}draft{RESET}"] if pr["isDraft"] else []
    if review := REVIEW.get(pr["reviewDecision"]):
        tags.append(review)
    line = f"#{pr['number']} {pr['title']}"
    if selected:
        line = f"{BOLD}{YELLOW}{line}{RESET}"
    return f"{line}  {' · '.join(tags)}" if tags else line


def main(repo, number):
    author = gh("pr", "view", number, "-R", repo, "--json", "author")["author"]["login"]
    fields = "number,title,headRefName,baseRefName,isDraft,reviewDecision"
    prs = gh("pr", "list", "-R", repo, "--author", author, "--state", "open", "--limit", "200", "--json", fields)

    by_head = {pr["headRefName"]: pr for pr in prs}
    children = {}
    for pr in prs:
        children.setdefault(pr["baseRefName"], []).append(pr)

    root = next(pr for pr in prs if pr["number"] == int(number))
    while root["baseRefName"] in by_head:
        root = by_head[root["baseRefName"]]

    print(f"{BOLD}{root['baseRefName']}{RESET}")

    def walk(pr, prefix, last):
        branch, indent = ("└─ ", "   ") if last else ("├─ ", "│  ")
        kids = sorted(children.get(pr["headRefName"], []), key=lambda p: p["number"])
        print(f"{prefix}{branch}{describe(pr, pr['number'] == int(number))}")
        print(f"{prefix}{indent}{'│  ' if kids else '   '}{DIM}{pr['headRefName']}{RESET}")
        for i, kid in enumerate(kids):
            walk(kid, prefix + indent, i == len(kids) - 1)

    walk(root, "", True)


if __name__ == "__main__":
    main(*sys.argv[1:])
