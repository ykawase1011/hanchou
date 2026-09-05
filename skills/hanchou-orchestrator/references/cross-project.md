# Cross-project Hanchou

Run from a dedicated Orca folder workspace or repository. Resolve target
repositories, worktrees, agents, and connected servers through the live
`orca-cli` guide. Dispatch each change to a worker located on its target
repository; the coordinator normally integrates results rather than editing all
repositories itself.

The Cross-project Hanchou's Run owns all Tasks it creates, including Tasks whose
workers run elsewhere. Worker location never transfers Task ownership.

A human-readable local policy may contain repository allowlists, preferred
agents/models, review thresholds, and reporting preferences. It must not contain
Run IDs, Task IDs, Dispatch IDs, terminal handles, credentials, or other mutable
execution state.

Do not create a repository registry, discovery daemon, cross-Run dependency
protocol, or shared lock service. For hard filesystem or credential isolation,
use an OS user, VM, or connected Orca server boundary.
