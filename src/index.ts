import type { Context } from '@deepseek-ai/cordis';
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { PiAiAdapterOptions } from '@deepseek-ai/dsh-llm-pi-ai';
import { Config, resolveProfile } from './config.js';
import type { ModelTierOverride, PluginConfig, TierChoice } from './config.js';
import { registerTierSettings } from './tier-settings.js';
import { registerTierCommand } from './tier-command.js';

export { Config };
export type { Options, PluginConfig } from './config.js';
export const name = 'openrouter-service-tier';
export const inject = ['llm', 'credentials'];

/** 本插件仅支持显式凭据引用，禁用 pi-ai 的 OAuth/ambient 回退和写入。 */
const explicitKeyOnlyAuth: PiAiAdapterOptions['auth'] = {
  credentials: {
    read: async () => undefined,
    list: async () => [],
    modify: async () => { throw new Error('本插件不支持 pi-ai 登录或凭据写入'); },
    delete: async () => { throw new Error('本插件不支持 pi-ai 凭据删除'); },
  },
  authContext: { env: async () => undefined, fileExists: async () => false },
};

/** volatile 快照是只读视图；解析配置需要可变的普通数组，这里只做一次浅拷贝。 */
const overridesOf = (list: readonly { readonly model: string; readonly tier: TierChoice }[] | undefined): ModelTierOverride[] | undefined =>
  list === undefined ? undefined : list.map((entry) => ({ model: entry.model, tier: entry.tier }));

export function apply(ctx: Context, options: PluginConfig): void {
  // 档位更新构造新的 profile Map；已准备请求持有旧 Map 与 provider。
  // 覆盖表是数组，用排序后的指纹判断是否真的变化，避免无谓重建。
  const fingerprint = (list: readonly ModelTierOverride[] | undefined) =>
    JSON.stringify([...(list ?? [])].map((entry) => [entry.model, entry.tier]).sort((left, right) => left[0]! < right[0]! ? -1 : left[0]! > right[0]! ? 1 : 0));
  let lastTier = options.serviceTier.get() ?? undefined;
  let lastOverrides = overridesOf(options.modelServiceTiers.get());
  let lastFingerprint = fingerprint(lastOverrides);
  const profile = resolveProfile({ ...options, serviceTier: lastTier, modelServiceTiers: lastOverrides });
  let snapshot = new Map([[profile.provider, profile]]);
  const profiles = () => {
    const tier = options.serviceTier.get() ?? undefined;
    const overrides = overridesOf(options.modelServiceTiers.get());
    const nextFingerprint = fingerprint(overrides);
    if (tier !== lastTier || nextFingerprint !== lastFingerprint) {
      const next = resolveProfile({ ...options, serviceTier: tier, modelServiceTiers: overrides });
      snapshot = new Map([[next.provider, next]]);
      lastTier = tier;
      lastOverrides = overrides;
      lastFingerprint = nextFingerprint;
    }
    return snapshot;
  };
  const adapter = new PiAiAdapter({
    profiles,
    auth: explicitKeyOnlyAuth,
    resolveApiKey: async (provider, snapshot) => {
      const ref = snapshot.apiKeyEnv!;
      const hit = await ctx.credentials.resolve(ref);
      if (!hit?.value) {
        throw new LlmError(`路由 "${provider}" 的凭据引用 ${ref} 未配置`, 'MISSING_CREDENTIAL');
      }
      return assertUsableApiKey(hit.value, name, ref);
    },
    resolveAttachments: () => ctx.get('attachments'),
  });
  ctx.effect(() => ctx.llm.registerAdapter([profile.provider], adapter));
  // 覆盖只允许落在本插件实际装配的模型上；普通配置变化会重建 fiber，因此这里捕获当前快照。
  const knownModels = profile.piProvider?.getModels().map((model) => model.id) ?? [];
  registerTierSettings(ctx, knownModels);
  registerTierCommand(ctx, knownModels);
}
