import Image from "next/image";
import { ArrowUpRight, MapPin } from "lucide-react";
import styles from "./HomeLocation.module.css";

const mapsUrl = "https://www.google.com/maps?cid=4731152213097044842";
const mapEmbed = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3736.8418241534987!2d57.50753460000001!3d-20.512709499999996!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x217c65c1340e173b%3A0x41a86ddefff3db6a!2sMO%20T-SHIRT%20-%20Business%20Printing%20(Mauritius)!5e0!3m2!1sen!2smu!4v1761069000215!5m2!1sen!2smu";

export default function HomeLocation() {
  return (
    <section id="location" className={styles.section} aria-labelledby="location-title">
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}><MapPin size={16} aria-hidden="true" /> FIND US</p>
            <h2 id="location-title">Our location.</h2>
            <p className={styles.description}>Made in Mauritius. Find us in Surinam.</p>
          </div>
          <a className={styles.mapsButton} href={mapsUrl} target="_blank" rel="noopener noreferrer">
            Open Google Maps <ArrowUpRight size={20} aria-hidden="true" />
            <span className={styles.srOnly}> (opens in a new tab)</span>
          </a>
        </div>

        <div className={styles.maps}>
          <div className={styles.card}>
            <div className={styles.mapFrame}>
              <iframe
                title="MO T-SHIRT location in Surinam"
                src={mapEmbed}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <div className={styles.caption}>
              <MapPin size={20} aria-hidden="true" />
              <div>
                <h3>MO T-SHIRT</h3>
                <p>Morc Thanaody, Verger Road · Surinam 60907</p>
              </div>
            </div>
          </div>

          <figure className={styles.card}>
            <div className={styles.mapFrame}>
              <Image
                src="/on_mauritius_map.webp"
                alt="Map of Mauritius showing MO T-SHIRT in Surinam on the south coast"
                width={883}
                height={883}
                sizes="(max-width: 760px) 94vw, (max-width: 1700px) 46vw, 786px"
              />
            </div>
            <figcaption className={styles.caption}>
              <span className={styles.locationDot} aria-hidden="true" />
              <div>
                <h3>On the south coast</h3>
                <p>Surinam, Mauritius</p>
              </div>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
