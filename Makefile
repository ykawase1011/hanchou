.PHONY: check check-installer

check:
	bash scripts/validate.sh
	bash tests/test-repository.sh

# Opt-in network test in a disposable container; no host skill installation.
check-installer:
	bash tests/test-installer.sh
