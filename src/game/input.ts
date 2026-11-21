// Trigger hysteresis prevents noisy analog buttons from firing repeatedly.
export class ButtonEdges {
  private held = new Set<number>();

  seed(buttons: number[]): void {
    this.held = new Set(buttons.flatMap((value, index) => value > .25 ? [index] : []));
  }

  update(buttons: number[]): number[] {
    const pressed: number[] = [];
    for (let index = 0; index < buttons.length; index++) {
      if (buttons[index] <= .25) this.held.delete(index);
      else if (buttons[index] >= .55 && !this.held.has(index)) { this.held.add(index); pressed.push(index); }
    }
    return pressed;
  }
}
