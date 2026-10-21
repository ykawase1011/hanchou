.PHONY: check

# Offline checks: real temporary Git repositories, mocked Herdr and agent CLIs.
check:
	bash scripts/validate.sh
	bash tests/test-launch-sokkin.sh
	bash tests/test-launch-sokkin-regressions.sh
	bash tests/test-startup-qualification.sh
	bash tests/test-measure-session.sh
	python3 tests/test-herdr-lifecycle.py
