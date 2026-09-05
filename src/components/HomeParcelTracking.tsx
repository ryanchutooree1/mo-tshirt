import Image from "next/image";
import { ArrowUpRight, Package } from "lucide-react";
import styles from "./HomeParcelTracking.module.css";

const trackingUrl = "https://www.mauritiuspost.mu/track-trace/";

export default function HomeParcelTracking() {
  return (
    <section id="track-parcel" className={styles.section} aria-labelledby="parcel-tracking-title">
      <div className={styles.layout}>
        <div className={styles.photo}>
          <Image
            src="/Postman.webp"
            alt="A Mauritius Post employee handing a parcel to a customer"
            width={1140}
            height={1234}
            sizes="(max-width: 760px) 94vw, 40vw"
          />
        </div>
        <div className={styles.content}>
          <div className={styles.topline}>
            <p className={styles.eyebrow}><Package size={16} aria-hidden="true" /> TRACK & TRACE</p>
            <Image src="/Postofficelogo.webp" alt="Mauritius Post" width={64} height={64} className={styles.postLogo} />
          </div>
          <h2 id="parcel-tracking-title">Track your<br />parcel.</h2>
          <p className={styles.description}>Enter your Mauritius Post tracking number.</p>
          <form action={trackingUrl} method="get" target="_blank" rel="noopener noreferrer" aria-label="Track a Mauritius Post parcel" className={styles.form}>
            <label htmlFor="parcel-tracking-number">Tracking number</label>
            <div className={styles.fields}>
              <input
                id="parcel-tracking-number"
                name="tracking_code"
                type="text"
                placeholder="e.g. RR123456785MU"
                required
                pattern={".*\\S.*"}
                title="Enter your parcel tracking number."
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-describedby="parcel-tracking-note"
              />
              <button type="submit">Track parcel <ArrowUpRight size={20} aria-hidden="true" /></button>
            </div>
            <p id="parcel-tracking-note" className={styles.note}>Results open on <a href={trackingUrl} target="_blank" rel="noopener noreferrer">Mauritius Post</a> in a new tab.</p>
          </form>
        </div>
      </div>
    </section>
  );
}
