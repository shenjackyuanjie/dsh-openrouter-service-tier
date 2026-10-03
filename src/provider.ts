import type { Api, Model, Provider, ProviderRequestOptions } from '@earendil-works/pi-ai';
import type { ServiceTier } from './config.js';

/** 按模型解析本插件拥有的档位；返回 undefined 表示该模型不发送 service_tier。 */
export type TierResolver = (modelId: string) => ServiceTier | undefined;

/** 先执行原回调（保留替换结果），最后注入本插件按模型解析出的 tier。 */
export function withServiceTier<T extends ProviderRequestOptions>(options: T | undefined, resolve: TierResolver): T | undefined {
  const previous = options?.onPayload;
  return {
    ...options,
    onPayload: async (payload: unknown, model: Model<Api>) => {
      const changed = await previous?.(payload, model);
      const finalPayload = changed === undefined ? payload : changed;
      const tier = typeof model?.id === 'string' ? resolve(model.id) : undefined;
      if (tier === undefined) return finalPayload;
      if (finalPayload === null || typeof finalPayload !== 'object' || Array.isArray(finalPayload)) {
        throw new TypeError('OpenRouter service tier 需要对象形式的请求 payload');
      }
      return { ...finalPayload, service_tier: tier };
    },
  } as T;
}

/** 仅包装插件自有 provider 对象；不修改 upstream 或全局 fetch。 */
export function wrapProvider(upstream: Provider, route: string, models: readonly Model<Api>[], resolve?: TierResolver): Provider {
  const withTier = <T extends ProviderRequestOptions>(options: T | undefined) => resolve === undefined ? options : withServiceTier(options, resolve);
  return {
    id: route,
    name: 'OpenRouter (service tier)',
    baseUrl: upstream.baseUrl,
    auth: upstream.auth,
    getModels: () => models,
    stream: (model, context, options) => upstream.stream(model, context, withTier(options)),
    streamSimple: (model, context, options) => upstream.streamSimple(model, context, withTier(options)),
  };
}
