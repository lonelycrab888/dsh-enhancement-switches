import { useState } from 'react'
import type { SwitchView, Feature } from './state.ts'

export const inject = ['slots', 'sessions']
interface Props {
  useProjection(key: 'agentswitch'): SwitchView | undefined
  choose(feature: Feature, enabled: boolean): Promise<void>
}

const buttons = {
  ralph: { label: 'Ralph Loop', title: '为当前对话开放 Ralph 工具。请在消息中明确要求迭代任务。关闭后，已开始的调用可继续完成，使用停止按钮取消。' },
  teams: { label: 'Agent Teams', title: '为当前对话及其团队成员开放协作工具。关闭后，已开始的工作可继续完成。' },
  codex: { label: 'Codex Subagent', title: '让当前对话可以把单次任务交给 Codex。开启开关不会启动 Codex。' },
} satisfies Record<Feature, { label: string; title: string }>

export function Switches({ useProjection, choose }: Props) {
  const state = useProjection('agentswitch')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!state || state.child) return null
  async function change(feature: Feature) {
    if (busy || !state) return
    setBusy(true)
    setError('')
    try { await choose(feature, !state[feature]) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  return <div className="dsh-agentswitch" aria-busy={busy}>
    {(Object.keys(buttons) as Feature[]).map(feature => <button
      key={feature} type="button" role="switch" aria-checked={state[feature]}
      aria-label={buttons[feature].label}
      title={buttons[feature].title}
      disabled={busy} onClick={() => void change(feature)}>
      <span className="dsh-agentswitch-track"><span /></span>
      {buttons[feature].label}
    </button>)}
    {error && <span role="alert" className="dsh-agentswitch-error">{error}</span>}
  </div>
}

interface ClientContext {
  effect(callback: () => (() => void)): unknown
  slots: {
    inject(name: string, mount: () => unknown): unknown
    register(options: Record<string, unknown>, component: typeof Switches): unknown
  }
  sessions: {
    binding(id: string): { session: { command(line: string): Promise<
      { ok: true; value: { matched: boolean } } | { ok: false; error: { message: string } }
    > } } | undefined
  }
}

export function apply(ctx: ClientContext) {
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = `
      /* Follow the host input card in both the blank and active conversation.
         The input dock itself spans the entire conversation column. */
      .dsh-agentswitch{
        --agentswitch-accent:var(--dsw-alias-state-business-primary,#4c70ee);
        box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:8px;
        width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px));
        max-width:var(--dsh-composer-card-max-width,780px);min-width:0;
        margin:0 auto;padding:2px 0;
      }
      .dsh-agentswitch button{
        box-sizing:border-box;display:inline-flex;align-items:center;gap:7px;
        min-height:28px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l2,#dce0e6);
        border-radius:999px;background:var(--dsw-specific-input-major,transparent);
        color:var(--dsw-alias-label-secondary,inherit);font:inherit;
        font-size:calc(12px + var(--dsh-content-font-delta-secondary,0px));line-height:18px;
        white-space:nowrap;cursor:pointer;
        transition:background-color .12s,border-color .12s,color .12s;
      }
      @media(hover:hover){.dsh-agentswitch button:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover,#f3f5f8)}}
      .dsh-agentswitch button[aria-checked=true]{
        color:var(--agentswitch-accent);
        border-color:color-mix(in srgb,var(--agentswitch-accent) 45%,transparent);
        background:color-mix(in srgb,var(--agentswitch-accent) 8%,var(--dsw-specific-input-major,#fff));
      }
      .dsh-agentswitch button:focus-visible{outline:2px solid var(--agentswitch-accent);outline-offset:2px}
      .dsh-agentswitch button:disabled{opacity:.6;cursor:wait}
      .dsh-agentswitch-track{display:inline-flex;flex:none;align-items:center;width:24px;height:14px;border-radius:8px;background:var(--dsw-alias-label-tertiary,#87919e);padding:2px;box-sizing:border-box}
      .dsh-agentswitch-track span{width:10px;height:10px;background:white;border-radius:50%;transition:transform .12s}
      .dsh-agentswitch [aria-checked=true] .dsh-agentswitch-track{background:var(--agentswitch-accent)}
      .dsh-agentswitch [aria-checked=true] .dsh-agentswitch-track span{transform:translateX(10px)}
      .dsh-agentswitch-error{flex-basis:100%;font-size:12px;color:#d64545;overflow-wrap:anywhere}
      @media(prefers-reduced-motion:reduce){.dsh-agentswitch button,.dsh-agentswitch-track span{transition:none}}
    `
    document.head.append(style)
    return () => style.remove()
  })
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock', id: 'agentswitch', order: 110, label: 'Enhancement Switches',
    inject: (sessionId: string) => ({
      async choose(feature: Feature, enabled: boolean) {
        const session = ctx.sessions.binding(sessionId)?.session
        if (!session) throw new Error('会话暂不可用')
        const result = await session.command(`/agentswitch ${feature} ${enabled ? 'on' : 'off'}`)
        if (!result.ok) throw new Error(result.error.message)
        if (!result.value.matched) throw new Error('Enhancement Switches 命令未加载')
      },
    }),
  }, Switches))
}
