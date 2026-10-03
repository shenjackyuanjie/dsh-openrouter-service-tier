import z from '@deepseek-ai/schemastery';
import type { Volatile } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';
import { wrapProvider } from './provider.js';
import type { TierResolver } from './provider.js';

/** OpenRouter 文档明确列出的顶层 service_tier 值；不接受 auto/standard。 */
export const SERVICE_TIERS = ['default', 'flex', 'priority', 'fast', 'ultrafast'] as const;
export type ServiceTier = typeof SERVICE_TIERS[number];
/** `omit` 是配置层选择，表示该模型不发送 service_tier，不是协议取值。 */
export const TIER_CHOICES = [...SERVICE_TIERS, 'omit'] as const;
export type TierChoice = typeof TIER_CHOICES[number];
export const REASONING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

const catalogModels = openrouterProvider().getModels();
const supportedModelIds = catalogModels.filter((model) => model.api === 'openai-completions').map((model) => model.id);

const BaseConfig = z.object({
  provider: z.string().pattern(/^(?!openrouter$)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/).default('openrouter-tier'),
  apiKeyEnv: z.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).role('credential-ref').default('OPENROUTER_API_KEY'),
  serviceTier: z.union(SERVICE_TIERS),
  modelServiceTiers: z.array(z.object({
    model: z.string(),
    tier: z.union([...SERVICE_TIERS, 'omit']),
  })),
  models: z.transform(z.array(z.string()).min(1).default(supportedModelIds), (ids) => {
    if (new Set(ids).size !== ids.length) throw new TypeError('models 不得重复');
    for (const id of ids) {
      if (!supportedModelIds.includes(id)) throw new TypeError(`固定 pi-ai 目录没有支持的 Chat Completions 模型 "${id}"`);
    }
    return ids;
  }, true),
  reasoning: z.union(REASONING_LEVELS),
  baseURL: z.transform(z.string(), (value) => {
    if (value === undefined) return value;
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError('baseURL 必须是无凭据、查询参数和片段的 HTTP(S) 地址');
    }
    return value;
  }, true),
  timeoutMs: z.natural(),
  streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(2_147_483_647).default(300_000),
});

export interface ModelTierOverride {
  /** 已在本插件 models 列表中的 OpenRouter 模型 id。 */
  model: string;
  /** 该模型的档位；`omit` 表示即使全局设置了档位也不发送 service_tier。 */
  tier: TierChoice;
}

export interface Options {
  provider?: string;
  apiKeyEnv?: string;
  serviceTier?: ServiceTier | null;
  modelServiceTiers?: ModelTierOverride[];
  models?: string[];
  reasoning?: typeof REASONING_LEVELS[number];
  baseURL?: string;
  timeoutMs?: number;
  streamIdleTimeoutMs?: number;
}

/** 按模型覆盖优先于全局档位；`omit` 明确表示不发送。 */
export function tierFor(globalTier: ServiceTier | undefined, overrides: readonly ModelTierOverride[] | undefined, modelId: string): ServiceTier | undefined {
  const chosen = overrides?.find((entry) => entry.model === modelId)?.tier ?? globalTier;
  return chosen === undefined || chosen === 'omit' ? undefined : chosen;
}

/** 只有至少存在一个生效档位时才包装请求；否则保持上游行为完全不变。 */
function tierResolver(globalTier: ServiceTier | undefined, overrides: readonly ModelTierOverride[] | undefined, selected: readonly string[]): TierResolver | undefined {
  if (overrides !== undefined) {
    if (new Set(overrides.map((entry) => entry.model)).size !== overrides.length) throw new TypeError('modelServiceTiers 不得对同一模型重复设置');
    for (const entry of overrides) {
      if (!selected.includes(entry.model)) throw new TypeError(`modelServiceTiers 的模型 "${entry.model}" 不在本插件的 models 列表中`);
      if (!TIER_CHOICES.includes(entry.tier)) throw new TypeError(`modelServiceTiers 的档位 "${entry.tier}" 不受支持`);
    }
  }
  if (globalTier === undefined && (overrides === undefined || overrides.length === 0)) return undefined;
  return (modelId) => tierFor(globalTier, overrides, modelId);
}

/** 只装配已知 OpenRouter Chat Completions 模型，不猜测未知模型的能力。 */
export function resolveProfile(options: Options): ResolvedPiAiProviderProfile {
  const config = BaseConfig(options);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(config.provider)) {
    throw new TypeError('provider 必须是小写、连字符分隔的路由名称');
  }
  if (config.provider === 'openrouter') {
    throw new TypeError('请使用独立路由；本插件不接管原 openrouter 路由');
  }
  const ref = credentialRef(config.apiKeyEnv);
  if (config.models !== undefined && (config.models.length === 0 || new Set(config.models).size !== config.models.length)) {
    throw new TypeError('models 必须非空且不得重复');
  }
  if (config.baseURL !== undefined) {
    const url = new URL(config.baseURL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError('baseURL 必须是无凭据、查询参数和片段的 HTTP(S) 地址');
    }
  }
  const upstream = openrouterProvider();
  const catalog = upstream.getModels();
  const selected = config.models ?? catalog.filter((model) => model.api === 'openai-completions').map((model) => model.id);
  const models = selected.map((id) => {
    const known = catalog.find((model) => model.id === id);
    if (!known) throw new TypeError(`pi-ai 0.87.1 OpenRouter 目录中没有模型 "${id}"；本插件不虚构模型元数据`);
    if (known.api !== 'openai-completions') throw new TypeError(`模型 "${id}" 不是本插件支持的 Chat Completions 模型`);
    const model = structuredClone(known);
    model.provider = config.provider;
    if (config.baseURL !== undefined) model.baseUrl = config.baseURL.replace(/\/+$/, '');
    return model;
  });
  const piProvider = wrapProvider(upstream, config.provider, models, tierResolver(config.serviceTier ?? undefined, config.modelServiceTiers, selected));
  return {
    provider: config.provider,
    displayName: 'OpenRouter (service tier)',
    apiKeyEnv: ref,
    piProvider,
    reasoning: config.reasoning,
    timeoutMs: config.timeoutMs,
    streamIdleTimeoutMs: config.streamIdleTimeoutMs,
    maxRequestImageBytes: 20 * 1024 * 1024,
    requestImagePixelBudget: 4_194_304,
    requestImageMaxBytes: 1_048_576,
    retryPolicy: {
      mode: 'normal',
      maxRetries: 5,
      retryableCodes: ['EMPTY_RESPONSE', 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT'],
      initialDelayMs: 500,
      maxDelayMs: 10_000,
      jitterRatio: 0.1,
    },
    modelErrors: new Map(),
    configuredMaxTokens: new Map(),
  };
}

export interface PluginConfig extends Omit<Options, 'serviceTier' | 'modelServiceTiers'> {
  serviceTier: Volatile<ServiceTier | undefined>;
  modelServiceTiers: Volatile<ModelTierOverride[] | undefined>;
}

// 仅档位允许通过宿主配置表单热更新；连接与凭据仍是普通配置。
const RuntimeConfig = z.object({
  ...BaseConfig.dict!,
  serviceTier: z.union(SERVICE_TIERS).description('请求服务档位；不设置时不发送 service_tier').volatile(),
  modelServiceTiers: z.array(z.object({
    model: z.string(),
    tier: z.union([...SERVICE_TIERS, 'omit']),
  })).description('按模型覆盖档位；omit 表示该模型不发送 service_tier').volatile(),
});

/** 固定对象路径上的 volatile 字段可供宿主表单投影与持久化。 */
export const Config: z<Options, PluginConfig> = RuntimeConfig;
