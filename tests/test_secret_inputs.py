"""Synthetic boundary demonstration only, not an agent/tool protection test.

All inputs are invented here. The toy parser and auth sink are test-only; no
workflow/shell source is executed and no real credentials or browser are used.
"""
import contextlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


ACCOUNT = "dummy-account-49"
TOKEN = "dummy-token-49"
COMMAND = f"demo-login --account {ACCOUNT} --token {TOKEN} --target staging"
SOURCES = {
    "auth.md": f"# Fictional login\n`{COMMAND}`\n",
    "config.env": f"ACCOUNT={ACCOUNT}\nTOKEN={TOKEN}\nTARGET=staging\n",
    # JSON is also YAML; no YAML package is needed for these synthetic files.
    "workflow.yaml": json.dumps({"jobs": {"demo": {"steps": [{"run": COMMAND}]}}}),
    "action.yaml": json.dumps({"runs": {"using": "composite", "steps": [
        {"shell": "bash", "run": COMMAND}]}}),
    "login.sh": f"#!/bin/sh\n{COMMAND}\n",
}


def parse_fixture(path):
    """Read only this known synthetic grammar, never a general credential reader."""
    raw = path.read_text()
    if path.name == "config.env":
        fields = dict(line.split("=", 1) for line in raw.splitlines())
        return fields["ACCOUNT"], fields["TOKEN"], fields["TARGET"]
    if path.name == "auth.md":
        command = raw.split("`")[1]
    elif path.name == "workflow.yaml":
        command = json.loads(raw)["jobs"]["demo"]["steps"][0]["run"]
    elif path.name == "action.yaml":
        command = json.loads(raw)["runs"]["steps"][0]["run"]
    else:
        command = raw.splitlines()[1]
    parts = shlex.split(command)
    if parts[0] != "demo-login":
        raise ValueError(raw)
    fields = dict(zip(parts[1::2], parts[2::2], strict=True))
    return fields["--account"], fields["--token"], fields["--target"]


def demonstrate_boundary(path, route, authenticate):
    """Bounded example, intentionally not installed or used by Hanchou."""
    result = {"status": "failed", "reason": "invalid_input"}
    try:
        account, token, target = parse_fixture(path)
        if not account or not token:
            raise ValueError("missing fixture value")
        if target != "staging":
            result = {"status": "failed", "reason": "target_mismatch"}
        else:
            if route == "exception":
                raise ValueError(f"cannot parse {account}:{token}")
            if route in {"child_failure", "child_timeout"}:
                # Deliberately hostile child; data enters via private stdin.
                program = (
                    "import sys,time; data=sys.stdin.read(); "
                    "print(data, flush=True); print(data, file=sys.stderr, flush=True); "
                    + ("time.sleep(2)" if route == "child_timeout" else "sys.exit(7)")
                )
                child = subprocess.run(
                    [sys.executable, "-c", program], input=f"{account}:{token}",
                    capture_output=True, text=True, env={},
                    timeout=0.1 if route == "child_timeout" else 5,
                )
                if child.returncode:
                    result = {"status": "failed", "reason": "child_failed"}
                else:
                    result = {"status": "unverified", "reason": "no_postcondition"}
            elif route in {"browser_return", "browser_error"}:
                # Local stand-in for projection INSIDE evaluate, not a browser test.
                def evaluation():
                    private_page = {"account": account, "cookie": token, "ready": True}
                    try:
                        if route == "browser_error":
                            raise ValueError(str(private_page))
                        return {"status": "verified", "target_matches": target == "staging",
                                "ready": private_page["ready"] is True}
                    except ValueError:
                        return {"status": "unverified", "reason": "browser_failed"}
                result = evaluation()
            else:
                # No credentials are materialized in an agent/tool call.
                ok = authenticate(account, token)
                result = ({"status": "verified", "target_matches": True, "authenticated": True}
                          if ok else {"status": "failed", "reason": "authentication_failed"})
    except subprocess.TimeoutExpired:
        result = {"status": "unverified", "reason": "child_timeout"}
    except (ValueError, KeyError, IndexError, OSError):
        # Exception text and captured child output never cross the boundary.
        result = {"status": "failed", "reason": "invalid_input"}
    print(json.dumps(result, sort_keys=True))


def observe(action):
    """Observe Python output AND inherited child FDs in these serial tests."""
    sys.stdout.flush()
    sys.stderr.flush()
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8") as stdout, \
            tempfile.TemporaryFile(mode="w+", encoding="utf-8") as stderr:
        with contextlib.ExitStack() as stack:
            for fd, stream in ((1, stdout), (2, stderr)):
                saved = os.dup(fd)
                stack.callback(os.close, saved)
                stack.callback(os.dup2, saved, fd)
                os.dup2(stream.fileno(), fd)
            stack.enter_context(contextlib.redirect_stdout(stdout))
            stack.enter_context(contextlib.redirect_stderr(stderr))
            # Flush before restoring the FDs, including when action raises.
            stack.callback(stdout.flush)
            stack.callback(stderr.flush)
            action()
        stdout.seek(0)
        stderr.seek(0)
        return stdout.read(), stderr.read()


def matches_expected(observed, expected):
    # Exact output/value oracle, not a blacklist or secret detector.
    return observed == (json.dumps(expected, sort_keys=True) + "\n", "")


class SyntheticSecretBoundary(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="hanchou-secret-test-")
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        for name, content in SOURCES.items():
            (self.root / name).write_text(content)
        self.calls = []

    def auth_sink(self, account, token):
        self.calls.append((account, token))
        return (account, token) == (ACCOUNT, TOKEN)

    def check_probe(self, name, route, expected):
        observed = observe(lambda: demonstrate_boundary(self.root / name, route, self.auth_sink))
        self.assertTrue(matches_expected(observed, expected), "unexpected boundary output")
        return observed

    def test_normal_inputs_and_direct_dummy_authentication(self):
        for name in SOURCES:
            with self.subTest(source=name):
                self.check_probe(name, "normal", {
                    "status": "verified", "target_matches": True, "authenticated": True})
        self.assertEqual(self.calls, [(ACCOUNT, TOKEN)] * len(SOURCES))

    def test_failure_and_browser_paths_have_exact_useful_outputs(self):
        cases = {
            "exception": {"status": "failed", "reason": "invalid_input"},
            "child_failure": {"status": "failed", "reason": "child_failed"},
            "child_timeout": {"status": "unverified", "reason": "child_timeout"},
            "browser_return": {"status": "verified", "target_matches": True, "ready": True},
            "browser_error": {"status": "unverified", "reason": "browser_failed"},
        }
        for name in SOURCES:
            for route, expected in cases.items():
                with self.subTest(source=name, route=route):
                    self.check_probe(name, route, expected)
        self.assertEqual(self.calls, [])

    def test_broken_procedures_are_not_hidden_as_success(self):
        cases = [("TOKEN=", "", "invalid_input"),
                 ("TARGET=staging", "TARGET=wrong", "target_mismatch"),
                 (TOKEN, "dummy-rejected-49", "authentication_failed")]
        path = self.root / "config.env"
        for old, new, reason in cases:
            with self.subTest(reason=reason):
                path.write_text(SOURCES[path.name].replace(old, new))
                observed = self.check_probe(path.name, "normal", {"status": "failed", "reason": reason})
                self.assertFalse(matches_expected(observed, {"status": "verified"}))

    def test_oracle_rejects_leaks_and_false_success_negative_controls(self):
        expected = {"status": "failed", "reason": "child_failed"}
        good = (json.dumps(expected, sort_keys=True) + "\n", "")
        # Full display, matching-line extraction, env enumeration, exception,
        # child stderr, raw browser return, and a secret under an allowed key.
        matching_line = next(line for line in (self.root / "auth.md").read_text().splitlines()
                             if "demo-login" in line)
        leaks = [SOURCES["auth.md"], matching_line, SOURCES["config.env"],
                 str(ValueError(TOKEN)), f"child failed: {TOKEN}",
                 json.dumps({"cookie": TOKEN}), json.dumps({"status": TOKEN})]
        for leak in leaks:
            for stream in (0, 1):
                with self.subTest(stream=stream, leak_kind=leaks.index(leak)):
                    emitted = observe(lambda: print(leak, file=sys.stdout if stream == 0 else sys.stderr))
                    bad = [good[index] + emitted[index] for index in (0, 1)]
                    self.assertFalse(matches_expected(tuple(bad), expected))
        self.assertFalse(matches_expected(("", ""), expected))
        self.assertFalse(matches_expected((json.dumps({"status": "verified"}) + "\n", ""), expected))

    def test_missing_private_child_capture_fails_the_probe(self):
        run = subprocess.run

        def without_private_capture(*args, **kwargs):
            kwargs["capture_output"] = False
            if inherited_stream == "stdout":
                kwargs["stderr"] = subprocess.PIPE
            elif inherited_stream == "stderr":
                kwargs["stdout"] = subprocess.PIPE
            return run(*args, **kwargs)

        # Mutate the actual child launch, not an already-constructed output.
        # The hostile child's inherited FDs bypass redirect_stdout/stderr.
        with mock.patch.object(subprocess, "run", side_effect=without_private_capture):
            for inherited_stream in ("both", "stdout", "stderr"):
                for name in SOURCES:
                    with self.subTest(source=name, inherited_stream=inherited_stream):
                        with self.assertRaisesRegex(AssertionError, "unexpected boundary output"):
                            self.check_probe(name, "child_failure", {
                                "status": "failed", "reason": "child_failed"})


if __name__ == "__main__":
    unittest.main()
