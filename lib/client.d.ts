import type { SwitchView, Feature } from './state.ts';
export declare const inject: string[];
interface Props {
    useProjection(key: 'agentswitch'): SwitchView | undefined;
    useProjection(key: 'agentTeam', select: (mode: {
        enabled: boolean;
    } | undefined) => boolean | undefined): boolean | undefined;
    choose(feature: Feature, enabled: boolean): Promise<void>;
}
export declare function Switches({ useProjection, choose }: Props): import("react").JSX.Element | null;
interface ClientContext {
    effect(callback: () => (() => void)): unknown;
    slots: {
        inject(name: string, mount: () => unknown): unknown;
        register(options: Record<string, unknown>, component: typeof Switches): unknown;
    };
    remote: {
        commands: {
            execute(sessionId: string, line: string, attachments: []): Promise<{
                ok: true;
                value: {
                    result: {
                        kind: string;
                        text?: string;
                    };
                } | undefined;
            } | {
                ok: false;
                error: {
                    message: string;
                };
            }>;
        };
    };
}
export declare function apply(ctx: ClientContext): void;
export {};
