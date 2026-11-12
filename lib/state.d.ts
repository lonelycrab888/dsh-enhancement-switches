import { z } from 'zod';
import type { SessionEvent, SessionHeader, SessionLogOffset } from '@deepseek-ai/dsh-session';
declare const features: readonly ["ralph", "teams", "codex"];
export type Feature = typeof features[number];
export interface Selection {
    ralph: boolean;
    codex: boolean;
}
export interface SwitchView extends Selection {
    child: boolean;
}
export interface SwitchState extends SwitchView {
    inherited: number;
    legacyTeams?: boolean;
    hasNativeTeamMode: boolean;
    pending: Array<{
        id: string;
        feature: Feature;
        enabled: boolean;
    }>;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionMap {
        agentswitch: SwitchView;
    }
}
export declare function parseSelection(input: string): {
    feature: Feature;
    enabled: boolean;
} | undefined;
export declare const projection: {
    key: "agentswitch";
    stateVersion: number;
    stateSchema: z.ZodObject<{
        ralph: z.ZodBoolean;
        codex: z.ZodBoolean;
        child: z.ZodBoolean;
        inherited: z.ZodNumber;
        legacyTeams: z.ZodOptional<z.ZodBoolean>;
        hasNativeTeamMode: z.ZodBoolean;
        pending: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            feature: z.ZodEnum<{
                ralph: "ralph";
                teams: "teams";
                codex: "codex";
            }>;
            enabled: z.ZodBoolean;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    init: (header: SessionHeader, inherited: SessionLogOffset) => SwitchState;
    apply(state: SwitchState, event: SessionEvent): SwitchState;
    wire: {
        viewSchema: z.ZodObject<{
            ralph: z.ZodBoolean;
            codex: z.ZodBoolean;
            child: z.ZodBoolean;
        }, z.core.$strip>;
        view: ({ ralph, codex, child }: SwitchState) => SwitchView;
    };
};
export {};
