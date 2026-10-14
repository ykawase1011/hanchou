.PHONY: check check-installer check-status-view-browser

check:
	bash scripts/validate.sh
	bash tests/test-repository.sh

# Opt-in network test in a disposable container; no host skill installation.
check-installer:
	bash tests/test-installer.sh

# Test-only: supply Playwright using NODE_PATH and a private PLAYWRIGHT_BROWSERS_PATH.
check-status-view-browser:
	node tests/status-view-browser.cjs
