const MAP_EMBED =
  "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3736.8418246168653!2d57.50495967609165!3d-20.512709481010575!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f7.8!3m3!1m2!1s0x217c65c1340e173b%3A0x41a86ddefff3db6a!2sMO%20T-SHIRT%20-%20Business%20Printing%20(Mauritius)!5e0!3m2!1sen!2smu!4v1756908939206!5m2!1sen!2smu";

export default function MapCard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
      
      {/* Left: Map Embed */}
      <div className="rounded-2xl overflow-hidden shadow-sm border">
        <div className="aspect-square w-full">
          <iframe
            title="MO T-SHIRT - Business Printing (Mauritius)"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full w-full"
            allowFullScreen
            src={MAP_EMBED}
          />
        </div>
      </div>

      {/* Right: Static Image */}
      <div className="rounded-2xl overflow-hidden shadow-sm border">
        <div className="aspect-square w-full">
          <img
            src="/on_mauritius_map.png"
            alt="MO T-SHIRT on Mauritius map"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
