/** Monotonic during foreground use; fills OS sleep gaps only on lifecycle reconciliation. */
export class TrainingClock {
  private offset = 0;
  private monoAnchor: number;
  private wallAnchor: number;
  constructor(private mono = () => performance.now(), private wall = () => Date.now()) {
    this.monoAnchor = this.mono();
    this.wallAnchor = this.wall();
  }
  now = (): number => this.mono() + this.offset;
  checkpoint(): void {
    this.monoAnchor = this.mono();
    this.wallAnchor = this.wall();
  }
  reconcile(): number {
    const gap = (this.wall() - this.wallAnchor) - (this.mono() - this.monoAnchor);
    // Wall-clock changes cannot affect active training. A positive gap on resume
    // is assumed to be sleep; changing the system clock while hidden is ambiguous.
    if (gap > 50) this.offset += gap;
    this.checkpoint();
    return this.now();
  }
}
