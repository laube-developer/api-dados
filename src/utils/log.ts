export class LogClass {
    static log(message: string, origin: string): void {
        console.log(`[${new Date().toISOString()}] ${origin}: ${message}`);
    }

    static warn(message: string, origin: string): void {
        console.warn(`[${new Date().toISOString()}] ${origin}: ${message}`);
    }

    static error(message: string, origin: string): void {
        console.error(`[${new Date().toISOString()}] ${origin}: ${message}`);
    }
}
