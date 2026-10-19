"""Test-only readiness demonstration with invented in-memory SQLite fixtures.

No real DB, HTTP service, browser, credentials, or agent execution is involved.
This example exercises the acceptance oracle, not an installed Hanchou probe.
"""
import contextlib
import io
import json
from pathlib import Path
import sqlite3
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_TARGET = "invented-qa-target-51"
ROW_CANARY = "invented-private-row-51"
SECRET_CANARY = "invented-private-connection-51"
BUSINESS_QUERY = "SELECT EXISTS(SELECT 1 FROM main.qa_listing WHERE active = 1)"


class SyntheticTarget:
    def __init__(self, target=EXPECTED_TARGET, view=True, permission=True, rows=True):
        self.identity = target
        self.connection = sqlite3.connect(":memory:")
        self.query_attempted = False
        self.connection.execute("CREATE TABLE qa_items (active INTEGER, private_text TEXT)")
        if rows:
            self.connection.execute("INSERT INTO qa_items VALUES (1, ?)", (ROW_CANARY,))
        if view:
            self.connection.execute("CREATE VIEW qa_listing AS SELECT * FROM qa_items")
        self.connection.commit()
        # Fixture creation is test setup only. All subsequent checks are read-only.
        self.connection.execute("PRAGMA query_only = ON")
        if not permission:
            self.connection.set_authorizer(
                lambda action, table, *_: sqlite3.SQLITE_DENY
                if action == sqlite3.SQLITE_READ and table == "qa_items"
                else sqlite3.SQLITE_OK)

    def metadata(self):
        # Stand-in for effective application-connection metadata, kept private.
        return {"target": self.identity, "connection": SECRET_CANARY}

    def representative_query(self):
        self.query_attempted = True
        return self.connection.execute(BUSINESS_QUERY).fetchone()[0] == 1


def demonstrate_readiness(target):
    """Project bounded results before output, without exposing rows/errors."""
    result = {
        "health": "unperformed", "target_matches": "unknown",
        "representative_query": "unperformed", "readiness": "inconclusive",
        "functional_qa": "unperformed", "reason": "unknown",
    }
    try:
        http_ok = True  # Synthetic HTTP receipt, not a network request.
        db_ok = target.connection.execute("SELECT 1").fetchone() == (1,)
        result["health"] = "passed" if http_ok and db_ok else "failed"
        if result["health"] != "passed":
            result.update(readiness="failed", reason="connection_failed")
        else:
            identity = target.metadata()["target"]
            if identity is None:
                result["reason"] = "identity_unverified"
            else:
                result["target_matches"] = identity == EXPECTED_TARGET
                if not result["target_matches"]:
                    result.update(readiness="failed", reason="target_mismatch")
                else:
                    # No result rows, SQL, or exception text cross this boundary.
                    try:
                        passed = target.representative_query()
                        result.update(
                            representative_query="passed" if passed else "failed",
                            readiness="passed" if passed else "failed",
                            reason="none" if passed else "predicate_failed")
                    except sqlite3.DatabaseError as error:
                        # SQLite codes are only this synthetic fixture's taxonomy.
                        code = error.sqlite_errorcode
                        reason = {sqlite3.SQLITE_ERROR: "structure_missing",
                                  sqlite3.SQLITE_AUTH: "permission_denied"}.get(code, "unknown")
                        result.update(representative_query="failed", readiness="failed", reason=reason)
                    except Exception:
                        result.update(representative_query="inconclusive", readiness="inconclusive",
                                      reason="verification_unavailable")
    except Exception:
        # Private exception may contain connection/row canaries; never stringify it.
        result.update(readiness="inconclusive", reason="verification_unavailable")
    print(json.dumps(result, sort_keys=True))


def expected(*, target_matches=True, query="unperformed", readiness="failed", reason):
    return {"health": "passed", "target_matches": target_matches,
            "representative_query": query, "readiness": readiness,
            "functional_qa": "unperformed", "reason": reason}


class SyntheticReadiness(unittest.TestCase):
    def fixture(self, **kwargs):
        target = SyntheticTarget(**kwargs)
        self.addCleanup(target.connection.close)
        return target

    def assert_probe(self, target, result):
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            demonstrate_readiness(target)
        # Exact allowed keys/values, not merely an absence-of-secret substring test.
        self.assertEqual((stdout.getvalue(), stderr.getvalue()),
                         (json.dumps(result, sort_keys=True) + "\n", ""))

    def test_wrong_db_health_passes_but_readiness_fails_then_correct_target(self):
        wrong = self.fixture(target="invented-temporary-target-51", view=False)
        self.assertEqual(wrong.connection.execute("SELECT 1").fetchone(), (1,))
        with self.assertRaises(sqlite3.OperationalError):
            wrong.connection.execute(BUSINESS_QUERY)
        self.assert_probe(wrong, expected(target_matches=False, reason="target_mismatch"))
        self.assertFalse(wrong.query_attempted)  # Gate stops feature query on wrong target.
        # Synthetic authorized target correction: select the prepared correct fixture.
        # No schema/data repair is performed in response to the failure.
        correct = self.fixture()
        self.assert_probe(correct, expected(query="passed", readiness="passed", reason="none"))
        self.assertTrue(correct.query_attempted)

    def test_wrong_identity_cannot_pass_even_with_usable_business_view(self):
        wrong = self.fixture(target="invented-temporary-target-51")
        self.assertTrue(wrong.representative_query())
        wrong.query_attempted = False
        self.assert_probe(wrong, expected(target_matches=False, reason="target_mismatch"))
        self.assertFalse(wrong.query_attempted)

    def test_structure_permission_and_predicate_failures_are_distinct(self):
        for args, reason in (({"view": False}, "structure_missing"),
                             ({"permission": False}, "permission_denied"),
                             ({"rows": False}, "predicate_failed")):
            with self.subTest(reason=reason):
                target = self.fixture(**args)
                self.assert_probe(target, expected(query="failed", reason=reason))
                self.assertTrue(target.query_attempted)

    def test_unknown_identity_and_private_errors_remain_unverified(self):
        unknown = self.fixture(target=None)
        self.assert_probe(unknown, expected(target_matches="unknown", readiness="inconclusive",
                                            reason="identity_unverified"))
        self.assertFalse(unknown.query_attempted)
        broken = self.fixture()
        with mock.patch.object(broken, "metadata", side_effect=ValueError(SECRET_CANARY + ROW_CANARY)):
            self.assert_probe(broken, expected(target_matches="unknown", readiness="inconclusive",
                                               reason="verification_unavailable"))
        with mock.patch.object(broken, "representative_query", side_effect=RuntimeError(ROW_CANARY)):
            self.assert_probe(broken, expected(query="inconclusive", readiness="inconclusive",
                                               reason="verification_unavailable"))

    def test_select_one_substitution_is_rejected_by_same_oracle(self):
        missing = self.fixture(view=False)
        # Mutate the executed query, rather than fabricate an incorrect result.
        with mock.patch(__name__ + ".BUSINESS_QUERY", "SELECT 1"):
            with self.assertRaises(AssertionError):
                self.assert_probe(missing, expected(query="failed", reason="structure_missing"))

    def test_checks_cannot_write_to_fixture(self):
        target = self.fixture()
        with self.assertRaises(sqlite3.OperationalError):
            target.connection.execute("DELETE FROM qa_items")
        self.assert_probe(target, expected(query="passed", readiness="passed", reason="none"))


class ReadinessDistribution(unittest.TestCase):
    def test_task_and_migration_link_to_shared_gate(self):
        # Discoverability only; these assertions do not evaluate agent behavior.
        for name in ("task-design", "migration-acceptance"):
            content = (ROOT / f"skills/hanchou-orchestrator/references/{name}.md").read_text()
            self.assertIn("(browser-qa.md#before-feature-qa-health-and-readiness)", content)
        policy = (ROOT / "skills/hanchou-orchestrator/references/browser-qa.md").read_text()
        self.assertIn("(secret-inputs.md)", policy)
        self.assertNotIn("qa_listing", policy)


if __name__ == "__main__":
    unittest.main()
