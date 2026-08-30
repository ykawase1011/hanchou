PROFILE ?= work

.PHONY: plan apply apply-all doctor agents manifest manifest-check check open-tasks handoff

plan:
	./bin/hanchou plan $(PROFILE)

apply:
	./bin/hanchou apply $(PROFILE) --yes

apply-all:
	./bin/hanchou apply $(PROFILE) --yes --install-upstream

doctor:
	./bin/hanchou doctor $(PROFILE)

agents:
	./bin/hanchou render-agents

manifest:
	python3 scripts/manifest.py generate

manifest-check:
	python3 scripts/manifest.py check

check:
	./bin/hanchou render-agents --check
	mise exec -- python3 scripts/validate.py
	bash tests/test-relay.sh
	bash tests/test-delivery.sh
	bash tests/test-execution.sh
	bash tests/test-cli.sh
	python3 scripts/manifest.py check

open-tasks:
	./bin/hanchou open tasks $(PROFILE)

handoff:
	./bin/hanchou handoff
