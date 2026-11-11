/** Scoped model-facing tools for the opt-in Agent Teams runtime. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { Agent } from '@deepseek-ai/dsh-agent';
/** Cordis plugin name. */
export declare const name = "tool-agent-team";
/** Services required by the Team tool plugin. */
export declare const inject: string[];
/** Tool routing configuration. */
export interface Config {
    /** Register `interrupt_agent` and its policy guidance. Defaults to true; false leaves the domain API available. */
    readonly interrupt?: boolean;
    /** Continuable-subagent provider used for fresh teammates. */
    readonly freshProvider?: string;
    /** Continuable-subagent provider used for completed-prefix fork teammates. */
    readonly forkProvider?: string;
}
/** Loader schema for the opt-in Team tool plugin. */
export declare const Config: z<Config>;
/** Register the complete Team tool set in one exact Agent scope. */
export declare function installTeamTools(agent: Agent, ctx: Context, config: Required<Config>, enabled: () => boolean): () => void;
