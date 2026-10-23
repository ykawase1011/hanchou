.PHONY: check

# Offline checks: real temporary Git repositories, mocked Herdr and agent CLIs.
check:
	python3 tests/lifecycle_support.py
	bash scripts/validate.sh
	bash tests/test-launch-sokkin.sh
	bash tests/test-launch-sokkin-regressions.sh
	bash tests/test-startup-qualification.sh
	HANCHOU_TEST_CODEX_VERSION=0.163.0 HANCHOU_TEST_STARTUP_CASES='success pane-version native-version counters' bash tests/test-startup-qualification.sh
	bash tests/test-measure-session.sh
	HANCHOU_TEST_CODEX_VERSION=0.163.0 bash tests/test-measure-session.sh
	python3 tests/test-herdr-lifecycle.py
