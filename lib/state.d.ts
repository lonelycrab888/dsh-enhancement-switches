import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
declare const features: readonly ["ralph", "teams", "codex"];
export type Feature = typeof features[number];
export interface Selection {
    ralph: boolean;
    teams: boolean;
    codex: boolean;
}
export interface SwitchView extends Selection {
    child: boolean;
}
export interface SwitchState extends SwitchView {
    inherited: number;
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
type HostProjection = ProjectionDefinition<'agentswitch', SwitchState>;
type HostWire = NonNullable<HostProjection['wire']>;
export declare const projection: HostProjection & {
    wire: HostWire;
};
export {};
