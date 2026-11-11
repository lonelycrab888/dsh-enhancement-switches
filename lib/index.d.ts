import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
export declare const name = "agentswitch";
export declare const inject: string[];
export interface Config {
    maxRounds: number;
    codexModel?: string;
}
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    maxRounds: Schema<number, number, "defined">;
    codexModel: Schema<string, string, "plain">;
}>>, Schemastery.ObjectT<NoInfer<{
    maxRounds: Schema<number, number, "defined">;
    codexModel: Schema<string, string, "plain">;
}>>, "plain">;
/** Scope ownership keeps global bundles and ordinary presets independent. */
export declare function apply(ctx: Context, config?: Config): Promise<void>;
