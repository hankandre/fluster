export interface E2ePorts { app: number; fakeHls: number }
export interface TakenPort { port: number; role: "app" | "fakeHls" }
export function e2ePorts(value: string | undefined): E2ePorts;
export function isPortFree(port: number): Promise<boolean>;
export function firstTakenPort(ports: E2ePorts): Promise<TakenPort | null>;
export function portSentence(ports: E2ePorts, taken: TakenPort | null): string | null;
export function checkE2ePorts(value: string | undefined): Promise<E2ePorts>;
