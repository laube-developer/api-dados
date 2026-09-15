import { AsyncLocalStorage } from "node:async_hooks";
import type { ConfigEstoquePorDominio } from "../../../utils/interfaces.js";

const store = new AsyncLocalStorage<ConfigEstoquePorDominio>();

export function runWithEstoqueTenant<T>(
    cfg: ConfigEstoquePorDominio,
    fn: () => T
): T {
    return store.run(cfg, fn);
}

export function estoqueTenantAtual(): ConfigEstoquePorDominio | undefined {
    return store.getStore();
}
