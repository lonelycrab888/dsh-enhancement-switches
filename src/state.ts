import { z } from 'zod'
import type { SessionEvent, SessionHeader, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

export type Feature = 'ralph' | 'teams'
export interface Selection { ralph: boolean; teams: boolean }
export interface SwitchView extends Selection { child: boolean }
export interface SwitchState extends SwitchView {
  inherited: number
  pending: Array<{ id: string; feature: Feature; enabled: boolean }>
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { agentswitch: SwitchView }
}

export function parseSelection(input: string): { feature: Feature; enabled: boolean } | undefined {
  const match = /^(ralph|teams)\s+(on|off)$/.exec(input.trim())
  if (!match) return undefined
  return { feature: match[1] as Feature, enabled: match[2] === 'on' }
}

type HostProjection = ProjectionDefinition<'agentswitch', SwitchState>
type HostWire = NonNullable<HostProjection['wire']>
// DSH pins an older Zod minor. Its registry only calls schema.parse(), which
// is compatible with our patched Zod. Bridge only the two schema objects to
// avoid TypeScript recursively comparing two different Zod class hierarchies.
// Both persisted-state and wire parsing are exercised by the real-host tests.
export const projection: HostProjection & { wire: HostWire } = {
  key: 'agentswitch' as const,
  stateVersion: 1,
  stateSchema: z.object({
    ralph: z.boolean(), teams: z.boolean(), child: z.boolean(), inherited: z.number(),
    pending: z.array(z.object({ id: z.string(), feature: z.enum(['ralph', 'teams']), enabled: z.boolean() })),
  }) as unknown as HostProjection['stateSchema'],
  init: (header: SessionHeader, inherited: SessionLogOffset): SwitchState => ({
    ralph: false, teams: false, child: header.origin === 'subagent', inherited, pending: [],
  }),
  apply(state: SwitchState, event: SessionEvent): SwitchState {
    if (event.seq < state.inherited) return state
    if (event.type === 'command/run' && event.data.name === 'agentswitch') {
      const selection = parseSelection(event.data.args ?? '')
      if (!selection) return state
      return { ...state, pending: [...state.pending, { id: event.data.commandId, ...selection }] }
    }
    if (event.type !== 'command/done') return state
    const attempt = state.pending.find(item => item.id === event.data.commandId)
    if (!attempt) return state
    const next = { ...state, pending: state.pending.filter(item => item !== attempt) }
    if (event.data.kind === 'success') next[attempt.feature] = attempt.enabled
    return next
  },
  wire: {
    viewSchema: z.object({ ralph: z.boolean(), teams: z.boolean(), child: z.boolean() }) as unknown as HostWire['viewSchema'],
    view: ({ ralph, teams, child }: SwitchState): SwitchView => ({ ralph, teams, child }),
  },
}
