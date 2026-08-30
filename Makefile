PROFILE ?= work

.PHONY: plan apply apply-all doctor agents manifest manifest-check typecheck check open-tasks handoff

plan:
	./bin/hanchou plan $(PROFILE)

apply:
	./bin/hanchou apply $(PROFILE) --yes

apply-all:
	./bin/hanchou apply $(PROFILE) --yes --install-upstream

doctor:
	./bin/hanchou doctor $(PROFILE)

agents:
	mise exec -- node --experimental-strip-types scripts/render-agents.ts

manifest:
	mise exec -- node --experimental-strip-types scripts/manifest.ts generate

manifest-check:
	mise exec -- node --experimental-strip-types scripts/manifest.ts check

typecheck:
	mise exec -- npm run typecheck

check: typecheck
	mise exec -- node --experimental-strip-types scripts/render-agents.ts --check
	mise exec -- node --experimental-strip-types scripts/validate.ts
	mise exec -- bash tests/test-relay.sh
	mise exec -- bash tests/test-delivery.sh
	mise exec -- bash tests/test-projects.sh
	mise exec -- bash tests/test-execution.sh
	mise exec -- bash tests/test-cli.sh
	mise exec -- node --experimental-strip-types scripts/manifest.ts check

open-tasks:
	./bin/hanchou open tasks $(PROFILE)

handoff:
	./bin/hanchou handoff
