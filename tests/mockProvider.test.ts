import { describe, expect, it } from 'vitest';
import { MockAgentProvider } from '../src/mockProvider';

describe('MockAgentProvider', () => {
  it('runs the normalized workflow, waits for approval, and completes', () => {
    const provider = new MockAgentProvider();
    const events: string[] = [];
    provider.subscribe(event => events.push(event.type));
    provider.prompt('codex-bridge', 'Implement bridge');
    provider.tick(24);
    expect(provider.waiting).toBe(true);
    expect(events).toContain('APPROVAL_REQUESTED');
    expect(provider.workspace.projects[0].files[0]).toMatchObject({ state: 'modified', additions: 14, deletions: 3 });
    provider.resolveApproval(provider.pendingRequest!, true);
    provider.tick(12);
    expect(provider.running).toBe(false);
    expect(events.at(-1)).toBe('SESSION_COMPLETED');
    expect(provider.workspace.projects[0].sessions[0].terminals[0]).toMatchObject({ state: 'completed', exitCode: 0 });
  });

  it('rejects stale approvals and cancels the active terminal', () => {
    const provider = new MockAgentProvider();
    provider.prompt('codex-bridge', 'Implement bridge');
    provider.tick(24);
    expect(() => provider.resolveApproval('stale', true)).toThrow(/no longer active/);
    provider.cancel('codex-bridge');
    expect(provider.running).toBe(false);
    expect(provider.workspace.projects[0].sessions[0].terminals[0]).toMatchObject({ state: 'cancelled', exitCode: 130 });
  });
});
