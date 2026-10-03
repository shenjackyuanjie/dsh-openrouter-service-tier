import type { Context } from '@deepseek-ai/cordis';
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { PiAiAdapterOptions } from '@deepseek-ai/dsh-llm-pi-ai';
import { Config, resolveProfile } from './config.js';
import type { PluginConfig } from './config.js';
import { registerTierSettings } from './tier-settings.js';

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

export function apply(ctx: Context, options: PluginConfig): void {
  // tier 更新构造新的 profile Map；已准备请求持有旧 Map 与 provider。
  let lastTier = options.serviceTier.get() ?? undefined;
  const profile = resolveProfile({ ...options, serviceTier: lastTier });
  let snapshot = new Map([[profile.provider, profile]]);
  const profiles = () => {
    const tier = options.serviceTier.get() ?? undefined;
    if (tier !== lastTier) {
      const next = resolveProfile({ ...options, serviceTier: tier });
      snapshot = new Map([[next.provider, next]]);
      lastTier = tier;
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
  registerTierSettings(ctx);
}
