export interface IWeaponController {
  tick(dt: number): void;
  dispose(): void;
}