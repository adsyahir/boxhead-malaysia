import type { Metadata } from "next";
import PhaserGame from "../../game/PhaserGame";

export const metadata: Metadata = { title: "Main (2D) | Zombie Kampung Pisang" };

export default function Play2DPage() {
  return <PhaserGame />;
}
