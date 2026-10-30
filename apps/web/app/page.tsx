import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <h1>Zombie<br />Kampung Pisang</h1>
      <p>Pocong, toyol dan pontianak menyerang kampung. Tembak, pasang pagar buluh, letupkan tong gas. Main sendiri atau berdua pada satu papan kekunci.</p>
      <nav>
        <Link className="btn primary" href="/play">Main</Link>
        <Link className="btn" href="/leaderboard">Papan Markah</Link>
      </nav>
      <Link className="alt-link" href="/play2d">Versi 2D</Link>
    </main>
  );
}
