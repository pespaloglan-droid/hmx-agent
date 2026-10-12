"""Exact-home, exact-installation read-only controller registry; no agent lane binding."""
from __future__ import annotations
import hashlib
import threading
from dataclasses import dataclass

from gateway.browser_control_broker import BrowserControlError, ControllerScope, get_browser_control_broker
from hermes_cli.browser_connector_result import READ_RESULTS

CAPABILITIES = frozenset(READ_RESULTS)


def readonly_principal(home, user_id, provider):
    value = f"{provider}\0{user_id}\0{home}".encode()
    return 'readonly:' + hashlib.sha256(value).hexdigest()


@dataclass
class Connection:
    scope: ControllerScope
    owner: object
    busy: bool = False


class BrowserConnectorRegistry:
    def __init__(self, broker=None):
        self.broker = broker if broker is not None else get_browser_control_broker()
        self._lock = threading.RLock()
        self._connections: dict[tuple[str, str], Connection] = {}

    def attach(self, info, owner, send):
        key = (info['hermes_home'], info['browser_profile_id'])
        principal = readonly_principal(key[0], info['user_id'], info['provider'])
        scope = ControllerScope(principal_id=principal, profile_id=info['hermes_profile'],
            session_id=info['session_id'], controller_id=info['install_id'],
            browser_profile_id=key[1], transport_family='dashboard-readonly', capabilities=CAPABILITIES)
        with self._lock:
            if key in self._connections:
                raise ValueError('already_connected')
            self.broker.attach(scope, send, owner=owner)
            self._connections[key] = Connection(scope, owner)
        return scope

    def list(self, home, *, principal_id=None):
        with self._lock:
            return [{'browser_profile_id': key[1], 'install_id': row.scope.controller_id,
                     'state': 'connected_readonly', 'busy': row.busy}
                    for key, row in self._connections.items() if key[0] == home and (principal_id is None or row.scope.principal_id == principal_id)]

    def detach(self, home, browser_profile_id, *, owner=None, principal_id=None):
        key = (home, browser_profile_id)
        with self._lock:
            row = self._connections.get(key)
            if (row is None or (owner is not None and row.owner is not owner)
                    or (principal_id is not None and row.scope.principal_id != principal_id)):
                return None
            del self._connections[key]
        self.broker.detach(row.scope, owner=row.owner, notify_controller=False)
        return row.owner

    def read(self, home, browser_profile_id, action, *, principal_id=None):
        if action not in READ_RESULTS:
            return {'state': 'invalid_request'}
        key = (home, browser_profile_id)
        with self._lock:
            row = self._connections.get(key)
            if row is None or (principal_id is not None and row.scope.principal_id != principal_id):
                return {'state': 'not_connected'}
            if row.busy:
                return {'state': 'busy'}
            row.busy = True
        try:
            result = self.broker.dispatch(row.scope, action=action, arguments={})
            return READ_RESULTS[action](result)
        except (BrowserControlError, OSError, RuntimeError, TimeoutError):
            return {'state': 'controller_read_failed'}
        finally:
            with self._lock:
                if self._connections.get(key) is row:
                    row.busy = False


REGISTRY = BrowserConnectorRegistry()
