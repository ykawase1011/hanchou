PROFILE ?= work

.PHONY: plan apply apply-all doctor agents check open-tasks handoff

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

check:
	./bin/hanchou render-agents --check
	mise exec -- python3 scripts/validate.py
	bash tests/test-relay.sh
	bash tests/test-delivery.sh
	bash tests/test-execution.sh
	bash tests/test-cli.sh
	shasum -a 256 -c MANIFEST.sha256

open-tasks:
	./bin/hanchou open tasks $(PROFILE)

handoff:
	./bin/hanchou handoff
