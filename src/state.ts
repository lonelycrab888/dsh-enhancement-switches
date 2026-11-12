import { z } from 'zod'
import type { SessionEvent, SessionHeader, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type {} from '@deepseek-ai/dsh-agent-team'

const features = ['ralph', 'teams', 'codex'] as const
export type Feature = typeof features[number]
export interface Selection { ralph: boolean; codex: boolean }
export interface SwitchView extends Selection { child: boolean }
export interface SwitchState extends SwitchView {
  inherited: number
  legacyTeams?: boolean
  hasNativeTeamMode: boolean
  pending: Array<{ id: string; feature: Feature; enabled: boolean }>
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap { agentswitch: SwitchView }
}

export function parseSelection(input: string): { feature: Feature; enabled: boolean } | undefined {
  const match = /^(ralph|teams|codex)\s+(on|off)$/.exec(input.trim())
  if (!match) return undefined
  return { feature: match[1] as Feature, enabled: match[2] === 'on' }
}

export const projection = {
  key: 'agentswitch' as const,
  stateVersion: 2,
  stateSchema: z.object({
    ralph: z.boolean(), codex: z.boolean(), child: z.boolean(), inherited: z.number(),
    legacyTeams: z.boolean().optional(), hasNativeTeamMode: z.boolean(),
    pending: z.array(z.object({ id: z.string(), feature: z.enum(features), enabled: z.boolean() })),
  }),
  init: (header: SessionHeader, inherited: SessionLogOffset): SwitchState => ({
    ralph: false, codex: false, child: header.origin === 'subagent', inherited, hasNativeTeamMode: false, pending: [],
  }),
  apply(state: SwitchState, event: SessionEvent): SwitchState {
    if (event.seq < state.inherited) return state
    if (event.type === 'team/mode') return { ...state, hasNativeTeamMode: true, legacyTeams: undefined }
    if (event.type === 'command/run' && event.data.name === 'agentswitch') {
      const selection = parseSelection(event.data.args ?? '')
      if (!selection || (selection.feature === 'teams' && state.hasNativeTeamMode)) return state
      return { ...state, pending: [...state.pending, { id: event.data.commandId, ...selection }] }
    }
    if (event.type !== 'command/done') return state
    const attempt = state.pending.find(item => item.id === event.data.commandId)
    if (!attempt) return state
    const next = { ...state, pending: state.pending.filter(item => item !== attempt) }
    if (event.data.kind === 'success') {
      if (attempt.feature !== 'teams') next[attempt.feature] = attempt.enabled
      else if (!next.hasNativeTeamMode) next.legacyTeams = attempt.enabled
    }
    return next
  },
  wire: {
    viewSchema: z.object({ ralph: z.boolean(), codex: z.boolean(), child: z.boolean() }),
    view: ({ ralph, codex, child }: SwitchState): SwitchView => ({ ralph, codex, child }),
  },
} satisfies ProjectionDefinition<'agentswitch', SwitchState>
