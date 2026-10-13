"""Test-only acceptance oracle and real Git probes, not a publisher/updater.

Fixture transitions describe forbidden outcomes for forward tests. They do not
execute SKILL.md or prove that a model will sanitize or recover correctly.
"""
from pathlib import Path
import re
import os
import hashlib
import json
import sys
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def permitted_transition(*, receipt, verified=False, covered=False,
                         unchanged=True, exclusive=True):
    """Independent outcome oracle: (may_post, may_remove_source)."""
    return (receipt == "none" and not covered,
            verified and covered and unchanged and exclusive)


class StorageProbes(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="hanchou-git-test-")
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.git("init", "-q")
        (self.root / "tmp").mkdir()
        self.memo = self.root / "tmp/hanchou_update.md"

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args],
                              capture_output=True, text=True,
                              env={**os.environ, "GIT_CONFIG_NOSYSTEM": "1",
                                   "GIT_CONFIG_GLOBAL": os.devnull})

    def eligible(self):
        tracked = self.git("ls-files", "--error-unmatch", "--",
                           "tmp/hanchou_update.md")
        ignored = self.git("check-ignore", "-q", "--",
                           "tmp/hanchou_update.md")
        return tracked.returncode == 1 and ignored.returncode == 0

    def exclude(self, text):
        result = self.git("rev-parse", "--git-path", "info/exclude")
        self.assertEqual(result.returncode, 0, result.stderr)
        (self.root / result.stdout.strip()).write_text(text)

    def test_tmp_name_does_not_make_path_safe(self):
        self.assertFalse(self.eligible())

    def test_ignored_absent_file_is_eligible(self):
        self.exclude("/tmp/hanchou_update.md\n")
        self.assertTrue(self.eligible())
        self.assertFalse(self.memo.exists())

    def test_tracked_even_with_ignore_rule_is_rejected(self):
        self.memo.write_text("existing tracked content\n")
        self.assertEqual(self.git("add", "tmp/hanchou_update.md").returncode, 0)
        self.exclude("/tmp/hanchou_update.md\n")
        self.assertFalse(self.eligible())
        self.assertEqual(self.memo.read_text(), "existing tracked content\n")

    def test_negated_ignore_is_not_eligible(self):
        self.exclude("/tmp/*\n!/tmp/hanchou_update.md\n")
        self.assertFalse(self.eligible())

    def test_existing_memo_and_shared_settings_untouched(self):
        self.memo.write_text("## HN-001\nKeep unresolved text.\n")
        shared = self.root / ".gitignore"
        shared.write_text("build/\n")
        before = (self.memo.read_bytes(), shared.read_bytes())
        self.exclude("/tmp/hanchou_update.md\n/tmp/hanchou_update.md.lock/\n")
        self.assertTrue(self.eligible())
        self.assertEqual(before, (self.memo.read_bytes(), shared.read_bytes()))

    def test_lock_excludes_second_writer_without_overwrite(self):
        self.exclude("/tmp/hanchou_update.md.lock/\n")
        lock = Path(str(self.memo) + ".lock")
        lock.mkdir()
        with self.assertRaises(FileExistsError):
            lock.mkdir()
        self.assertEqual(self.git("check-ignore", "-q", "--",
                                 "tmp/hanchou_update.md.lock/").returncode, 0)
        lock.rmdir()


class PublicationFixtures(unittest.TestCase):
    def test_original_source_fingerprint_survives_process_reload(self):
        # Exercise the durable comparison primitive in distinct processes. This
        # is not a full publisher restart or a model behavior test.
        with tempfile.TemporaryDirectory(prefix="hanchou-reload-test-") as root:
            source = Path(root) / "selected-part.md"
            receipt = Path(root) / "receipt.json"
            source.write_bytes(b"Original selected source part.\n")
            original = hashlib.sha256(source.read_bytes()).hexdigest()
            receipt.write_text(json.dumps({"source_digest": original}))
            probe = """
import hashlib, json, pathlib, sys
source, receipt = map(pathlib.Path, sys.argv[1:])
expected = json.loads(receipt.read_text()).get('source_digest')
print(bool(expected) and expected == hashlib.sha256(source.read_bytes()).hexdigest())
"""
            def reload_matches():
                result = subprocess.run([sys.executable, "-c", probe, str(source), str(receipt)],
                                        capture_output=True, text=True, check=True)
                return result.stdout.strip() == "True"
            self.assertTrue(reload_matches())
            source.write_bytes(b"Original selected source part.\nNew unresolved evidence.\n")
            self.assertFalse(reload_matches())
            receipt.write_text("{}")
            self.assertFalse(reload_matches())

    def test_public_fixture_contains_no_synthetic_private_canaries(self):
        private = (ROOT / "tests/fixtures/private-note.md").read_text()
        public = (ROOT / "tests/fixtures/public-issue.md").read_text()
        canaries = ["Silver Orchard", "Example Lantern", "private.invalid",
                    "customer-47", "/Users/example-private", "SilverOrchard",
                    "DUMMY_SECRET_DO_NOT_PUBLISH_47", "DUMMY_COOKIE_47",
                    "example-private/internal-repo", "task_DUMMY_PRIVATE_47"]
        for canary in canaries:
            self.assertIn(canary, private)
            self.assertNotIn(canary, public)
        self.assertIn("Unknowns:", public)

    def test_recovery_outcome_table(self):
        # These are reference expectations for agent evaluation, not an API mock
        # claiming to execute the instruction-only publisher.
        cases = [
            ("new", dict(receipt="none"), (True, False)),
            ("timeout", dict(receipt="unknown"), (False, False)),
            ("concurrent publisher", dict(receipt="pending"), (False, False)),
            ("readback failure", dict(receipt="pending", covered=True), (False, False)),
            ("existing duplicate", dict(receipt="none", covered=True,
                                        verified=True), (False, True)),
            ("cleanup retry", dict(receipt="published-verified", covered=True,
                                   verified=True), (False, True)),
            ("same item edited", dict(receipt="published-verified", covered=True,
                                      verified=True, unchanged=False), (False, False)),
            ("other editor active", dict(receipt="published-verified", covered=True,
                                         verified=True, exclusive=False), (False, False)),
            ("partial coverage pending part", dict(receipt="pending", verified=True,
                                                   covered=False), (False, False)),
        ]
        for name, state, expected in cases:
            with self.subTest(name=name):
                self.assertEqual(permitted_transition(**state), expected)

    def test_selective_cleanup_fixture_preserves_append_and_uncertain_part(self):
        covered = "## HN-001\nVerified unchanged observation.\n\n"
        pending = "## HN-002\nUnsafe to publish; retain.\n\n"
        appended = "## HN-003\nConcurrent new observation.\n"
        current = covered + pending + appended
        # The expected artifact is deliberately explicit for behavioral reviewers.
        expected_after = pending + appended
        self.assertEqual(current.removeprefix(covered), expected_after)
        changed = covered.replace("unchanged", "revised") + pending + appended
        self.assertEqual(changed.removeprefix(covered), changed)


class DistributionContracts(unittest.TestCase):
    def test_all_skill_references_are_reachable_from_entrypoint(self):
        # Packaging invariant, not a test of model compliance: an orphaned
        # topic policy cannot be discovered by a freshly installed skill.
        for entrypoint in (ROOT / "skills").glob("*/SKILL.md"):
            skill_root = entrypoint.parent.resolve()
            pending = [entrypoint.resolve()]
            visited = set()
            while pending:
                path = pending.pop()
                if path in visited:
                    continue
                visited.add(path)
                for target in re.findall(r"\]\(([^)]+)\)", path.read_text()):
                    if "://" in target or target.startswith("#"):
                        continue
                    linked = (path.parent / target.split("#")[0]).resolve()
                    self.assertTrue(linked.is_relative_to(skill_root),
                                    f"installed skill link escapes package: {path} -> {target}")
                    self.assertTrue(linked.is_file(), f"missing reference: {linked}")
                    if linked.suffix == ".md":
                        pending.append(linked)
            expected = {p.resolve() for p in (skill_root / "references").rglob("*.md")}
            self.assertFalse(expected - visited,
                             f"unreachable references: {sorted(expected - visited)}")

    def test_exact_optional_skill_inventory_and_no_executable_payload(self):
        skills = ROOT / "skills"
        self.assertEqual({p.parent.name for p in skills.glob("*/SKILL.md")},
                         {"hanchou-orchestrator", "hanchou-kaizen", "hanchou-publish-issues", "hanchou-update"})
        for path in skills.rglob("*"):
            if path.is_file():
                self.assertIn(path.suffix, {".md", ".yaml"}, str(path))

    def test_relative_document_links_resolve(self):
        for directory in (ROOT / "skills", ROOT / "docs"):
            for path in directory.rglob("*.md"):
                for target in re.findall(r"\]\(([^)]+)\)", path.read_text()):
                    if "://" in target or target.startswith("#"):
                        continue
                    self.assertTrue((path.parent / target.split("#")[0]).exists(),
                                    f"{path.relative_to(ROOT)} -> {target}")

    def test_current_install_examples_select_only_shipped_names(self):
        shipped = {p.parent.name for p in (ROOT / "skills").glob("*/SKILL.md")}
        for name in ("README.md", "docs/INSTALLATION.md", "docs/ONBOARDING.md"):
            content = (ROOT / name).read_text().replace("\\\n", " ")
            commands = [line for line in content.splitlines()
                        if line.startswith("npx skills add https://github.com/ykawase1011/hanchou")]
            self.assertTrue(commands, name)
            self.assertIn("--global", commands[0], name)
            for command in commands:
                names = command.split("--skill ", 1)[1].split("--agent", 1)[0].split()
                self.assertEqual(set(names), shipped, name)
                self.assertIn("--agent codex claude-code", command)
                self.assertNotIn("--local", command)


if __name__ == "__main__":
    unittest.main()
