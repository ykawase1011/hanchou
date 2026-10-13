"""Test-only acceptance oracle and real Git probes, not a publisher/updater.

Fixture transitions describe forbidden outcomes for forward tests. They do not
execute SKILL.md or prove that a model will sanitize or recover correctly.
"""
from pathlib import Path
import re
import os
import stat
import hashlib
import json
import sys
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MEMO = ".hanchou/hanchou_update.md"
LEGACY_MEMO = "tmp/hanchou_update.md"


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
        (self.root / ".hanchou").mkdir()
        self.memo = self.root / DEFAULT_MEMO

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.root), *args],
                              capture_output=True, text=True,
                              env={**os.environ, "GIT_CONFIG_NOSYSTEM": "1",
                                   "GIT_CONFIG_GLOBAL": os.devnull})

    def local_metadata(self, relative):
        """Test-only probe: stop before following any symlink, even dangling.

        Returns (safe ancestry, final-entry present). This deliberately rejects
        all symlinks; it is not a shipped storage selector or agent evaluator.
        """
        path = self.root
        parts = Path(relative).parts
        if Path(relative).is_absolute() or ".." in parts:
            return False, None
        for index, part in enumerate(parts):
            path = path / part
            try:
                mode = path.lstat().st_mode
            except FileNotFoundError:
                return True, False
            except OSError:
                return False, None
            if stat.S_ISLNK(mode):
                return False, None
            if index < len(parts) - 1 and not stat.S_ISDIR(mode):
                return False, None
        return True, True

    def eligible(self, relative=DEFAULT_MEMO):
        if not self.local_metadata(relative)[0]:
            return False
        tracked = self.git("ls-files", "--error-unmatch", "--",
                           relative)
        ignored = self.git("check-ignore", "-q", "--",
                           relative)
        return tracked.returncode == 1 and ignored.returncode == 0

    def exclude(self, text):
        result = self.git("rev-parse", "--git-path", "info/exclude")
        self.assertEqual(result.returncode, 0, result.stderr)
        (self.root / result.stdout.strip()).write_text(text)

    def test_hanchou_name_does_not_make_path_safe(self):
        self.assertFalse(self.eligible())

    def test_ignored_absent_file_is_eligible(self):
        self.exclude(f"/{DEFAULT_MEMO}\n")
        self.assertTrue(self.eligible())
        self.assertFalse(self.memo.exists())
        self.memo.write_text("## HN-001\nNew generalized observation.\n")
        self.assertTrue(self.eligible())
        self.assertEqual(self.git("status", "--porcelain").stdout, "")

    def test_absent_parent_is_created_only_after_exact_path_checks(self):
        self.memo.parent.rmdir()
        self.assertFalse(self.eligible())
        self.exclude(f"/{DEFAULT_MEMO}\n/{DEFAULT_MEMO}.lock/\n")
        self.assertTrue(self.eligible())
        # A directory-only rule needs the directory spelling before creation.
        self.assertTrue(self.eligible(DEFAULT_MEMO + ".lock/"))
        self.memo.parent.mkdir()
        self.assertTrue(self.eligible())
        self.memo.write_bytes(b"New note.\n")
        self.assertEqual(self.git("status", "--porcelain").stdout, "")

    def test_tracked_even_with_ignore_rule_is_rejected(self):
        self.memo.write_text("existing tracked content\n")
        self.assertEqual(self.git("add", DEFAULT_MEMO).returncode, 0)
        self.exclude(f"/{DEFAULT_MEMO}\n")
        self.assertFalse(self.eligible())
        self.assertEqual(self.git("ls-files", "--", DEFAULT_MEMO).stdout.strip(), DEFAULT_MEMO)
        self.assertEqual(self.memo.read_text(), "existing tracked content\n")

    def test_negated_ignore_is_not_eligible(self):
        self.exclude(f"/.hanchou/*\n!/{DEFAULT_MEMO}\n")
        self.assertFalse(self.eligible())
        verbose = self.git("check-ignore", "-v", "--", DEFAULT_MEMO)
        # -v can succeed while reporting a negation: inspect the actual rule.
        self.assertEqual(verbose.returncode, 0)
        self.assertIn(f"!/{DEFAULT_MEMO}", verbose.stdout)

    def test_existing_memo_and_shared_settings_untouched(self):
        self.memo.write_text("## HN-001\nKeep unresolved text.\n")
        shared = self.root / ".gitignore"
        shared.write_text("build/\n")
        before = (self.memo.read_bytes(), shared.read_bytes())
        self.exclude(f"/{DEFAULT_MEMO}\n/{DEFAULT_MEMO}.lock/\n")
        self.assertTrue(self.eligible())
        self.assertEqual(before, (self.memo.read_bytes(), shared.read_bytes()))

    def test_lock_excludes_second_writer_without_overwrite(self):
        self.exclude(f"/{DEFAULT_MEMO}.lock/\n")
        lock = Path(str(self.memo) + ".lock")
        lock.mkdir()
        with self.assertRaises(FileExistsError):
            lock.mkdir()
        self.assertEqual(self.git("check-ignore", "-q", "--",
                                 f"{DEFAULT_MEMO}.lock/").returncode, 0)
        lock.rmdir()

    def test_each_auxiliary_path_needs_its_own_effective_ignore(self):
        self.exclude(f"/{DEFAULT_MEMO}\n")
        self.assertTrue(self.eligible())
        for suffix in (".lock", ".receipt", ".draft", ".backup"):
            relative = DEFAULT_MEMO + suffix
            with self.subTest(suffix=suffix):
                self.assertFalse(self.eligible(relative))
                self.exclude(f"/{DEFAULT_MEMO}*\n!/{relative}\n")
                self.assertFalse(self.eligible(relative))
                self.exclude(f"/{DEFAULT_MEMO}*\n")
                self.assertTrue(self.eligible(relative))
                path = self.root / relative
                path.write_text("Preserve local evidence.\n")
                self.assertEqual(self.git("add", "-f", "--", relative).returncode, 0)
                self.assertFalse(self.eligible(relative))
                self.assertEqual(path.read_text(), "Preserve local evidence.\n")
                self.exclude(f"/{DEFAULT_MEMO}\n")

    def test_external_parent_and_file_symlinks_are_rejected(self):
        self.exclude("/.hanchou/\n")
        with tempfile.TemporaryDirectory(prefix="hanchou-external-test-") as outside:
            external = Path(outside)
            sentinel = external / "hanchou_update.md"
            sentinel.write_bytes(b"External source must remain untouched.\n")
            (self.root / ".hanchou").rmdir()
            (self.root / ".hanchou").symlink_to(external, target_is_directory=True)
            self.assertFalse(self.eligible())
            self.assertEqual(self.local_metadata(DEFAULT_MEMO), (False, None))
            (self.root / ".hanchou").unlink()
            (self.root / ".hanchou").mkdir()
            for suffix in ("", ".lock", ".receipt", ".draft", ".backup"):
                relative = DEFAULT_MEMO + suffix
                path = self.root / relative
                path.symlink_to(sentinel)
                self.assertFalse(self.eligible(relative))
                path.unlink()
                path.symlink_to(external / "absent")
                self.assertFalse(self.eligible(relative))
                path.unlink()
            self.assertEqual(sentinel.read_bytes(), b"External source must remain untouched.\n")
            self.assertEqual(list(external.iterdir()), [sentinel])

    def test_explicit_path_is_checked_independently_of_default(self):
        explicit = "private/selected.md"
        (self.root / "private").mkdir()
        self.exclude(f"/{explicit}\n/{explicit}.lock/\n")
        self.assertFalse(self.eligible())
        self.assertTrue(self.eligible(explicit))
        (self.root / explicit).write_text("Explicit destination fixture.\n")
        self.assertFalse(self.memo.exists())

    def test_legacy_only_and_both_sources_preserve_original_artifacts(self):
        legacy = self.root / LEGACY_MEMO
        legacy.parent.mkdir()
        legacy.write_bytes(b"## HN-001\nUnresolved old observation.\n")
        receipt = Path(str(legacy) + ".receipt")
        receipt.write_text(json.dumps({"source": LEGACY_MEMO, "status": "pending",
                                      "source_digest": hashlib.sha256(legacy.read_bytes()).hexdigest()}))
        draft = Path(str(legacy) + ".draft")
        draft.write_bytes(b"Generalized pending draft.\n")
        lock = Path(str(legacy) + ".lock")
        lock.mkdir()
        before = {p: p.read_bytes() for p in (legacy, receipt, draft)}
        self.exclude(f"/{DEFAULT_MEMO}*\n/{LEGACY_MEMO}*\n")
        self.assertEqual(self.local_metadata(LEGACY_MEMO), (True, True))
        self.assertEqual(self.local_metadata(DEFAULT_MEMO), (True, False))
        # Exercise a new, empty default and its independent lock on real disk;
        # existence is not a publication or cleanup decision.
        self.memo.write_bytes(b"")
        self.assertEqual(self.local_metadata(DEFAULT_MEMO), (True, True))
        new_lock = Path(str(self.memo) + ".lock")
        new_lock.mkdir()
        with self.assertRaises(FileExistsError):
            lock.mkdir()
        new_lock.rmdir()
        self.assertTrue(lock.is_dir())
        self.assertEqual(before, {p: p.read_bytes() for p in before})
        self.assertEqual(json.loads(receipt.read_text())["source"], LEGACY_MEMO)

    def test_legacy_detection_stops_at_external_parent(self):
        with tempfile.TemporaryDirectory(prefix="hanchou-legacy-test-") as outside:
            (self.root / "tmp").symlink_to(outside, target_is_directory=True)
            self.assertEqual(self.local_metadata(LEGACY_MEMO), (False, None))
            (self.root / "tmp").unlink()
            (self.root / "tmp").mkdir()
            (self.root / LEGACY_MEMO).symlink_to(Path(outside) / "absent")
            self.assertEqual(self.local_metadata(LEGACY_MEMO), (False, None))
            self.assertEqual(list(Path(outside).iterdir()), [])

    def test_known_legacy_receipt_can_survive_without_its_memo(self):
        receipt = self.root / (LEGACY_MEMO + ".receipt")
        receipt.parent.mkdir()
        receipt.write_bytes(b'{"status":"unknown","source":"tmp/hanchou_update.md"}\n')
        before = receipt.read_bytes()
        self.assertEqual(self.local_metadata(LEGACY_MEMO), (True, False))
        self.assertEqual(self.local_metadata(LEGACY_MEMO + ".receipt"), (True, True))
        self.memo.write_bytes(b"")
        self.assertEqual(receipt.read_bytes(), before)


class PublicationFixtures(unittest.TestCase):
    def test_original_source_fingerprint_survives_process_reload(self):
        # Exercise the durable comparison primitive in distinct processes. This
        # is not a full publisher restart or a model behavior test.
        with tempfile.TemporaryDirectory(prefix="hanchou-reload-test-") as root:
            source = Path(root) / LEGACY_MEMO
            source.parent.mkdir()
            other = Path(root) / DEFAULT_MEMO
            other.parent.mkdir()
            receipt = Path(root) / "receipt.json"
            source.write_bytes(b"Original selected source part.\n")
            original = hashlib.sha256(source.read_bytes()).hexdigest()
            receipt.write_text(json.dumps({"source_digest": original,
                                           "source_path": str(source.resolve())}))
            probe = """
import hashlib, json, pathlib, sys
source, receipt = map(pathlib.Path, sys.argv[1:])
saved = json.loads(receipt.read_text())
expected = saved.get('source_digest')
print(saved.get('source_path') == str(source.resolve()) and bool(expected)
      and expected == hashlib.sha256(source.read_bytes()).hexdigest())
"""
            def reload_matches(selected=source):
                result = subprocess.run([sys.executable, "-c", probe, str(selected), str(receipt)],
                                        capture_output=True, text=True, check=True)
                return result.stdout.strip() == "True"
            self.assertTrue(reload_matches())
            other.write_bytes(b"")
            self.assertFalse(reload_matches(other))
            other.write_bytes(source.read_bytes())
            self.assertFalse(reload_matches(other))
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
    def test_recorder_publisher_and_usage_share_default_candidate(self):
        # Packaging/default agreement only, not proof of model behavior.
        recorder = (ROOT / "skills/hanchou-orchestrator/references/improvement-notes.md").read_text()
        publisher = (ROOT / "skills/hanchou-publish-issues/SKILL.md").read_text()
        self.assertEqual(re.search(r"otherwise try `([^`]+)`", recorder)[1], DEFAULT_MEMO)
        self.assertEqual(re.search(r"candidate `([^`]+)`", publisher)[1], DEFAULT_MEMO)
        for name in ("skills/hanchou-publish-issues/references/publication.md",
                     "docs/IMPROVEMENTS.md", "docs/USAGE.md", "examples/project/README.md"):
            content = (ROOT / name).read_text()
            self.assertIn(f"`{DEFAULT_MEMO}`", content, name)
            self.assertIn(f"`{LEGACY_MEMO}`", content, name)

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
                         {"hanchou-orchestrator", "hanchou-kaizen", "hanchou-publish-issues", "hanchou-update", "hanchou-cron", "hanchou-init"})
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
        for name in ("README.md", "docs/INSTALLATION.md", "docs/ONBOARDING.md",
                     "docs/MIGRATION_V2_TO_V3.md"):
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

    def test_cron_provider_invocations_are_documented(self):
        # Discoverability only; prose behavior is reviewed with manual cases.
        docs = (ROOT / "README.md").read_text() + (ROOT / "docs/CRON.md").read_text()
        self.assertIn("$hanchou-cron", docs)
        self.assertIn("/hanchou-cron", docs)


if __name__ == "__main__":
    unittest.main()
