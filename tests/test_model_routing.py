"""Static instruction/distribution regressions, not a router or agent test.

Semantic decisions and evidence limits are recorded separately in
docs/MODEL_ROUTING_VALIDATION.md. No provider, launch, or setting API is called.
"""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "skills/hanchou-orchestrator/references"


class RoutingDistribution(unittest.TestCase):
    def test_delegation_links_resolve_to_routing_sections(self):
        """Catch orphaned anchors that generic relative-file checks miss."""
        routing = (REFERENCES / "routing.md").read_text()
        anchors = {
            re.sub(r"[^\w -]", "", heading.lower()).replace(" ", "-")
            for heading in re.findall(r"^## (.+)$", routing, re.MULTILINE)
        }
        linked_sections = set()
        for filename in ("task-design.md", "request-scope.md", "review.md", "reporting.md"):
            with self.subTest(reference=filename):
                links = re.findall(r"\]\(routing\.md(?:#([^)]*))?\)",
                                   (REFERENCES / filename).read_text())
                self.assertTrue(links, "delegation/reporting must reach routing policy")
                for anchor in filter(None, links):
                    self.assertIn(anchor, anchors)
                    linked_sections.add(anchor)
        self.assertIn("scoped-model-and-effort-policy", linked_sections)
        self.assertIn("mid-task-corrections", linked_sections)

    def test_example_models_stay_out_of_distributed_policy(self):
        """The corrected issue example must not become a shipped model default."""
        for path in (ROOT / "skills").rglob("*.md"):
            with self.subTest(path=path.relative_to(ROOT)):
                self.assertIsNone(re.search(r"\b(?:Astra|Sol|gpt-6-astra|gpt-6-sol)\b",
                                            path.read_text(), re.IGNORECASE))

    def test_public_evidence_contract_remains_discoverable(self):
        """Static vocabulary guard only; this does not prove behavioral compliance."""
        routing = (REFERENCES / "routing.md").read_text()
        for term in ("references/coordinator-loop.md", "launch.requested",
                     "launch.effective", "`null`", "unknown"):
            with self.subTest(term=term):
                self.assertIn(term, routing)
        reporting = (REFERENCES / "reporting.md").read_text()
        self.assertIn("## Model selection evidence", reporting)

    def test_semantic_case_inventory_and_qualification_are_retained(self):
        """Do not mistake this inventory check for evaluating the case answers."""
        report = (ROOT / "docs/MODEL_ROUTING_VALIDATION.md").read_text()
        cases = re.findall(r"^\| (M\d{2})\b", report, re.MULTILINE)
        self.assertEqual(cases, [f"M{number:02}" for number in range(1, 20)])
        self.assertIn("issuecomment-6259908657", report)
        self.assertIn("author semantic decision audit", report)
        self.assertIn("not an independent evaluation", report)
        self.assertIn("MODEL_ROUTING_VALIDATION.md",
                      (ROOT / "docs/POLICY_ACCEPTANCE.md").read_text())


if __name__ == "__main__":
    unittest.main()
