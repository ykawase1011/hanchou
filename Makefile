.PHONY: check

check:
	bash scripts/validate.sh
	bash tests/test-repository.sh
