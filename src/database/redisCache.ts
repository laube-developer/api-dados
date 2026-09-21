import { createClient, type RedisClientType } from "redis";

type Envelope<T> = { dados: T };

let client: RedisClientType | null = null;
let conectando: Promise<RedisClientType | null> | null = null;
const memoria = new Map<string, { expiraEm: number; valor: unknown }>();

/** 8h–18h America/Sao_Paulo: 3 min. Fora: 1 h. Só preenche no request (sem job que bata na Notion). */
export function ttlCacheSegundos(): number {
    const hora = Number(
        new Intl.DateTimeFormat("en-GB", {
            timeZone: "America/Sao_Paulo",
            hour: "2-digit",
            hourCycle: "h23",
        }).format(new Date())
    );
    if (hora >= 8 && hora < 18) {
        return 3 * 60;
    }
    return 60 * 60;
}

function urlRedis(): string {
    const bruto = String(process.env.REDIS_URL ?? "").trim() || "redis://127.0.0.1:6379";
    const senha = String(process.env.REDIS_PASSWORD ?? "").trim();
    if (!senha || bruto.includes("@")) {
        return bruto;
    }
    try {
        const u = new URL(bruto);
        u.password = senha;
        return u.toString();
    } catch {
        return bruto;
    }
}

async function obterCliente(): Promise<RedisClientType | null> {
    if (client?.isOpen) {
        return client;
    }
    if (conectando) {
        return conectando;
    }

    const url = urlRedis();
    conectando = (async () => {
        try {
            const c = createClient({ url }) as RedisClientType;
            c.on("error", (erro) => {
                console.error("[redis]", erro);
            });
            await c.connect();
            client = c;
            return c;
        } catch (erro) {
            console.error("[redis] cache desligado:", erro);
            return null;
        } finally {
            conectando = null;
        }
    })();

    return conectando;
}

export async function comCache<T>(chave: string, carregar: () => Promise<T>): Promise<T> {
    const agora = Date.now();
    const local = memoria.get(chave);
    if (local && agora < local.expiraEm) {
        return local.valor as T;
    }

    try {
        const redis = await obterCliente();
        if (redis) {
            const bruto = await redis.get(chave);
            if (bruto !== null) {
                const envelope = JSON.parse(bruto) as Envelope<T>;
                memoria.set(chave, {
                    expiraEm: agora + ttlCacheSegundos() * 1000,
                    valor: envelope.dados,
                });
                return envelope.dados;
            }
        }
    } catch (erro) {
        console.error("[redis] leitura ignorada:", erro);
    }

    const dados = await carregar();
    const expiraEm = agora + ttlCacheSegundos() * 1000;
    memoria.set(chave, { expiraEm, valor: dados });

    try {
        const redis = await obterCliente();
        if (redis) {
            const envelope: Envelope<T> = { dados };
            await redis.set(chave, JSON.stringify(envelope), { EX: ttlCacheSegundos() });
        }
    } catch (erro) {
        console.error("[redis] gravação ignorada:", erro);
    }

    return dados;
}
