import z from '@deepseek-ai/schemastery';

/** OpenRouter 顶层 service_tier 的协议值。 */
export const SERVICE_TIERS = ['default', 'flex', 'priority', 'fast', 'ultrafast'] as const;
export type ServiceTier = typeof SERVICE_TIERS[number];
/** omit 仅用于配置，永远不发到协议中。 */
export const TIER_CHOICES = [...SERVICE_TIERS, 'omit'] as const;
export type TierChoice = typeof TIER_CHOICES[number];
export interface ModelTierOverride { model: string; tier: TierChoice }

/** 控制插件没有连接、认证或档位配置；档位只存于原生 namespace。 */
export interface Options {}
export type PluginConfig = Options;
export const Config: z<Options> = z.transform(z.dict(z.any()).default({}), (value) => {
  if (Object.keys(value).length > 0) {
    throw new Error('本插件已改为原生 OpenRouter 控制器；请移除旧插件配置，将档位迁移到原生 openrouter profile');
  }
  return value;
}, true);
