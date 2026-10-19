"""Static distribution checks; no worker launches or semantic evaluation."""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "skills/hanchou-orchestrator/references"


class WorkerReuseDistribution(unittest.TestCase):
    def test_reuse_gate_is_reachable_from_assignment_and_cleanup(self):
        evidence = (REFERENCES / "worker-evidence.md").read_text()
        anchors = {
            re.sub(r"[^\w -]", "", heading.lower()).replace(" ", "-")
            for heading in re.findall(r"^## (.+)$", evidence, re.MULTILINE)
        }
        for filename in ("routing.md", "task-design.md", "cleanup.md"):
            with self.subTest(reference=filename):
                links = re.findall(r"\]\(worker-evidence\.md#([^)]*)\)",
                                   (REFERENCES / filename).read_text())
                self.assertIn("reuse-qualification-before-submission", links)
                for anchor in links:
                    self.assertIn(anchor, anchors)

    def test_independent_inputs_have_separate_matching_expectations(self):
        report = (ROOT / "docs/WORKER_REUSE_VALIDATION.md").read_text()
        inputs = report.split("## Inputs only\n", 1)[1].split(
            "## Expected decisions and rejection rules\n", 1)[0]
        expectations = report.split(
            "## Expected decisions and rejection rules\n", 1)[1].split(
            "## Author audit and automated checks\n", 1)[0]
        for section in (inputs, expectations):
            self.assertEqual(re.findall(r"^\| (R\d)\b", section, re.MULTILINE),
                             ["R1", "R2", "R3", "R4"])
        for filename in ("POLICY_ACCEPTANCE.md", "ORCA_COMPATIBILITY.md"):
            with self.subTest(document=filename):
                self.assertIn("(WORKER_REUSE_VALIDATION.md)",
                              (ROOT / "docs" / filename).read_text())


if __name__ == "__main__":
    unittest.main()
