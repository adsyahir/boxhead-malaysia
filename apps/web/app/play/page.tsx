import type { Metadata } from "next";
import Game3D from "../../game3d/Game3D";

export const metadata: Metadata = { title: "Main | Hantu Kampung Pisang" };

export default function PlayPage() {
  return <Game3D />;
}
