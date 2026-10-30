import * as Phaser from "phaser";
import { BootScene } from "./scenes/boot";
import { GameOverScene } from "./scenes/game-over";
import { GameScene } from "./scenes/game";
import { HudScene } from "./scenes/hud";
import { MapSelectScene } from "./scenes/map-select";
import { MenuScene } from "./scenes/menu";

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#05060e",
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    input: { activePointers: 3 },
    disableContextMenu: true,
    scene: [BootScene, MenuScene, MapSelectScene, GameScene, HudScene, GameOverScene],
  });
}
