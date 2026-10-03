import type { Api, Model, Provider, ProviderRequestOptions } from '@earendil-works/pi-ai';
import type { ServiceTier } from './config.js';

/** 先执行原回调（保留替换结果），最后注入本插件拥有的 tier。 */
export function withServiceTier<T extends ProviderRequestOptions>(options: T | undefined, tier: ServiceTier | undefined): T | undefined {
  if (tier === undefined) return options;
  const previous = options?.onPayload;
  return {
    ...options,
    onPayload: async (payload: unknown, model: Model<Api>) => {
      const changed = await previous?.(payload, model);
      const finalPayload = changed === undefined ? payload : changed;
      if (finalPayload === null || typeof finalPayload !== 'object' || Array.isArray(finalPayload)) {
        throw new TypeError('OpenRouter service tier 需要对象形式的请求 payload');
      }
      return { ...finalPayload, service_tier: tier };
    },
  } as T;
}

/** 仅包装插件自有 provider 对象；不修改 upstream 或全局 fetch。 */
export function wrapProvider(upstream: Provider, route: string, models: readonly Model<Api>[], tier?: ServiceTier): Provider {
  return {
    id: route,
    name: 'OpenRouter (service tier)',
    baseUrl: upstream.baseUrl,
    auth: upstream.auth,
    getModels: () => models,
    stream: (model, context, options) => upstream.stream(model, context, withServiceTier(options, tier)),
    streamSimple: (model, context, options) => upstream.streamSimple(model, context, withServiceTier(options, tier)),
  };
}
