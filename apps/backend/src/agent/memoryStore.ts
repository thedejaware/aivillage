import type { Memory } from "@aivillage/shared";

export class InMemoryMemoryStore {
  private items: Memory[] = [];

  append(memory: Memory): void {
    this.items.push(memory);
  }

  recent(twinId: string, limit: number): Memory[] {
    return this.items.filter((m) => m.twinId === twinId).slice(-limit).reverse();
  }
}
