import type { SwitchView, Feature } from './state.ts';
export declare const inject: string[];
interface Props {
    useProjection(key: 'agentswitch'): SwitchView | undefined;
    choose(feature: Feature, enabled: boolean): Promise<void>;
}
export declare function Switches({ useProjection, choose }: Props): import("react").JSX.Element | null;
interface ClientContext {
    effect(callback: () => (() => void)): unknown;
    slots: {
        inject(name: string, mount: () => unknown): unknown;
        register(options: Record<string, unknown>, component: typeof Switches): unknown;
    };
    sessions: {
        binding(id: string): {
            session: {
                command(line: string): Promise<{
                    ok: true;
                    value: {
                        matched: boolean;
                    };
                } | {
                    ok: false;
                    error: {
                        message: string;
                    };
                }>;
            };
        } | undefined;
    };
}
export declare function apply(ctx: ClientContext): void;
export {};
