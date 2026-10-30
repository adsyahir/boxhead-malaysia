import Link from "next/link";

export const metadata = { title: "Papan Markah | Zombie Kampung Pisang" };

export default function LeaderboardPage() {
  return (
    <main className="page">
      <h1>Papan Markah</h1>
      <p>Papan markah dalam talian akan datang.</p>
      <Link className="btn" href="/">Kembali</Link>
    </main>
  );
}
