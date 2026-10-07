import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.js';
import { registerTierSettings } from './tier-settings.js';
import { registerTierCommand } from './tier-command.js';

export { Config };
export type { Options, PluginConfig } from './config.js';
export const name = 'openrouter-service-tier';
export const inject = ['llm'];

/** 只注册控制贡献，不注册 adapter、模型目录或凭据。 */
export function apply(ctx: Context): void {
  registerTierSettings(ctx);
  registerTierCommand(ctx);
}
