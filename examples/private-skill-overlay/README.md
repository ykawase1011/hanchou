# Private Skill overlay example

Do not place company-specific policy, personal identifiers, internal URLs, or
credentials in the public Hanchou or Hanchou Kingdom repositories.

Create a separate private Git repository containing ordinary Agent Skills, pin
it by tag or commit only in the target machine's untracked file:

```text
~/.config/hanchou/<profile>/skills.local.toml
```

Then let `hanchou apply` install it with the machine's existing Git/SSH/`gh`
authentication.

`metadata.internal: true` only hides a Skill from default wildcard discovery;
it does not make the contents private. Credentials remain in provider-native
authentication, the OS keychain, environment, or an approved external secret
manager and must never be embedded in a Skill.
