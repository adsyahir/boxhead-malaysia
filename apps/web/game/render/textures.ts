import type Phaser from "phaser";

type Draw = (g: Phaser.GameObjects.Graphics) => void;

function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: Draw): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/** Placeholder art: coloured boxes. Real sprites replace these through the atlas only. */
export function generatePlaceholderTextures(scene: Phaser.Scene): void {
  // Characters face +x; the nose marks the facing direction.
  const person = (body: number, head: number, accent: number): Draw => (g) => {
    g.fillStyle(body).fillRoundedRect(2, 3, 20, 18, 4);
    g.fillStyle(head).fillCircle(12, 12, 6);
    g.fillStyle(accent).fillRect(6, 9, 8, 6);
    g.fillStyle(0xffffff).fillTriangle(24, 12, 17, 8, 17, 16);
  };
  tex(scene, "abu", 26, 24, person(0x2a63c8, 0xe0b080, 0x1a1a1a)); // baju melayu biru, songkok
  tex(scene, "siti", 26, 24, person(0xe86aa8, 0xe0b080, 0xf4f4f4)); // baju kurung pink, tudung

  tex(scene, "pocong", 26, 26, (g) => {
    g.fillStyle(0xf2f2ea).fillRoundedRect(2, 2, 22, 22, 6);
    g.fillStyle(0x222222).fillCircle(17, 9, 2).fillCircle(17, 17, 2);
    g.lineStyle(2, 0x999988).strokeRoundedRect(2, 2, 22, 22, 6);
  });
  tex(scene, "toyol", 20, 20, (g) => {
    g.fillStyle(0x58b858).fillCircle(10, 10, 8);
    g.fillStyle(0x111111).fillCircle(14, 7, 2).fillCircle(14, 13, 2);
  });
  tex(scene, "pontianak", 30, 30, (g) => {
    g.fillStyle(0x151515).fillRoundedRect(1, 3, 26, 24, 6);
    g.fillStyle(0xe8e0d8).fillRoundedRect(5, 7, 18, 16, 5);
    g.fillStyle(0xd02020).fillCircle(20, 11, 2.5).fillCircle(20, 19, 2.5);
  });

  tex(scene, "bullet", 8, 8, (g) => g.fillStyle(0xffe070).fillCircle(4, 4, 3));
  tex(scene, "pellet", 6, 6, (g) => g.fillStyle(0xffffff).fillCircle(3, 3, 2));
  tex(scene, "rocket", 18, 8, (g) => {
    g.fillStyle(0xc89040).fillRect(0, 2, 14, 4);
    g.fillStyle(0xff6020).fillTriangle(18, 4, 13, 0, 13, 8);
  });
  tex(scene, "fireball", 16, 16, (g) => {
    g.fillStyle(0xff4010, 0.5).fillCircle(8, 8, 8);
    g.fillStyle(0xffa030).fillCircle(8, 8, 5);
    g.fillStyle(0xfff0a0).fillCircle(8, 8, 2.5);
  });
  tex(scene, "grenade", 12, 12, (g) => {
    g.fillStyle(0x6a7a5a).fillCircle(6, 6, 5);
    g.fillStyle(0xd0d0d0).fillRect(5, 0, 2, 3);
  });

  tex(scene, "barricade", 30, 30, (g) => {
    g.fillStyle(0x6a4a28).fillRect(1, 1, 28, 28);
    g.fillStyle(0x9a7040);
    for (let i = 3; i < 28; i += 6) g.fillRect(i, 1, 4, 28);
    g.lineStyle(2, 0x3a2810).strokeRect(1, 1, 28, 28);
  });
  tex(scene, "barrel", 26, 26, (g) => {
    g.fillStyle(0xc02820).fillCircle(13, 13, 11);
    g.fillStyle(0xe8d020).fillRect(4, 11, 18, 4);
    g.lineStyle(2, 0x601008).strokeCircle(13, 13, 11);
  });
  tex(scene, "mine", 18, 18, (g) => {
    g.fillStyle(0x303038).fillCircle(9, 9, 8);
    g.fillStyle(0xff3030).fillCircle(9, 9, 2.5);
  });
  tex(scene, "ketupat", 20, 20, (g) => {
    g.fillStyle(0x58b040).fillTriangle(10, 1, 19, 10, 10, 19).fillTriangle(10, 1, 1, 10, 10, 19);
    g.lineStyle(1, 0x2a6020).strokeTriangle(10, 1, 19, 10, 10, 19).strokeTriangle(10, 1, 1, 10, 10, 19);
  });
  tex(scene, "ammo", 20, 20, (g) => {
    g.fillStyle(0xd8c030).fillRoundedRect(1, 3, 18, 14, 3);
    g.fillStyle(0x333333).fillRect(5, 8, 10, 4);
  });
  tex(scene, "crate", 24, 24, (g) => {
    g.fillStyle(0x9a7040).fillRect(1, 1, 22, 22);
    g.lineStyle(2, 0xffe070).strokeRect(1, 1, 22, 22).lineBetween(1, 1, 23, 23).lineBetween(23, 1, 1, 23);
  });

  tex(scene, "shadow", 28, 14, (g) => g.fillStyle(0x000000, 0.35).fillEllipse(14, 7, 26, 12));
  tex(scene, "spark", 6, 6, (g) => g.fillStyle(0xffffff).fillCircle(3, 3, 3));

  if (!scene.textures.exists("light")) {
    const size = 256;
    const canvas = scene.textures.createCanvas("light", size, size);
    if (canvas) {
      const ctx = canvas.getContext();
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.45, "rgba(255,255,255,0.75)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      canvas.refresh();
    }
  }
}
