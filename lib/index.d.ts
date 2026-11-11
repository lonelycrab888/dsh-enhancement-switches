import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "agentswitch";
export declare const inject: string[];
export interface Config {
    maxRounds: number;
}
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    maxRounds: Schema<number, number, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    maxRounds: Schema<number, number, "defined">;
}>>, "plain">;
/** Scope ownership keeps global bundles and ordinary presets independent. */
export declare function apply(ctx: Context, config?: Config): Promise<void>;
