"""Disposable Git/content probes for update review, not an updater implementation.

These establish comparison primitives used by the instructions. They do not
execute the skills, launch agents, or qualify model behavior/session rotation.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile
import unittest


class UpdateContentProbes(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="hanchou-update-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.git("init", "-q")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Fixture")
        self.skill = "skills/hanchou-orchestrator"
        self.write(f"{self.skill}/SKILL.md", "Baseline instructions\n")
        self.write(f"{self.skill}/references/topic.md", "Baseline reference\n")
        self.write("skills/hanchou-update/SKILL.md", "Uninstalled helper\n")
        self.write("README.md", "Repository documentation\n")
        self.baseline = self.commit()

    def git(self, *args, check=True):
        return subprocess.run(["git", "-C", str(self.source), *args],
                              check=check, capture_output=True, text=True)

    def write(self, relative, content):
        path = self.source / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)

    def commit(self):
        self.git("add", ".")
        self.git("commit", "-qm", "Fixture revision")
        return self.git("rev-parse", "HEAD").stdout.strip()

    def tree(self, revision):
        return self.git("rev-parse", f"{revision}:{self.skill}").stdout.strip()

    def test_repository_head_and_absent_helper_do_not_change_installed_tree(self):
        self.write("README.md", "Unrelated documentation change\n")
        self.write("skills/hanchou-update/SKILL.md", "New absent helper instructions\n")
        candidate = self.commit()
        self.assertNotEqual(candidate, self.baseline)
        self.assertEqual(self.tree(candidate), self.tree(self.baseline))

    def test_references_additions_removals_and_modes_change_complete_tree(self):
        previous = self.baseline
        operations = [
            lambda: self.write(f"{self.skill}/references/topic.md", "Changed reference\n"),
            lambda: self.write(f"{self.skill}/references/new.md", "New reference\n"),
            lambda: (self.source / self.skill / "references/new.md").unlink(),
            lambda: (self.source / self.skill / "SKILL.md").chmod(0o755),
        ]
        for operation in operations:
            operation()
            candidate = self.commit()
            self.assertNotEqual(self.tree(previous), self.tree(candidate))
            previous = candidate

    def test_pinned_revision_stays_distinct_from_latest_and_moved_tag(self):
        self.git("tag", "chosen-pin", self.baseline)
        self.write(f"{self.skill}/SKILL.md", "New upstream instructions\n")
        latest = self.commit()
        self.assertEqual(self.tree("chosen-pin"), self.tree(self.baseline))
        self.assertNotEqual(self.tree("chosen-pin"), self.tree(latest))
        self.git("tag", "-f", "chosen-pin", latest)
        self.assertNotEqual(self.git("rev-parse", "chosen-pin").stdout.strip(),
                            self.baseline)

    def test_missing_revision_and_removed_skill_are_not_equal_content(self):
        self.assertNotEqual(self.git("rev-parse", f"missing:{self.skill}",
                                     check=False).returncode, 0)
        shutil.rmtree(self.source / self.skill)
        candidate = self.commit()
        self.assertNotEqual(self.git("rev-parse", f"{candidate}:{self.skill}",
                                     check=False).returncode, 0)
        self.assertTrue(self.tree(self.baseline))

    def test_local_edit_addition_and_deletion_survive_read_only_comparison(self):
        installed = self.root / "installed"
        shutil.copytree(self.source / self.skill, installed)
        baseline = self.source / self.skill

        def compare():
            return subprocess.run(["git", "diff", "--no-index", "--exit-code",
                                   str(baseline), str(installed)], capture_output=True).returncode

        self.assertEqual(compare(), 0)
        (installed / "SKILL.md").write_text("User's custom content\n")
        (installed / "local.md").write_text("Local addition\n")
        (installed / "references/topic.md").unlink()
        before = {p.relative_to(installed): p.read_bytes()
                  for p in installed.rglob("*") if p.is_file()}
        self.assertEqual(compare(), 1)
        self.assertEqual(before, {p.relative_to(installed): p.read_bytes()
                                 for p in installed.rglob("*") if p.is_file()})

    def test_scope_target_and_symlink_identity_are_not_content_equality(self):
        global_copy = self.root / "global/hanchou-orchestrator"
        local_copy = self.root / "project/hanchou-orchestrator"
        shutil.copytree(self.source / self.skill, global_copy)
        shutil.copytree(global_copy, local_copy)
        alias = self.root / "provider-alias"
        alias.symlink_to(global_copy, target_is_directory=True)
        before = global_copy.joinpath("SKILL.md").read_bytes()
        self.assertEqual(os.readlink(alias), str(global_copy))
        self.assertNotEqual(alias.resolve(), local_copy.resolve())
        local_copy.joinpath("SKILL.md").write_text("Shadowing local customization\n")
        self.assertNotEqual(local_copy.joinpath("SKILL.md").read_bytes(), before)
        self.assertEqual(alias.joinpath("SKILL.md").read_bytes(), before)
        # Equal bytes never establish common scope or provenance. Retargeting
        # a link changes the Git tree without dereferencing its destination.
        link = self.source / self.skill / "reference-link"
        link.symlink_to(global_copy)
        first = self.commit()
        link.unlink()
        link.symlink_to(local_copy)
        second = self.commit()
        self.assertNotEqual(self.tree(first), self.tree(second))
        self.assertEqual(global_copy.joinpath("SKILL.md").read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
