const INITIAL_LIVES = 3; // TODO: mover a generalConfig.playerConfig

export class CharacterHealth {
  private _lives = INITIAL_LIVES;

  get lives(): number {
    return this._lives;
  }

  get isDead(): boolean {
    return this._lives <= 0;
  }

  /** Descuenta una vida. Devuelve true si el personaje sigue vivo. */
  loseLife(): boolean {
    this._lives = Math.max(0, this._lives - 1);
    return !this.isDead;
  }
}