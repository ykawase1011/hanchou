"""Repository fixture helpers; never used by the distributed skills."""
import os
from pathlib import Path
import socket
import subprocess
import tempfile


CALLER_BINDINGS = ('HANCHOU_INSTANCE_KEY', 'HANCHOU_INSTANCE_RECORD',
                   'HANCHOU_MISSION_ID', 'HANCHOU_ATTEMPT_ID')


def fixture_environment(**overrides):
    # Fixtures own different instances. Keep the actual caller's environment intact.
    env = {k: v for k, v in os.environ.items() if k not in CALLER_BINDINGS}
    env.update(overrides)
    return env


def require_lifecycle_permissions():
    """Fail once, before resources exist; a blocked check is never a test pass."""
    try:
        result = subprocess.run(['ps', '-p', str(os.getpid()), '-o', 'lstart='],
                                text=True, capture_output=True, check=True)
        if not result.stdout.strip():
            raise RuntimeError('ps returned no process identity')
        with tempfile.TemporaryDirectory(prefix='hl-perm-', dir='/tmp') as tmp:
            with socket.socket(socket.AF_UNIX) as sock:
                sock.bind(str(Path(tmp) / 's'))
    except (OSError, subprocess.CalledProcessError, RuntimeError) as exc:
        raise RuntimeError(
            'Lifecycle checks require process inspection (ps) and local Unix sockets. '
            'The current execution environment blocks these prerequisites. '
            'Use the host approval flow for this exact test command; do not disable '
            'the sandbox globally or skip these checks. No lifecycle fixture was created.'
        ) from exc


if __name__ == '__main__':
    require_lifecycle_permissions()
    print('lifecycle test permissions: ok')
